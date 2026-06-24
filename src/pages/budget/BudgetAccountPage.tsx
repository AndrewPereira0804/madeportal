import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  canAccessBudgetAccount,
  canAccessBudgets,
  canManageBudgets,
} from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import BudgetSummaryCards from "../../components/budget/BudgetSummaryCards";
import BudgetTransactionTable from "../../components/budget/BudgetTransactionTable";
import SubmitExpenseForm from "../../components/budget/SubmitExpenseForm";
import { Button, Card, EmptyState, PageHeader, SectionHeader } from "../../components/ui";
import { calculateBudgetSummary, type BudgetAccount, type BudgetTransaction } from "../../lib/budget";
import { getBudgetAccount, getTransactionsForAccount } from "../../lib/budgetQueries";

export default function BudgetAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
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
      if (!rolesLoading) {
        setLoading(false);
      }
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

  if (!rolesLoading && !canAccessBudgets(roles)) {
    return <Navigate to="/app" replace />;
  }

  if (
    !loading &&
    account &&
    !hasBudgetAdminAccess &&
    !canAccessBudgetAccount(roles, account.role_slug)
  ) {
    return <Navigate to="/app/budget" replace />;
  }

  return (
    <Card className="budget-page">
      <PageHeader
        eyebrow="Budget account"
        title={account ? account.role_slug : "Budget account"}
        subtitle={account?.notes ?? "Read-only account details and transaction activity."}
        bordered
        actions={<Button to="/app/budget" variant="outline-secondary">Back to Budget</Button>}
      />

      {(loading || rolesLoading) && (
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget account...</span>
        </div>
      )}

      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}

      {!loading && !errorMessage && !account && (
        <EmptyState
          title="Account unavailable"
          description="This budget account is not available."
        />
      )}

      {!loading && !errorMessage && account && (
        <>
          <BudgetSummaryCards summary={summary} />

          <SubmitExpenseForm budgetAccountId={account.id} onSubmitted={refreshTransactions} />

          <SectionHeader
            title="Transactions"
            description={`Showing ${transactions.length} transaction${transactions.length === 1 ? "" : "s"} returned by Supabase.`}
          />

          <BudgetTransactionTable transactions={transactions} />
        </>
      )}
    </Card>
  );
}
