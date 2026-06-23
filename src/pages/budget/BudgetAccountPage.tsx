import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BudgetSummaryCards from "../../components/budget/BudgetSummaryCards";
import BudgetTransactionTable from "../../components/budget/BudgetTransactionTable";
import { calculateBudgetSummary, type BudgetAccount, type BudgetTransaction } from "../../lib/budget";
import { getBudgetAccount, getTransactionsForAccount } from "../../lib/budgetQueries";

export default function BudgetAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [account, setAccount] = useState<BudgetAccount | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    <section className="theme-card budget-page p-4 p-md-5">
      <div className="budget-page-header">
        <div>
          <h1 className="page-title">{account ? account.role_slug : "Budget account"}</h1>
          <p className="page-subtitle mb-0">
            {account?.notes ?? "Read-only account details and transaction activity."}
          </p>
        </div>
        <Link to="/budget" className="btn btn-outline-secondary">
          Back to Budget
        </Link>
      </div>

      {loading && <p className="accounts-loading">Loading budget account...</p>}
      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}

      {!loading && !errorMessage && !account && (
        <p className="budget-empty-state">This budget account is not available.</p>
      )}

      {!loading && !errorMessage && account && (
        <>
          <BudgetSummaryCards summary={summary} />

          <div className="budget-section-heading">
            <div>
              <h2 className="h4 mb-1">Transactions</h2>
              <p className="text-body-secondary mb-0">
                Showing {transactions.length} transaction{transactions.length === 1 ? "" : "s"} returned by Supabase.
              </p>
            </div>
          </div>

          <BudgetTransactionTable transactions={transactions} />
        </>
      )}
    </section>
  );
}
