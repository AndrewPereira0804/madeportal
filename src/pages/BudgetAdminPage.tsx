import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { canManageBudgets } from "../auth/roleAccess";
import { useAuth } from "../auth/authContext";
import useRoles from "../auth/useRoles";
import BudgetStatusBadge from "../components/budget/BudgetStatusBadge";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  PageHeader,
  SectionHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from "../components/ui";
import {
  calculateBudgetSummary,
  formatMoney,
  type BudgetAccount,
  type BudgetCycle,
  type BudgetRole,
  type BudgetTransaction,
} from "../lib/budget";
import {
  approveBudgetTransaction,
  createBudgetAccount,
  createBudgetCycle,
  deleteBudgetAccount,
  denyBudgetTransaction,
  getAllBudgetCycles,
  getBudgetAccountsByIds,
  getBudgetAccountsForCycle,
  getBudgetTransactionsByStatus,
  getRoles,
  getSubmitterProfilesByIds,
  getTransactionsForAccounts,
  markBudgetTransactionReimbursed,
  setActiveBudgetCycle,
  type BudgetSubmitterProfile,
  updateBudgetAccount,
} from "../lib/budgetQueries";

type BudgetAdminRow = {
  transaction: BudgetTransaction;
  account: BudgetAccount | null;
  cycle: BudgetCycle | null;
  submitter: BudgetSubmitterProfile | null;
};

type CycleDraft = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type AccountDraft = {
  roleSlug: string;
  allocatedAmount: string;
  notes: string;
};

type AccountEditDraft = {
  allocatedAmount: string;
  notes: string;
};

export type BudgetAdminMode = "all" | "requests" | "reimbursements" | "history" | "cycles" | "allocations";

type BudgetAdminPageProps = {
  mode?: BudgetAdminMode;
  returnPath?: string;
};

const emptyCycleDraft: CycleDraft = {
  name: "",
  startDate: "",
  endDate: "",
  isActive: false,
};

const emptyAccountDraft: AccountDraft = {
  roleSlug: "",
  allocatedAmount: "",
  notes: "",
};

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleString(
    "en-US",
    includeTime
      ? {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      : {
          month: "short",
          day: "numeric",
          year: "numeric",
        }
  );
}

function roleLabel(roleSlug: string, roles: BudgetRole[]) {
  return roles.find((role) => role.slug === roleSlug)?.name ?? roleSlug;
}

function accountLabel(account: BudgetAccount | null, accountId: string, roles: BudgetRole[]) {
  if (!account) {
    return accountId;
  }

  const label = roleLabel(account.role_slug, roles);
  return account.notes ? `${label} - ${account.notes}` : label;
}

function submitterLabel(profile: BudgetSubmitterProfile | null, submittedBy: string | null) {
  if (profile?.name && profile.email) {
    return `${profile.name} (${profile.email})`;
  }

  return profile?.name ?? profile?.email ?? submittedBy ?? "Unknown submitter";
}

function validateCycleDraft(draft: CycleDraft) {
  if (!draft.name.trim()) {
    return "Cycle name is required.";
  }

  if (!draft.startDate) {
    return "Start date is required.";
  }

  if (!draft.endDate) {
    return "End date is required.";
  }

  if (new Date(draft.endDate) <= new Date(draft.startDate)) {
    return "End date must be after start date.";
  }

  return null;
}

function validateAccountDraft(draft: AccountDraft | AccountEditDraft, roleSlug?: string) {
  if (roleSlug !== undefined && !roleSlug) {
    return "Role is required.";
  }

  const amount = Number(draft.allocatedAmount);
  if (!draft.allocatedAmount.trim() || !Number.isFinite(amount) || amount < 0) {
    return "Allocated amount must be 0 or greater.";
  }

  return null;
}

function getModeHeader(mode: BudgetAdminMode) {
  switch (mode) {
    case "requests":
      return {
        title: "Expense Requests",
        subtitle: "Review submitted budget requests and approve or deny them.",
      };
    case "reimbursements":
      return {
        title: "Reimbursements",
        subtitle: "Mark approved expenses as reimbursed after payout.",
      };
    case "history":
      return {
        title: "Expense History",
        subtitle: "Review approved expenses from every budget cycle, including House Card purchases and reimbursements.",
      };
    case "cycles":
      return {
        title: "Budget Cycles",
        subtitle: "Create budget cycles and choose the active cycle.",
      };
    case "allocations":
      return {
        title: "Budget Allocations",
        subtitle: "Create, edit, and review active-cycle chair budget accounts.",
      };
    default:
      return {
        title: "Treasurer Budget Tools",
        subtitle: "Review requests, reimburse approved expenses, and manage budget setup.",
      };
  }
}

