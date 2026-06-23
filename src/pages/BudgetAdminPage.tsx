import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { canManageBudgets } from "../auth/roleAccess";
import { useAuth } from "../auth/authProvider";
import useRoles from "../auth/useRoles";
import BudgetStatusBadge from "../components/budget/BudgetStatusBadge";
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

export default function BudgetAdminPage() {
  const { session } = useAuth();
  const { roles: userRoles, loading: rolesLoading } = useRoles();
  const [pendingRows, setPendingRows] = useState<BudgetAdminRow[]>([]);
  const [approvedRows, setApprovedRows] = useState<BudgetAdminRow[]>([]);
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

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [requestTransactions, nextCycles, nextRoles] = await Promise.all([
        getBudgetTransactionsByStatus(["submitted", "approved"]),
        getAllBudgetCycles(),
        getRoles(),
      ]);

      const active = nextCycles.find((cycle) => cycle.is_active) ?? null;
      const nextActiveAccounts = active ? await getBudgetAccountsForCycle(active.id) : [];
      const [requestAccounts, submitters, nextAccountTransactions] = await Promise.all([
        getBudgetAccountsByIds(uniqueStrings(requestTransactions.map((transaction) => transaction.budget_account_id))),
        getSubmitterProfilesByIds(uniqueStrings(requestTransactions.map((transaction) => transaction.submitted_by))),
        getTransactionsForAccounts(nextActiveAccounts.map((account) => account.id)),
      ]);

      const requestAccountsById = new Map(requestAccounts.map((account) => [account.id, account]));
      const submittersById = new Map(submitters.map((submitter) => [submitter.user_id, submitter]));
      const rows = requestTransactions.map((transaction) => ({
        transaction,
        account: requestAccountsById.get(transaction.budget_account_id) ?? null,
        submitter: transaction.submitted_by ? submittersById.get(transaction.submitted_by) ?? null : null,
      }));

      setPendingRows(rows.filter((row) => row.transaction.status === "submitted"));
      setApprovedRows(rows.filter((row) => row.transaction.status === "approved"));
      setCycles(nextCycles);
      setRoles(nextRoles);
      setActiveAccounts(nextActiveAccounts);
      setActiveAccountTransactions(nextAccountTransactions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setPendingRows([]);
      setApprovedRows([]);
      setCycles([]);
      setRoles([]);
      setActiveAccounts([]);
      setActiveAccountTransactions([]);
      setErrorMessage(`Could not load budget admin data: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

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

    const reason = window.prompt("Enter a short denial reason:");
    if (reason === null) {
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMessage("Denial reason is required.");
      setSuccessMessage(null);
      return;
    }

    void runAction(
      `deny-${transactionId}`,
      () => denyBudgetTransaction(transactionId, userId, trimmedReason),
      "Expense request denied."
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
      <section className="theme-card budget-page p-4 p-md-5">
        <div className="d-flex align-items-center gap-2">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget admin...</span>
        </div>
      </section>
    );
  }

  if (!hasBudgetAccess) {
    return <Navigate to="/budget" replace />;
  }

  if (loading) {
    return (
      <section className="theme-card budget-page p-4 p-md-5">
        <div className="d-flex align-items-center gap-2">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget admin...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="theme-card budget-page p-4 p-md-5">
      <div className="budget-page-header">
        <div>
          <h1 className="page-title">Budget Admin</h1>
          <p className="page-subtitle mb-0">Review expense requests and manage budget allocations.</p>
        </div>
        <Link to="/budget" className="btn btn-outline-secondary">
          Back to Budget
        </Link>
      </div>

      {errorMessage && <div className="alert alert-danger budget-alert">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success budget-alert">{successMessage}</div>}

      <BudgetAdminMetrics pendingCount={pendingRows.length} pendingTotal={totals.pending} approvedCount={approvedRows.length} approvedTotal={totals.approved} />

      <BudgetRequestSection
        title="Pending Requests"
        emptyText="No pending requests."
        rows={pendingRows}
        roles={roles}
        savingKey={savingKey}
        actions={(transaction) => (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={savingKey === `approve-${transaction.id}`}
              onClick={() => approveRequest(transaction.id)}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              disabled={savingKey === `deny-${transaction.id}`}
              onClick={() => denyRequest(transaction.id)}
            >
              Deny
            </button>
          </>
        )}
      />

      <BudgetRequestSection
        title="Approved, Not Yet Reimbursed"
        emptyText="No approved unreimbursed expenses."
        rows={approvedRows}
        roles={roles}
        savingKey={savingKey}
        actions={(transaction) => (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={savingKey === `reimburse-${transaction.id}`}
            onClick={() => markReimbursed(transaction.id)}
          >
            Mark Reimbursed
          </button>
        )}
      />

      <BudgetCyclesSection
        cycles={cycles}
        draft={cycleDraft}
        savingKey={savingKey}
        onDraftChange={setCycleDraft}
        onCreate={handleCreateCycle}
        onSetActive={handleSetActiveCycle}
      />

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
    </section>
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
      <div className="budget-summary-card">
        <span className="budget-summary-label">Pending requests</span>
        <strong className="budget-summary-value">{pendingCount}</strong>
        <span className="budget-admin-subvalue">{formatMoney(pendingTotal)}</span>
      </div>
      <div className="budget-summary-card">
        <span className="budget-summary-label">Approved, not reimbursed</span>
        <strong className="budget-summary-value">{approvedCount}</strong>
        <span className="budget-admin-subvalue">{formatMoney(approvedTotal)}</span>
      </div>
    </div>
  );
}

function BudgetRequestSection({
  title,
  emptyText,
  rows,
  roles,
  savingKey,
  actions,
}: {
  title: string;
  emptyText: string;
  rows: BudgetAdminRow[];
  roles: BudgetRole[];
  savingKey: string | null;
  actions: (transaction: BudgetTransaction) => ReactNode;
}) {
  return (
    <section className="budget-admin-section">
      <div className="budget-section-heading">
        <h2 className="h4 mb-0">{title}</h2>
      </div>

      {rows.length === 0 ? (
        <p className="budget-empty-state">{emptyText}</p>
      ) : (
        <div className="budget-admin-list">
          {rows.map(({ transaction, account, submitter }) => (
            <article key={transaction.id} className="budget-request-card">
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

              <div className="budget-request-actions">
                {savingKey?.endsWith(transaction.id) && <span className="budget-admin-saving">Saving...</span>}
                {actions(transaction)}
              </div>
            </article>
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
      <div className="budget-section-heading">
        <h2 className="h4 mb-0">Budget Cycles</h2>
      </div>

      <div className="budget-management-form">
        <div className="budget-form-grid">
          <div>
            <label className="form-label" htmlFor="cycleName">
              Name
            </label>
            <input
              id="cycleName"
              className="form-control"
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              disabled={savingKey === "create-cycle"}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="cycleStart">
              Start date
            </label>
            <input
              id="cycleStart"
              className="form-control"
              type="date"
              value={draft.startDate}
              onChange={(event) => onDraftChange({ ...draft, startDate: event.target.value })}
              disabled={savingKey === "create-cycle"}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="cycleEnd">
              End date
            </label>
            <input
              id="cycleEnd"
              className="form-control"
              type="date"
              value={draft.endDate}
              onChange={(event) => onDraftChange({ ...draft, endDate: event.target.value })}
              disabled={savingKey === "create-cycle"}
            />
          </div>
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
        <button type="button" className="btn btn-primary" onClick={onCreate} disabled={savingKey === "create-cycle"}>
          {savingKey === "create-cycle" ? "Creating..." : "Create cycle"}
        </button>
      </div>

      {cycles.length === 0 ? (
        <p className="budget-empty-state">No budget cycles are available.</p>
      ) : (
        <div className="accounts-table-wrap budget-table-wrap">
          <table className="accounts-table budget-table">
            <thead>
              <tr>
                <th className="accounts-th">Name</th>
                <th className="accounts-th">Start</th>
                <th className="accounts-th">End</th>
                <th className="accounts-th">Status</th>
                <th className="accounts-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id}>
                  <td className="accounts-td">
                    <strong>{cycle.name ?? "Untitled cycle"}</strong>
                  </td>
                  <td className="accounts-td">{cycle.start_date ?? "No start date"}</td>
                  <td className="accounts-td">{cycle.end_date ?? "No end date"}</td>
                  <td className="accounts-td">
                    {cycle.is_active ? (
                      <span className="budget-status-badge budget-status-approved">Active</span>
                    ) : (
                      <span className="budget-status-badge budget-status-submitted">Inactive</span>
                    )}
                  </td>
                  <td className="accounts-td">
                    {!cycle.is_active && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => onSetActive(cycle.id)}
                        disabled={savingKey === "set-active-cycle"}
                      >
                        Set Active
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <div className="budget-section-heading">
        <div>
          <h2 className="h4 mb-1">Active Cycle Budget Accounts</h2>
          <p className="text-body-secondary mb-0">
            {activeCycle ? activeCycle.name ?? "Active cycle" : "No active budget cycle"}
          </p>
        </div>
      </div>

      {!activeCycle ? (
        <p className="budget-empty-state">No active budget cycle.</p>
      ) : accounts.length === 0 ? (
        <p className="budget-empty-state">No budget accounts for active cycle.</p>
      ) : (
        <div className="accounts-table-wrap budget-table-wrap">
          <table className="accounts-table budget-table">
            <thead>
              <tr>
                <th className="accounts-th">Role / Chair</th>
                <th className="accounts-th">Role slug</th>
                <th className="accounts-th">Allocated</th>
                <th className="accounts-th">Approved / reimbursed</th>
                <th className="accounts-th">Pending</th>
                <th className="accounts-th">Remaining</th>
                <th className="accounts-th">Notes</th>
                <th className="accounts-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const accountTransactions = transactions.filter(
                  (transaction) => transaction.budget_account_id === account.id
                );
                const summary = calculateBudgetSummary([account], accountTransactions);
                const transactionCount = accountTransactions.length;
                const isEditing = editingAccountId === account.id && editDraft;

                return (
                  <tr key={account.id}>
                    <td className="accounts-td">{roleLabel(account.role_slug, roles)}</td>
                    <td className="accounts-td">{account.role_slug}</td>
                    <td className="accounts-td">
                      {isEditing ? (
                        <input
                          className="form-control budget-amount-input"
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
                    </td>
                    <td className="accounts-td">{formatMoney(summary.spent)}</td>
                    <td className="accounts-td">{formatMoney(summary.pending)}</td>
                    <td className="accounts-td">{formatMoney(summary.remaining)}</td>
                    <td className="accounts-td budget-notes-cell">
                      {isEditing ? (
                        <textarea
                          className="form-control"
                          rows={2}
                          value={editDraft.notes}
                          onChange={(event) => onEditDraftChange({ ...editDraft, notes: event.target.value })}
                          disabled={savingKey === `save-account-${account.id}`}
                        />
                      ) : (
                        account.notes ?? "No notes"
                      )}
                    </td>
                    <td className="accounts-td">
                      {isEditing ? (
                        <div className="accounts-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onSave(account.id)}
                            disabled={savingKey === `save-account-${account.id}`}
                          >
                            Save
                          </button>
                          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancelEdit}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="accounts-actions">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => onStartEdit(account)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => onDelete(account)}
                            disabled={transactionCount > 0 || savingKey === `delete-account-${account.id}`}
                            title={transactionCount > 0 ? "Cannot delete budget accounts with transactions." : undefined}
                          >
                            Delete
                          </button>
                          {transactionCount > 0 && (
                            <div className="accounts-user-meta">Cannot delete budget accounts with transactions.</div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
      <div className="budget-section-heading">
        <h2 className="h4 mb-0">Create Budget Account</h2>
      </div>

      {!activeCycle ? (
        <p className="budget-empty-state">No active budget cycle.</p>
      ) : roles.length === 0 ? (
        <p className="budget-empty-state">No roles available.</p>
      ) : availableRoles.length === 0 ? (
        <p className="budget-empty-state">Every visible role already has a budget account for this cycle.</p>
      ) : (
        <div className="budget-management-form">
          <div className="budget-form-grid">
            <div>
              <label className="form-label" htmlFor="accountRole">
                Role
              </label>
              <select
                id="accountRole"
                className="form-select"
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
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="accountAmount">
                Allocated amount
              </label>
              <input
                id="accountAmount"
                className="form-control"
                type="number"
                min="0"
                step="0.01"
                value={draft.allocatedAmount}
                onChange={(event) => onDraftChange({ ...draft, allocatedAmount: event.target.value })}
                disabled={savingKey === "create-account"}
              />
            </div>
            <div className="budget-form-full">
              <label className="form-label" htmlFor="accountNotes">
                Notes
              </label>
              <textarea
                id="accountNotes"
                className="form-control"
                rows={2}
                value={draft.notes}
                onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
                disabled={savingKey === "create-account"}
              />
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={onCreate} disabled={savingKey === "create-account"}>
            {savingKey === "create-account" ? "Creating..." : "Create budget account"}
          </button>
        </div>
      )}
    </section>
  );
}
