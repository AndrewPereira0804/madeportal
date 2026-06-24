import { useEffect, useMemo, useState } from "react";
import { canManageBudgets } from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import BudgetAccountTable from "../../components/budget/BudgetAccountTable";
import BudgetSummaryCards from "../../components/budget/BudgetSummaryCards";
import { Button, Card, EmptyState, PageHeader, SectionHeader } from "../../components/ui";
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
  const { roles } = useRoles();
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
  const hasBudgetAdminAccess = canManageBudgets(roles);

  return (
    <Card className="budget-page">
      <PageHeader
        eyebrow="Massachusetts Delta finance"
        title="Budget"
        subtitle={cycle ? `Active cycle: ${getCycleLabel(cycle)}` : "Read-only budget dashboard."}
        bordered
        actions={
          hasBudgetAdminAccess ? (
            <Button to="/app/budget/admin" variant="outline-secondary">
              Budget Admin
            </Button>
          ) : undefined
        }
      />

      {loading && (
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget dashboard...</span>
        </div>
      )}

      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}

      {!loading && !errorMessage && !cycle && (
        <EmptyState
          title="No active budget cycle"
          description="No active budget cycle is available right now."
        />
      )}

      {!loading && !errorMessage && cycle && (
        <>
          <BudgetSummaryCards summary={summary} />

          <SectionHeader
            title="Budget accounts"
            description={`Showing ${accounts.length} account${accounts.length === 1 ? "" : "s"} available to you.`}
          />

          {accounts.length === 0 ? (
            <EmptyState
              compact
              title="No accounts visible"
              description="No budget accounts are visible for this cycle."
            />
          ) : (
            <BudgetAccountTable accounts={accounts} transactions={transactions} />
          )}
        </>
      )}
    </Card>
  );
}