export default function BudgetAdminPage({
  mode = "all",
  returnPath = "/app/tools/treasurer",
}: BudgetAdminPageProps = {}) {
  const { session } = useAuth();
  const { roles: userRoles, loading: rolesLoading } = useRoles();
  const [pendingRows, setPendingRows] = useState<BudgetAdminRow[]>([]);
  const [approvedRows, setApprovedRows] = useState<BudgetAdminRow[]>([]);
  const [historyRows, setHistoryRows] = useState<BudgetAdminRow[]>([]);
  const [cycles, setCycles] = useState<BudgetCycle[]>([]);
  const [roles, setRoles] = useState<BudgetRole[]>([]);
  const [activeAccounts, setActiveAccounts] = useState<BudgetAccount[]>([]);
  const [activeAccountTransactions, setActiveAccountTransactions] = useState<BudgetTransaction[]>([]);
  const [cycleDraft, setCycleDraft] = useState<CycleDraft>(emptyCycleDraft);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountEditDraft, setAccountEditDraft] = useState<AccountEditDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasBudgetAccess = canManageBudgets(userRoles);
  const activeCycle = cycles.find((cycle) => cycle.is_active) ?? null;
  const modeHeader = getModeHeader(mode);
  const showRequestReview = mode === "all" || mode === "requests";
  const showReimbursements = mode === "all" || mode === "reimbursements";
  const showHistory = mode === "all" || mode === "history";
  const showCycles = mode === "all" || mode === "cycles";
  const showAllocations = mode === "all" || mode === "allocations";
  const showMetrics = showRequestReview || showReimbursements;

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [requestTransactions, historyTransactions, nextCycles, nextRoles] = await Promise.all([
        getBudgetTransactionsByStatus(["submitted", "approved"]),
        showHistory ? getBudgetTransactionsByStatus(["approved", "reimbursed"]) : Promise.resolve([]),
        getAllBudgetCycles(),
        getRoles(),
      ]);

      const visibleTransactions = [...requestTransactions, ...historyTransactions];
      const active = nextCycles.find((cycle) => cycle.is_active) ?? null;
      const nextActiveAccounts = active ? await getBudgetAccountsForCycle(active.id) : [];
      const [requestAccounts, submitters, nextAccountTransactions] = await Promise.all([
        getBudgetAccountsByIds(uniqueStrings(visibleTransactions.map((transaction) => transaction.budget_account_id))),
        getSubmitterProfilesByIds(uniqueStrings(visibleTransactions.map((transaction) => transaction.submitted_by))),
        getTransactionsForAccounts(nextActiveAccounts.map((account) => account.id)),
      ]);

      const requestAccountsById = new Map(requestAccounts.map((account) => [account.id, account]));
      const cyclesById = new Map(nextCycles.map((cycle) => [cycle.id, cycle]));
      const submittersById = new Map(submitters.map((submitter) => [submitter.user_id, submitter]));
      const toAdminRow = (transaction: BudgetTransaction): BudgetAdminRow => {
        const account = requestAccountsById.get(transaction.budget_account_id) ?? null;
        return {
          transaction,
          account,
          cycle: account ? cyclesById.get(account.cycle_id) ?? null : null,
          submitter: transaction.submitted_by ? submittersById.get(transaction.submitted_by) ?? null : null,
        };
      };
      const rows = requestTransactions.map(toAdminRow);

      setPendingRows(rows.filter((row) => row.transaction.status === "submitted"));
      setApprovedRows(rows.filter((row) => row.transaction.status === "approved" && !row.transaction.is_house_card));
      setHistoryRows(historyTransactions.map(toAdminRow));
      setCycles(nextCycles);
      setRoles(nextRoles);
      setActiveAccounts(nextActiveAccounts);
      setActiveAccountTransactions(nextAccountTransactions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setPendingRows([]);
      setApprovedRows([]);
      setHistoryRows([]);
      setCycles([]);
      setRoles([]);
      setActiveAccounts([]);
      setActiveAccountTransactions([]);
      setErrorMessage(`Could not load budget admin data: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [showHistory]);

  useEffect(() => {
    if (rolesLoading || !hasBudgetAccess) {
      return;
    }

    void loadAdminData();
  }, [hasBudgetAccess, loadAdminData, rolesLoading]);

  const totals = useMemo(
    () => ({
      pending: pendingRows.reduce((total, row) => total + row.transaction.amount, 0),
      approved: approvedRows.reduce((total, row) => total + row.transaction.amount, 0),
    }),
    [approvedRows, pendingRows]
  );

  const usedRoleSlugs = useMemo(() => new Set(activeAccounts.map((account) => account.role_slug)), [activeAccounts]);
  const availableRoles = useMemo(
    () => roles.filter((role) => !usedRoleSlugs.has(role.slug)),
    [roles, usedRoleSlugs]
  );

  async function runAction(actionKey: string, action: () => Promise<void>, success: string) {
    setSavingKey(actionKey);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await action();
      setSuccessMessage(success);
      await loadAdminData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setErrorMessage(message);
    } finally {
      setSavingKey(null);
    }
  }

  function approveRequest(transactionId: string) {
    const userId = session?.user?.id;
    if (!userId) {
      setErrorMessage("You must be signed in to approve a request.");
      return;
    }

    void runAction(
      `approve-${transactionId}`,
      () => approveBudgetTransaction(transactionId, userId),
      "Expense request approved."
    );
  }

  function denyRequest(transactionId: string) {
    const userId = session?.user?.id;
    if (!userId) {
      setErrorMessage("You must be signed in to deny a request.");
      return;
    }

    if (!window.confirm("Deny this pending expense request? The request will be removed from the transaction records.")) {
      return;
    }

    void runAction(
      `deny-${transactionId}`,
      () => denyBudgetTransaction(transactionId),
      "Expense request denied and removed."
    );
  }

  function markReimbursed(transactionId: string) {
    void runAction(
      `reimburse-${transactionId}`,
      () => markBudgetTransactionReimbursed(transactionId),
      "Expense marked reimbursed."
    );
  }

  function handleCreateCycle() {
    const userId = session?.user?.id;
    if (!userId) {
      setErrorMessage("You must be signed in to create a budget cycle.");
      return;
    }

    const validationError = validateCycleDraft(cycleDraft);
    if (validationError) {
      setErrorMessage(validationError);
      setSuccessMessage(null);
      return;
    }

    void runAction(
      "create-cycle",
      async () => {
        await createBudgetCycle({
          name: cycleDraft.name.trim(),
          start_date: cycleDraft.startDate,
          end_date: cycleDraft.endDate,
          is_active: cycleDraft.isActive,
          created_by: userId,
        });
        setCycleDraft(emptyCycleDraft);
      },
      "Budget cycle created."
    );
  }

  function handleSetActiveCycle(cycleId: string) {
    void runAction("set-active-cycle", () => setActiveBudgetCycle(cycleId), "Active budget cycle updated.");
  }

  function handleCreateAccount() {
    const userId = session?.user?.id;
    if (!userId) {
      setErrorMessage("You must be signed in to create a budget account.");
      return;
    }

    if (!activeCycle) {
      setErrorMessage("No active budget cycle is available.");
      return;
    }

    if (usedRoleSlugs.has(accountDraft.roleSlug)) {
      setErrorMessage("That role already has a budget account for the active cycle.");
      setSuccessMessage(null);
      return;
    }

    const validationError = validateAccountDraft(accountDraft, accountDraft.roleSlug);
    if (validationError) {
      setErrorMessage(validationError);
      setSuccessMessage(null);
      return;
    }

    void runAction(
      "create-account",
      async () => {
        await createBudgetAccount({
          cycle_id: activeCycle.id,
          role_slug: accountDraft.roleSlug,
          allocated_amount: Number(accountDraft.allocatedAmount),
          notes: toNullableText(accountDraft.notes),
          created_by: userId,
        });
        setAccountDraft(emptyAccountDraft);
      },
      "Budget account created."
    );
  }

  function startEditingAccount(account: BudgetAccount) {
    setEditingAccountId(account.id);
    setAccountEditDraft({
      allocatedAmount: String(account.allocated_amount),
      notes: account.notes ?? "",
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function cancelEditingAccount() {
    setEditingAccountId(null);
    setAccountEditDraft(null);
  }

  function handleSaveAccount(accountId: string) {
    if (!accountEditDraft) {
      return;
    }

    const validationError = validateAccountDraft(accountEditDraft);
    if (validationError) {
      setErrorMessage(validationError);
      setSuccessMessage(null);
      return;
    }

    void runAction(
      `save-account-${accountId}`,
      async () => {
        await updateBudgetAccount(accountId, {
          allocated_amount: Number(accountEditDraft.allocatedAmount),
          notes: toNullableText(accountEditDraft.notes),
        });
        cancelEditingAccount();
      },
      "Budget allocation updated."
    );
  }

  function handleDeleteAccount(account: BudgetAccount) {
    const transactionCount = activeAccountTransactions.filter(
      (transaction) => transaction.budget_account_id === account.id
    ).length;

    if (transactionCount > 0) {
      setErrorMessage("Cannot delete budget accounts with transactions.");
      setSuccessMessage(null);
      return;
    }

    if (!window.confirm(`Delete the budget account for ${roleLabel(account.role_slug, roles)}?`)) {
      return;
    }

    void runAction(
      `delete-account-${account.id}`,
      () => deleteBudgetAccount(account.id),
      "Budget account deleted."
    );
  }

  if (rolesLoading) {
    return (
      <Card className="budget-page">
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget admin...</span>
        </div>
      </Card>
    );
  }

  if (!hasBudgetAccess) {
    return <Navigate to="/app/tools" replace />;
  }

  if (loading) {
    return (
      <Card className="budget-page">
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget admin...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="budget-page">
      <PageHeader
        eyebrow="Treasurer tools"
        title={modeHeader.title}
        subtitle={modeHeader.subtitle}
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">Treasurer Tools</Button>}
      />

      {errorMessage && <div className="alert alert-danger budget-alert">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success budget-alert">{successMessage}</div>}

      {showMetrics && (
        <BudgetAdminMetrics pendingCount={pendingRows.length} pendingTotal={totals.pending} approvedCount={approvedRows.length} approvedTotal={totals.approved} />
      )}

      {showRequestReview && (
        <BudgetRequestSection
          title="Pending Requests"
          emptyText="No pending requests."
          rows={pendingRows}
          roles={roles}
          savingKey={savingKey}
          actions={(transaction) => (
            <>
              <Button
                type="button"
                size="sm"
                loading={savingKey === `approve-${transaction.id}`}
                disabled={savingKey === `approve-${transaction.id}`}
                onClick={() => approveRequest(transaction.id)}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={savingKey === `deny-${transaction.id}`}
                disabled={savingKey === `deny-${transaction.id}`}
                onClick={() => denyRequest(transaction.id)}
              >
                Deny
              </Button>
            </>
          )}
        />
      )}

      {showReimbursements && (
        <BudgetRequestSection
          title="Approved, Not Yet Reimbursed"
          emptyText="No approved unreimbursed expenses."
          rows={approvedRows}
          roles={roles}
          savingKey={savingKey}
          actions={(transaction) => (
            <Button
              type="button"
              size="sm"
              loading={savingKey === `reimburse-${transaction.id}`}
              disabled={savingKey === `reimburse-${transaction.id}`}
              onClick={() => markReimbursed(transaction.id)}
            >
              Mark Reimbursed
            </Button>
          )}
        />
      )}

      {showHistory && (
        <BudgetRequestSection
          title="Saved Expenses"
          description="Approved expenses stay in history before and after reimbursement. House Card purchases are included; denied requests are removed."
          emptyText="No approved expenses yet."
          rows={historyRows}
          roles={roles}
          savingKey={savingKey}
        />
      )}

      {showCycles && (
        <BudgetCyclesSection
          cycles={cycles}
          draft={cycleDraft}
          savingKey={savingKey}
          onDraftChange={setCycleDraft}
          onCreate={handleCreateCycle}
          onSetActive={handleSetActiveCycle}
        />
      )}

      {showAllocations && (
        <>
          <ActiveCycleAccountsSection
            activeCycle={activeCycle}
            accounts={activeAccounts}
            transactions={activeAccountTransactions}
            roles={roles}
            savingKey={savingKey}
            editingAccountId={editingAccountId}
            editDraft={accountEditDraft}
            onStartEdit={startEditingAccount}
            onCancelEdit={cancelEditingAccount}
            onEditDraftChange={setAccountEditDraft}
            onSave={handleSaveAccount}
            onDelete={handleDeleteAccount}
          />

          <CreateBudgetAccountSection
            activeCycle={activeCycle}
            roles={roles}
            availableRoles={availableRoles}
            draft={accountDraft}
            savingKey={savingKey}
            onDraftChange={setAccountDraft}
            onCreate={handleCreateAccount}
          />
        </>
      )}
    </Card>
  );
}

function BudgetAdminMetrics({
  pendingCount,
  pendingTotal,
  approvedCount,
  approvedTotal,
}: {
  pendingCount: number;
  pendingTotal: number;
  approvedCount: number;
  approvedTotal: number;
}) {
  return (
    <div className="budget-admin-metrics">
      <MetricCard label="Pending requests" value={pendingCount} detail={formatMoney(pendingTotal)} tone="warning" />
      <MetricCard
        label="Approved, not reimbursed"
        value={approvedCount}
        detail={formatMoney(approvedTotal)}
        tone="info"
      />
    </div>
  );
}

function BudgetRequestSection({
  title,
  description,
  emptyText,
  rows,
  roles,
  savingKey,
  actions,
}: {
  title: string;
  description?: string;
  emptyText: string;
  rows: BudgetAdminRow[];
  roles: BudgetRole[];
  savingKey: string | null;
  actions?: (transaction: BudgetTransaction) => ReactNode;
}) {
  return (
    <section className="budget-admin-section">
      <SectionHeader title={title} description={description} size="md" />

      {rows.length === 0 ? (
        <EmptyState compact title={emptyText} />
      ) : (
        <div className="budget-admin-list">
          {rows.map(({ transaction, account, cycle, submitter }) => (
            <Card
              key={transaction.id}
              variant="flat"
              padding="md"
              className={`budget-request-card${transaction.status === "submitted" ? " budget-request-card--pending" : ""}`}
            >
              <div className="budget-request-main">
                <div>
                  <div className="budget-request-amount">{formatMoney(transaction.amount)}</div>
                  <div className="budget-request-account">
                    {accountLabel(account, transaction.budget_account_id, roles)}
                  </div>
                </div>
                <BudgetStatusBadge status={transaction.status} />
              </div>

              <dl className="budget-request-details">
                <div>
                  <dt>Payment</dt>
                  <dd>
                    {transaction.is_house_card
                      ? "House Card — no reimbursement"
                      : transaction.status === "reimbursed"
                        ? "Personal — reimbursed"
                        : "Personal — reimbursement requested"}
                  </dd>
                </div>
                <div>
                  <dt>Budget cycle</dt>
                  <dd>{cycle?.name ?? account?.cycle_id ?? "Unknown cycle"}</dd>
                </div>
                <div>
                  <dt>Submitted by</dt>
                  <dd>{submitterLabel(submitter, transaction.submitted_by)}</dd>
                </div>
                <div>
                  <dt>Vendor</dt>
                  <dd>{transaction.vendor ?? "No vendor"}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{transaction.category ?? "Uncategorized"}</dd>
                </div>
                <div>
                  <dt>Transaction date</dt>
                  <dd>{formatDate(transaction.transaction_date)}</dd>
                </div>
                <div>
                  <dt>Submitted at</dt>
                  <dd>{formatDate(transaction.created_at, true)}</dd>
                </div>
                <div className="budget-request-description">
                  <dt>Description</dt>
                  <dd>{transaction.description ?? "No description provided."}</dd>
                </div>
              </dl>

              {actions && (
                <div className="budget-request-actions">
                  {savingKey?.endsWith(transaction.id) && <span className="budget-admin-saving">Saving...</span>}
                  {actions(transaction)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function BudgetCyclesSection({
  cycles,
  draft,
  savingKey,
  onDraftChange,
  onCreate,
  onSetActive,
}: {
  cycles: BudgetCycle[];
  draft: CycleDraft;
  savingKey: string | null;
  onDraftChange: (draft: CycleDraft) => void;
  onCreate: () => void;
  onSetActive: (cycleId: string) => void;
}) {
  return (
    <section className="budget-admin-section">
      <SectionHeader title="Budget Cycles" size="md" />

      <Card variant="flat" padding="md" className="budget-management-form">
        <div className="budget-form-grid">
          <Input
            id="cycleName"
            label="Name"
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            disabled={savingKey === "create-cycle"}
          />
          <Input
            id="cycleStart"
            label="Start date"
            type="date"
            value={draft.startDate}
            onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })}
            disabled={savingKey === "create-cycle"}
          />
          <Input
            id="cycleEnd"
            label="End date"
            type="date"
            value={draft.endDate}
            onChange={(event) => onDraftChange({ ...draft, endDate: event.target.value })}
            disabled={savingKey === "create-cycle"}
          />
          <label className="budget-checkbox-option">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => onDraftChange({ ...draft, isActive: event.target.checked })}
              disabled={savingKey === "create-cycle"}
            />
            Set active immediately
          </label>
        </div>
        <Button
          type="button"
          onClick={onCreate}
          loading={savingKey === "create-cycle"}
          disabled={savingKey === "create-cycle"}
        >
          {savingKey === "create-cycle" ? "Creating..." : "Create cycle"}
        </Button>
      </Card>

      {cycles.length === 0 ? (
        <EmptyState compact title="No budget cycles are available." />
      ) : (
        <Table minWidth={720} className="budget-table-wrap">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Start</TableHeaderCell>
              <TableHeaderCell>End</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cycles.map((cycle) => (
              <TableRow key={cycle.id}>
                <TableCell>
                  <strong>{cycle.name ?? "Untitled cycle"}</strong>
                </TableCell>
                <TableCell>{cycle.start_date ?? "No start date"}</TableCell>
                <TableCell>{cycle.end_date ?? "No end date"}</TableCell>
                <TableCell>
                  {cycle.is_active ? (
                    <Badge variant="active">Active</Badge>
                  ) : (
                    <Badge variant="neutral">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!cycle.is_active && (
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      loading={savingKey === "set-active-cycle"}
                      disabled={savingKey === "set-active-cycle"}
                      onClick={() => onSetActive(cycle.id)}
                    >
                      Set Active
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function ActiveCycleAccountsSection({
  activeCycle,
  accounts,
  transactions,
  roles,
  savingKey,
  editingAccountId,
  editDraft,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSave,
  onDelete,
}: {
  activeCycle: BudgetCycle | null;
  accounts: BudgetAccount[];
  transactions: BudgetTransaction[];
  roles: BudgetRole[];
  savingKey: string | null;
  editingAccountId: string | null;
  editDraft: AccountEditDraft | null;
  onStartEdit: (account: BudgetAccount) => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: AccountEditDraft) => void;
  onSave: (accountId: string) => void;
  onDelete: (account: BudgetAccount) => void;
}) {
  return (
    <section className="budget-admin-section">
      <SectionHeader
        title="Active Cycle Budget Accounts"
        description={activeCycle ? activeCycle.name ?? "Active cycle" : "No active budget cycle"}
      />

      {!activeCycle ? (
        <EmptyState compact title="No active budget cycle." />
      ) : accounts.length === 0 ? (
        <EmptyState compact title="No budget accounts for active cycle." />
      ) : (
        <Table minWidth={980} className="budget-table-wrap">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Role / Chair</TableHeaderCell>
              <TableHeaderCell>Role slug</TableHeaderCell>
              <TableHeaderCell>Allocated</TableHeaderCell>
              <TableHeaderCell>Approved / reimbursed</TableHeaderCell>
              <TableHeaderCell>Pending</TableHeaderCell>
              <TableHeaderCell>Remaining</TableHeaderCell>
              <TableHeaderCell>Notes</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((account) => {
              const accountTransactions = transactions.filter(
                (transaction) => transaction.budget_account_id === account.id
              );
              const summary = calculateBudgetSummary([account], accountTransactions);
              const transactionCount = accountTransactions.length;
              const isEditing = editingAccountId === account.id && editDraft;

              return (
                <TableRow key={account.id}>
                  <TableCell>{roleLabel(account.role_slug, roles)}</TableCell>
                  <TableCell>{account.role_slug}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <input
                        className="form-control ui-input budget-amount-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editDraft.allocatedAmount}
                        onChange={(event) => onEditDraftChange({ ...editDraft, allocatedAmount: event.target.value })}
                        disabled={savingKey === `save-account-${account.id}`}
                      />
                    ) : (
                      formatMoney(summary.allocated)
                    )}
                  </TableCell>
                  <TableCell>{formatMoney(summary.spent)}</TableCell>
                  <TableCell>{formatMoney(summary.pending)}</TableCell>
                  <TableCell className={summary.remaining < 0 ? "budget-remaining--negative" : "budget-remaining"}>
                    {formatMoney(summary.remaining)}
                  </TableCell>
                  <TableCell className="budget-notes-cell">
                    {isEditing ? (
                      <textarea
                        className="form-control ui-textarea"
                        rows={2}
                        value={editDraft.notes}
                        onChange={(event) => onEditDraftChange({ ...editDraft, notes: event.target.value })}
                        disabled={savingKey === `save-account-${account.id}`}
                      />
                    ) : (
                      account.notes ?? "No notes"
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="budget-row-actions">
                        <Button
                          type="button"
                          size="sm"
                          loading={savingKey === `save-account-${account.id}`}
                          disabled={savingKey === `save-account-${account.id}`}
                          onClick={() => onSave(account.id)}
                        >
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="outline-secondary" onClick={onCancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="budget-row-actions">
                        <Button type="button" size="sm" variant="outline-secondary" onClick={() => onStartEdit(account)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => onDelete(account)}
                          disabled={transactionCount > 0 || savingKey === `delete-account-${account.id}`}
                          title={transactionCount > 0 ? "Cannot delete budget accounts with transactions." : undefined}
                        >
                          Delete
                        </Button>
                        {transactionCount > 0 && (
                          <div className="budget-table-meta">Cannot delete budget accounts with transactions.</div>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function CreateBudgetAccountSection({
  activeCycle,
  roles,
  availableRoles,
  draft,
  savingKey,
  onDraftChange,
  onCreate,
}: {
  activeCycle: BudgetCycle | null;
  roles: BudgetRole[];
  availableRoles: BudgetRole[];
  draft: AccountDraft;
  savingKey: string | null;
  onDraftChange: (draft: AccountDraft) => void;
  onCreate: () => void;
}) {
  return (
    <section className="budget-admin-section">
      <SectionHeader title="Create Budget Account" size="md" />

      {!activeCycle ? (
        <EmptyState compact title="No active budget cycle." />
      ) : roles.length === 0 ? (
        <EmptyState compact title="No roles available." />
      ) : availableRoles.length === 0 ? (
        <EmptyState
          compact
          title="All roles assigned"
          description="Every visible role already has a budget account for this cycle."
        />
      ) : (
        <Card variant="flat" padding="md" className="budget-management-form">
          <div className="budget-form-grid">
            <Select
              id="accountRole"
              label="Role"
              value={draft.roleSlug}
              onChange={(event) => onDraftChange({ ...draft, roleSlug: event.target.value })}
              disabled={savingKey === "create-account"}
            >
              <option value="">Choose a role</option>
              {availableRoles.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.name} ({role.slug})
                </option>
              ))}
            </Select>
            <Input
              id="accountAmount"
              label="Allocated amount"
              type="number"
              min="0"
              step="0.01"
              value={draft.allocatedAmount}
              onChange={(event) => onDraftChange({ ...draft, allocatedAmount: event.target.value })}
              disabled={savingKey === "create-account"}
            />
            <Textarea
              id="accountNotes"
              label="Notes"
              className="budget-form-full"
              rows={2}
              value={draft.notes}
              onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
              disabled={savingKey === "create-account"}
            />
          </div>
          <Button
            type="button"
            onClick={onCreate}
            loading={savingKey === "create-account"}
            disabled={savingKey === "create-account"}
          >
            {savingKey === "create-account" ? "Creating..." : "Create budget account"}
          </Button>
        </Card>
      )}
    </section>
  );
}
