import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import BudgetSummaryCards from "../../components/budget/BudgetSummaryCards";
import BudgetTransactionTable from "../../components/budget/BudgetTransactionTable";
import SubmitExpenseForm from "../../components/budget/SubmitExpenseForm";
import { Button, Card, EmptyState, PageHeader, SectionHeader } from "../../components/ui";
import { calculateBudgetSummary, type BudgetAccount, type BudgetTransaction } from "../../lib/budget";
import { getBudgetAccount, getTransactionsForAccount } from "../../lib/budgetQueries";

export default function BudgetAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
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
        const budgetTransactions = budgetAccount ? await getTransactionsForAccount(budgetAccount.id) : [];

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

    void loadBudgetAccount();

    return () => {
      ignore = true;
    };
  }, [accountId]);

  const summary = useMemo(
    () => calculateBudgetSummary(account ? [account] : [], transactions),
    [account, transactions]
  );

  return (
    <Card className="budget-page">
      <PageHeader
        eyebrow="Budget account"
        title={account ? account.role_slug : "Budget account"}
        subtitle={account?.notes ?? "Read-only account details and transaction activity."}
        bordered
        actions={<Button to="/app/budget" variant="outline-secondary">Back to Budget</Button>}
      />

      {loading && (
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
