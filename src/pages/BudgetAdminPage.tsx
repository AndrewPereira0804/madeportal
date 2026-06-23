import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { canManageBudgets } from "../auth/roleAccess";
import { useAuth } from "../auth/authProvider";
import useRoles from "../auth/useRoles";
import BudgetStatusBadge from "../components/budget/BudgetStatusBadge";
import { formatMoney, type BudgetAccount, type BudgetTransaction } from "../lib/budget";
import {
  approveBudgetTransaction,
  denyBudgetTransaction,
  getBudgetAccountsByIds,
  getBudgetTransactionsByStatus,
  getSubmitterProfilesByIds,
  markBudgetTransactionReimbursed,
  type BudgetSubmitterProfile,
} from "../lib/budgetQueries";

type BudgetAdminRow = {
  transaction: BudgetTransaction;
  account: BudgetAccount | null;
  submitter: BudgetSubmitterProfile | null;
};

function uniqueStrings(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", includeTime
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
      });
}

function accountLabel(account: BudgetAccount | null, accountId: string) {
  if (!account) {
    return accountId;
  }

  return account.notes ? `${account.role_slug} - ${account.notes}` : account.role_slug;
}

function submitterLabel(profile: BudgetSubmitterProfile | null, submittedBy: string | null) {
  if (profile?.name && profile.email) {
    return `${profile.name} (${profile.email})`;
  }

  return profile?.name ?? profile?.email ?? submittedBy ?? "Unknown submitter";
}

export default function BudgetAdminPage() {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const [pendingRows, setPendingRows] = useState<BudgetAdminRow[]>([]);
  const [approvedRows, setApprovedRows] = useState<BudgetAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasBudgetAccess = canManageBudgets(roles);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const transactions = await getBudgetTransactionsByStatus(["submitted", "approved"]);
      const accounts = await getBudgetAccountsByIds(
        uniqueStrings(transactions.map((transaction) => transaction.budget_account_id))
      );
      const submitters = await getSubmitterProfilesByIds(
        uniqueStrings(transactions.map((transaction) => transaction.submitted_by))
      );

      const accountsById = new Map(accounts.map((account) => [account.id, account]));
      const submittersById = new Map(submitters.map((submitter) => [submitter.user_id, submitter]));
      const rows = transactions.map((transaction) => ({
        transaction,
        account: accountsById.get(transaction.budget_account_id) ?? null,
        submitter: transaction.submitted_by ? submittersById.get(transaction.submitted_by) ?? null : null,
      }));

      setPendingRows(rows.filter((row) => row.transaction.status === "submitted"));
      setApprovedRows(rows.filter((row) => row.transaction.status === "approved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setPendingRows([]);
      setApprovedRows([]);
      setErrorMessage(`Could not load budget requests: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rolesLoading || !hasBudgetAccess) {
      return;
    }

    void loadRequests();
  }, [hasBudgetAccess, loadRequests, rolesLoading]);

  const totals = useMemo(
    () => ({
      pending: pendingRows.reduce((total, row) => total + row.transaction.amount, 0),
      approved: approvedRows.reduce((total, row) => total + row.transaction.amount, 0),
    }),
    [approvedRows, pendingRows]
  );

  async function runAction(transactionId: string, action: () => Promise<void>, success: string) {
    setSavingId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await action();
      setSuccessMessage(success);
      await loadRequests();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setErrorMessage(message);
    } finally {
      setSavingId(null);
    }
  }

  function approveRequest(transactionId: string) {
    const userId = session?.user?.id;
    if (!userId) {
      setErrorMessage("You must be signed in to approve a request.");
      return;
    }

    void runAction(
      transactionId,
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
      transactionId,
      () => denyBudgetTransaction(transactionId, userId, trimmedReason),
      "Expense request denied."
    );
  }

  function markReimbursed(transactionId: string) {
    void runAction(
      transactionId,
      () => markBudgetTransactionReimbursed(transactionId),
      "Expense marked reimbursed."
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
          <p className="page-subtitle mb-0">Review submitted expenses and track approved reimbursements.</p>
        </div>
        <Link to="/budget" className="btn btn-outline-secondary">
          Back to Budget
        </Link>
      </div>

      {errorMessage && <div className="alert alert-danger budget-alert">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success budget-alert">{successMessage}</div>}

      <div className="budget-admin-metrics">
        <div className="budget-summary-card">
          <span className="budget-summary-label">Pending requests</span>
          <strong className="budget-summary-value">{pendingRows.length}</strong>
          <span className="budget-admin-subvalue">{formatMoney(totals.pending)}</span>
        </div>
        <div className="budget-summary-card">
          <span className="budget-summary-label">Approved, not reimbursed</span>
          <strong className="budget-summary-value">{approvedRows.length}</strong>
          <span className="budget-admin-subvalue">{formatMoney(totals.approved)}</span>
        </div>
      </div>

      <BudgetAdminSection
        title="Pending Requests"
        emptyText="No submitted expense requests are visible."
        rows={pendingRows}
        savingId={savingId}
        actions={(transaction) => (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={savingId === transaction.id}
              onClick={() => approveRequest(transaction.id)}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              disabled={savingId === transaction.id}
              onClick={() => denyRequest(transaction.id)}
            >
              Deny
            </button>
          </>
        )}
      />

      <BudgetAdminSection
        title="Approved, Not Yet Reimbursed"
        emptyText="No approved unreimbursed expenses are visible."
        rows={approvedRows}
        savingId={savingId}
        actions={(transaction) => (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={savingId === transaction.id}
            onClick={() => markReimbursed(transaction.id)}
          >
            Mark Reimbursed
          </button>
        )}
      />
    </section>
  );
}

function BudgetAdminSection({
  title,
  emptyText,
  rows,
  savingId,
  actions,
}: {
  title: string;
  emptyText: string;
  rows: BudgetAdminRow[];
  savingId: string | null;
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
                    {accountLabel(account, transaction.budget_account_id)}
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
                {savingId === transaction.id && <span className="budget-admin-saving">Saving...</span>}
                {actions(transaction)}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
