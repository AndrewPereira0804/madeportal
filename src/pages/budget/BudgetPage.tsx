import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  canAccessBudgetAccount,
  canAccessBudgets,
  canManageBudgets,
} from "../../auth/roleAccess";
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
  const { roles, loading: rolesLoading } = useRoles();
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
        const accountsAvailableToUser = canManageBudgets(roles)
          ? budgetAccounts
          : budgetAccounts.filter((account) => canAccessBudgetAccount(roles, account.role_slug));
        const budgetTransactions = await getTransactionsForAccounts(
          accountsAvailableToUser.map((account) => account.id)
        );

        if (!ignore) {
          setCycle(activeCycle);
          setAccounts(accountsAvailableToUser);
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

    if (rolesLoading || !canAccessBudgets(roles)) {
      if (!rolesLoading) {
        setLoading(false);
      }
      return;
    }

    void loadBudget();

    return () => {
      ignore = true;
    };
  }, [roles, rolesLoading]);

  const hasBudgetAdminAccess = canManageBudgets(roles);
  const visibleAccounts = useMemo(
    () =>
      hasBudgetAdminAccess
        ? accounts
        : accounts.filter((account) => canAccessBudgetAccount(roles, account.role_slug)),
    [accounts, hasBudgetAdminAccess, roles]
  );
  const visibleAccountIds = useMemo(
    () => new Set(visibleAccounts.map((account) => account.id)),
    [visibleAccounts]
  );
  const visibleTransactions = useMemo(
    () => transactions.filter((transaction) => visibleAccountIds.has(transaction.budget_account_id)),
    [transactions, visibleAccountIds]
  );
  const summary = useMemo(
    () => calculateBudgetSummary(visibleAccounts, visibleTransactions),
    [visibleAccounts, visibleTransactions]
  );

  if (!rolesLoading && !canAccessBudgets(roles)) {
    return <Navigate to="/app" replace />;
  }

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

      {(loading || rolesLoading) && (
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading budget dashboard...</span>
        </div>
      )}

      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}

      {!loading && !errorMessage && !cycle && (
        <EmptyState
          title="No active budget cycle"
          description="Contact the Treasurer to confirm when budgets will be available."
        />
      )}

      {!loading && !errorMessage && cycle && (
        <>
          <BudgetSummaryCards summary={summary} />

          <SectionHeader
            title="Budget accounts"
            description={`Showing ${visibleAccounts.length} account${visibleAccounts.length === 1 ? "" : "s"} available to you.`}
          />

          {visibleAccounts.length === 0 ? (
            <EmptyState
              compact
              title="No budget account assigned"
              description="Your budget role does not have an account in this cycle. Contact the Treasurer to confirm your allocation."
            />
          ) : (
            <BudgetAccountTable accounts={visibleAccounts} transactions={visibleTransactions} />
          )}
        </>
      )}
    </Card>
  );
}
