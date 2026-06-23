import { useEffect, useMemo, useState } from "react";
import BudgetAccountTable from "../../components/budget/BudgetAccountTable";
import BudgetSummaryCards from "../../components/budget/BudgetSummaryCards";
import { calculateBudgetSummary, type BudgetAccount, type BudgetCycle, type BudgetTransaction } from "../../lib/budget";
import { getActiveBudgetCycle, getBudgetAccountsForCycle, getTransactionsForAccounts } from "../../lib/budgetQueries";

function getCycleLabel(cycle: BudgetCycle) {
  if (cycle.name) {
    return cycle.name;
  }

  if (cycle.start_date && cycle.end_date) {
    return `${cycle.start_date} to ${cycle.end_date}`;
  }

  return `Cycle ${cycle.id}`;
}

export default function BudgetPage() {
  const [cycle, setCycle] = useState<BudgetCycle | null>(null);
  const [accounts, setAccounts] = useState<BudgetAccount[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadBudget() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const activeCycle = await getActiveBudgetCycle();
        if (!activeCycle) {
          if (!ignore) {
            setCycle(null);
            setAccounts([]);
            setTransactions([]);
          }
          return;
        }

        const budgetAccounts = await getBudgetAccountsForCycle(activeCycle.id);
        const budgetTransactions = await getTransactionsForAccounts(
          budgetAccounts.map((account) => account.id)
        );

        if (!ignore) {
          setCycle(activeCycle);
          setAccounts(budgetAccounts);
          setTransactions(budgetTransactions);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        if (!ignore) {
          setCycle(null);
          setAccounts([]);
          setTransactions([]);
          setErrorMessage(`Could not load budgets: ${message}`);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadBudget();

    return () => {
      ignore = true;
    };
  }, []);

  const summary = useMemo(() => calculateBudgetSummary(accounts, transactions), [accounts, transactions]);

  return (
    <section className="theme-card budget-page p-4 p-md-5">
      <div className="budget-page-header">
        <div>
          <h1 className="page-title">Budget</h1>
          <p className="page-subtitle mb-0">
            {cycle ? `Active cycle: ${getCycleLabel(cycle)}` : "Read-only budget dashboard."}
          </p>
        </div>
      </div>

      {loading && <p className="accounts-loading">Loading budget dashboard...</p>}
      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}

      {!loading && !errorMessage && !cycle && (
        <p className="budget-empty-state">No active budget cycle is available.</p>
      )}

      {!loading && !errorMessage && cycle && (
        <>
          <BudgetSummaryCards summary={summary} />

          <div className="budget-section-heading">
            <div>
              <h2 className="h4 mb-1">Budget accounts</h2>
              <p className="text-body-secondary mb-0">
                Showing {accounts.length} account{accounts.length === 1 ? "" : "s"} available to you.
              </p>
            </div>
          </div>

          {accounts.length === 0 ? (
            <p className="budget-empty-state">No budget accounts are visible for this cycle.</p>
          ) : (
            <BudgetAccountTable accounts={accounts} transactions={transactions} />
          )}
        </>
      )}
    </section>
  );
}
