-- Application users may edit/delete submitted expenses. Approval freezes the
-- financial details; budget managers can reimburse or void an approved expense.
-- Reimbursed, voided, and legacy denied records are retained and locked.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.budget_transactions
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN voided_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN void_reason text;

ALTER TABLE public.budget_transactions
  DROP CONSTRAINT budget_transactions_status_check,
  ADD CONSTRAINT budget_transactions_status_check
    CHECK (status IN ('submitted', 'approved', 'denied', 'reimbursed', 'voided')),
  ADD CONSTRAINT budget_transactions_void_metadata_check CHECK (
    (status = 'voided' AND voided_at IS NOT NULL AND nullif(btrim(void_reason), '') IS NOT NULL)
    OR (status <> 'voided' AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
  );
CREATE INDEX budget_transactions_voided_by_idx ON public.budget_transactions(voided_by);

-- Referential cascades bypass row filters. Require explicit removal of children
-- so deleting an account or cycle cannot silently erase retained expenses.
ALTER TABLE public.budget_transactions
  DROP CONSTRAINT budget_transactions_budget_account_id_fkey,
  ADD CONSTRAINT budget_transactions_budget_account_id_fkey
    FOREIGN KEY (budget_account_id) REFERENCES public.budget_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.budget_accounts
  DROP CONSTRAINT budget_accounts_cycle_id_fkey,
  ADD CONSTRAINT budget_accounts_cycle_id_fkey
    FOREIGN KEY (cycle_id) REFERENCES public.budget_cycles(id) ON DELETE RESTRICT;

CREATE FUNCTION private.guard_budget_transaction_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $guard$
DECLARE
  manager boolean;
BEGIN
  -- Explicit maintenance/fictional demo resets use privileged server identities.
  -- Application admins still use authenticated and are fully subject to this guard.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;
  manager := private.is_budget_manager();
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'submitted' THEN
      RAISE EXCEPTION 'Only submitted expenses can be deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'submitted' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
      OR NEW.voided_by IS NOT NULL OR NEW.voided_at IS NOT NULL OR NEW.void_reason IS NOT NULL
      OR NEW.denial_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New expenses must be submitted without approval or void metadata' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.budget_account_id, NEW.submitted_by, NEW.created_at)
    IS DISTINCT FROM (OLD.id, OLD.budget_account_id, OLD.submitted_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Expense identity and ownership cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF (NEW.approved_by, NEW.approved_at, NEW.voided_by, NEW.voided_at, NEW.denial_reason)
    IS DISTINCT FROM (OLD.approved_by, OLD.approved_at, OLD.voided_by, OLD.voided_at, OLD.denial_reason) THEN
    RAISE EXCEPTION 'Expense audit fields cannot be changed directly' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'submitted' AND NEW.status = 'submitted' THEN
    IF NEW.void_reason IS NOT NULL THEN RAISE EXCEPTION 'Only voided expenses have a void reason'; END IF;
  ELSIF OLD.status = 'submitted' AND NEW.status = 'approved' AND manager THEN
    IF (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
      RAISE EXCEPTION 'Save expense edits before approving it' USING ERRCODE = '42501';
    END IF;
    NEW.approved_by := auth.uid();
    NEW.approved_at := clock_timestamp();
  ELSIF OLD.status = 'approved' AND manager AND NEW.status IN ('reimbursed', 'voided') THEN
    IF (to_jsonb(NEW) - ARRAY['status', 'void_reason', 'updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'void_reason', 'updated_at']) THEN
      RAISE EXCEPTION 'Approved expense details are locked' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'reimbursed' THEN
      IF OLD.is_house_card THEN RAISE EXCEPTION 'House Card expenses cannot be reimbursed'; END IF;
      IF NEW.void_reason IS NOT NULL THEN RAISE EXCEPTION 'Only voided expenses have a void reason'; END IF;
    ELSE
      NEW.void_reason := nullif(btrim(NEW.void_reason), '');
      IF NEW.void_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to void an expense'; END IF;
      NEW.voided_by := auth.uid();
      NEW.voided_at := clock_timestamp();
    END IF;
  ELSE
    RAISE EXCEPTION 'Expense is locked or this status transition is not permitted' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION private.guard_budget_transaction_lifecycle() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_budget_transaction_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.budget_transactions
  FOR EACH ROW EXECUTE FUNCTION private.guard_budget_transaction_lifecycle();

DROP POLICY "Budget managers can update budget transactions" ON public.budget_transactions;
CREATE POLICY "Submitters and managers can update permitted expenses" ON public.budget_transactions
  FOR UPDATE TO authenticated
  USING (private.is_budget_manager() OR
    (status = 'submitted' AND submitted_by = (SELECT auth.uid()) AND private.current_user_is_active()))
  WITH CHECK (private.is_budget_manager() OR
    (status = 'submitted' AND submitted_by = (SELECT auth.uid()) AND private.current_user_is_active()));

DROP POLICY "Budget managers can delete budget transactions" ON public.budget_transactions;
CREATE POLICY "Submitters and managers can delete submitted expenses" ON public.budget_transactions
  FOR DELETE TO authenticated USING (
    status = 'submitted' AND private.current_user_is_active()
    AND (submitted_by = (SELECT auth.uid()) OR private.is_budget_manager())
  );

DROP POLICY "Users can view accessible budget transactions" ON public.budget_transactions;
CREATE POLICY "Users can view accessible budget transactions" ON public.budget_transactions
  FOR SELECT TO authenticated USING (
    private.can_access_budget_account(budget_account_id)
    OR (status = 'submitted' AND submitted_by = (SELECT auth.uid()) AND private.current_user_is_active())
  );

REVOKE INSERT, UPDATE ON public.budget_transactions FROM authenticated;
GRANT INSERT (budget_account_id, submitted_by, amount, vendor, category,
  description, transaction_date, is_house_card, receipt_url, status)
  ON public.budget_transactions TO authenticated;
GRANT UPDATE (amount, vendor, category, description, transaction_date,
  is_house_card, receipt_url, status, void_reason)
  ON public.budget_transactions TO authenticated;
NOTIFY pgrst, 'reload schema';
