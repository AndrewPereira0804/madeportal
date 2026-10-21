import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  canAccessBudgetAccount,
  canAccessBudgets,
  canManageBudgets,
} from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import { useAuth } from "../../auth/authContext";
import BudgetSummaryCards from "../../components/budget/BudgetSummaryCards";
import BudgetTransactionTable from "../../components/budget/BudgetTransactionTable";
import SubmitExpenseForm from "../../components/budget/SubmitExpenseForm";
import { Button, Card, EmptyState, PageHeader, SectionHeader } from "../../components/ui";
import { calculateBudgetSummary, type BudgetAccount, type BudgetTransaction } from "../../lib/budget";
import { denyBudgetTransaction, getBudgetAccount, getTransactionsForAccount } from "../../lib/budgetQueries";

type BudgetAccountPageProps = {
  accountIdOverride?: string;
  returnPath?: string;
  eyebrow?: string;
};

export default function BudgetAccountPage({
  accountIdOverride,
  returnPath = "/app/tools",
  eyebrow = "Budget account",
}: BudgetAccountPageProps = {}) {
  const { accountId: routeAccountId } = useParams<{ accountId: string }>();
  const accountId = accountIdOverride ?? routeAccountId;
  const { session } = useAuth();
  const [editingExpense, setEditingExpense] = useState<BudgetTransaction | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const { roles, loading: rolesLoading } = useRoles();
  const [account, setAccount] = useState<BudgetAccount | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshTransactions = useCallback(async () => {
    if (!accountId) {
      return;
    }

    const budgetTransactions = await getTransactionsForAccount(accountId);
    setTransactions(budgetTransactions);
  }, [accountId]);

  useEffect(() => {
    let ignore = false;

    async function loadBudgetAccount() {
      if (!accountId) {
        setErrorMessage("Budget account ID is missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const budgetAccount = await getBudgetAccount(accountId);
        const canViewAccount =
          budgetAccount &&
          (canManageBudgets(roles) || canAccessBudgetAccount(roles, budgetAccount.role_slug));
        const budgetTransactions = canViewAccount ? await getTransactionsForAccount(budgetAccount.id) : [];

        if (!ignore) {
          setAccount(budgetAccount);
          setTransactions(budgetTransactions);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        if (!ignore) {
          setAccount(null);
          setTransactions([]);
          setErrorMessage(`Could not load this budget account: ${message}`);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    if (rolesLoading || !canAccessBudgets(roles)) {
      return;
    }

    void loadBudgetAccount();

    return () => {
      ignore = true;
    };
  }, [accountId, roles, rolesLoading]);

  const summary = useMemo(
    () => calculateBudgetSummary(account ? [account] : [], transactions),
    [account, transactions]
  );
  const hasBudgetAdminAccess = canManageBudgets(roles);

  async function deleteExpense(transaction: BudgetTransaction) {
    if (!window.confirm(`Delete this submitted expense for ${transaction.vendor ?? "this vendor"}?`)) return;
    setSavingExpense(true);
    setExpenseError(null);
    try { await denyBudgetTransaction(transaction); await refreshTransactions(); }
    catch (error) { setExpenseError(error instanceof Error ? error.message : "Could not delete expense."); }
    finally { setSavingExpense(false); }
  }

  if (!rolesLoading && !canAccessBudgets(roles)) {
    return <Navigate to="/app" replace />;
  }

  if (
    !loading &&
    account &&
    !hasBudgetAdminAccess &&
    !canAccessBudgetAccount(roles, account.role_slug)
  ) {
    return <Navigate to={returnPath} replace />;
  }

  return (
    <Card className="budget-page">
      <PageHeader
        eyebrow={eyebrow}
        title={account ? account.role_slug : "Budget account"}
        subtitle={account?.notes ?? "Account details and expense history."}
        bordered
        actions={<Button to={returnPath} variant="outline-secondary">Back</Button>}
      />

      {(loading || rolesLoading) && (
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget account...</span>
        </div>
      )}

      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}
      {expenseError && <div className="accounts-alert budget-alert">{expenseError}</div>}

      {!loading && !errorMessage && !account && (
        <EmptyState
          title="Account unavailable"
          description="This budget account is not available."
        />
      )}

      {!loading && !errorMessage && account && (
        <>
          <BudgetSummaryCards summary={summary} />

          <SubmitExpenseForm
            key={editingExpense ? `${editingExpense.id}-${editingExpense.updated_at}` : "new"}
            budgetAccountId={account.id} expense={editingExpense ?? undefined}
            onCancel={editingExpense ? () => setEditingExpense(null) : undefined}
            onSubmitted={async () => { await refreshTransactions(); setEditingExpense(null); }}
          />

          <SectionHeader
            title="Transactions"
            description={`Showing ${transactions.length} transaction${transactions.length === 1 ? "" : "s"} returned by Supabase.`}
          />

          <BudgetTransactionTable transactions={transactions} currentUserId={session?.user.id}
            canManage={hasBudgetAdminAccess} saving={savingExpense} onEdit={setEditingExpense} onDelete={deleteExpense} />
        </>
      )}
    </Card>
  );
}
