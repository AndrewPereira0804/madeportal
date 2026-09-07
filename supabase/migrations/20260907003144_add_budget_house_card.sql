-- Demo rollout only. Production requires separate explicit approval.
alter table public.budget_transactions
  add column is_house_card boolean not null default false;

alter table public.budget_transactions
  add constraint budget_transactions_house_card_not_reimbursed
  check (not is_house_card or status <> 'reimbursed');

comment on column public.budget_transactions.is_house_card is
  'Paid with the House Card; counts toward budget spending but cannot be reimbursed.';

notify pgrst, 'reload schema';
