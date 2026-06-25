import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  canAccessBudgetAccount,
  canAccessChairTool,
  canManageCommunityServiceEvents,
  canManageFormalEvents,
  canManagePartyEvents,
  canManageBudgets,
  getChairRoleSlugs,
  getKnownChairToolRoleSlugs,
  isChairRoleSlug,
} from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import { getRoleLabel, normalizeRoleSlugForDisplay } from "../../../auth/roleDisplay";
import { ActionCard, Badge, Button, Card, EmptyState, MetricCard, PageHeader, SectionHeader } from "../../../components/ui";
import { calculateBudgetSummary, formatMoney, type BudgetAccount, type BudgetCycle, type BudgetTransaction } from "../../../lib/budget";
import { getActiveBudgetCycle, getBudgetAccountsForCycle, getTransactionsForAccount } from "../../../lib/budgetQueries";
import CommunityServiceEventsTool from "./CommunityServiceEventsTool";
import FormalEventsTool from "./FormalEventsTool";
import PartyEventsTool from "./PartyEventsTool";

const socialChairRoleSlug = "social-chair";
const communityServiceChairRoleSlugs = new Set(["cs-chair", "community-service-chair"]);

function uniqueRoleSlugs(roleSlugs: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const roleSlug of roleSlugs) {
    const normalized = normalizeRoleSlugForDisplay(roleSlug);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

function getCycleLabel(cycle: BudgetCycle | null) {
  if (!cycle) {
    return "No active cycle";
  }

  if (cycle.name) {
    return cycle.name;
  }

  if (cycle.start_date && cycle.end_date) {
    return `${cycle.start_date} to ${cycle.end_date}`;
  }

  return `Cycle ${cycle.id}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function ChairToolsIndex() {
  const { roles, loading: rolesLoading } = useRoles();
  const canViewAllChairTools = canManageBudgets(roles);
  const availableRoleSlugs = useMemo(
    () =>
      uniqueRoleSlugs(
        canViewAllChairTools ? getKnownChairToolRoleSlugs() : getChairRoleSlugs(roles)
      ),
    [canViewAllChairTools, roles]
  );

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow="Chair tools"
        title="Tools"
        subtitle="Role-specific chair workspaces."
        bordered
        actions={<Button to="/app" variant="outline-secondary">Back to Dashboard</Button>}
      />

      {rolesLoading ? (
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading tools...</span>
        </div>
      ) : availableRoleSlugs.length === 0 ? (
        <EmptyState
          title="No chair tools assigned"
          description="Chair workspaces will appear here when a chair role is assigned."
          action={<Button to="/app" variant="outline-secondary">Dashboard</Button>}
        />
      ) : (
        <>
          <SectionHeader
            title="Available tools"
            description={`${availableRoleSlugs.length} chair workspace${availableRoleSlugs.length === 1 ? "" : "s"} available.`}
          />
          <div className="action-card-grid tools-grid">
            {availableRoleSlugs.map((roleSlug) => (
              <ActionCard
                key={roleSlug}
                to={`/app/tools/${roleSlug}`}
                eyebrow="Chair"
                title={getRoleLabel(roleSlug)}
                description="Budget allocation and spending request access."
                meta={roleSlug}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export function ChairToolPage() {
  const { roleSlug, "*": toolPathParam } = useParams<{ roleSlug: string; "*": string }>();
  const { roles, loading: rolesLoading } = useRoles();
  const normalizedRoleSlug = normalizeRoleSlugForDisplay(roleSlug ?? "");
  const nestedToolPath = (toolPathParam ?? "").replace(/^\/+|\/+$/g, "");
  const canViewTool = Boolean(normalizedRoleSlug && canAccessChairTool(roles, normalizedRoleSlug));
  const canUseBudgetAdminAccess = canManageBudgets(roles);
  const canUsePartyTool = normalizedRoleSlug === socialChairRoleSlug && canManagePartyEvents(roles);
  const canUseFormalTool = normalizedRoleSlug === socialChairRoleSlug && canManageFormalEvents(roles);
  const canUseCommunityServiceTool =
    communityServiceChairRoleSlugs.has(normalizedRoleSlug) && canManageCommunityServiceEvents(roles);

  const [cycle, setCycle] = useState<BudgetCycle | null>(null);
  const [account, setAccount] = useState<BudgetAccount | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadToolData() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const activeCycle = await getActiveBudgetCycle();
        let activeAccount: BudgetAccount | null = null;
        let accountTransactions: BudgetTransaction[] = [];

        if (activeCycle) {
          const accounts = await getBudgetAccountsForCycle(activeCycle.id);
          activeAccount =
            accounts.find(
              (budgetAccount) =>
                normalizeRoleSlugForDisplay(budgetAccount.role_slug) === normalizedRoleSlug
            ) ?? null;

          if (activeAccount) {
            accountTransactions = await getTransactionsForAccount(activeAccount.id);
          }
        }

        if (!ignore) {
          setCycle(activeCycle);
          setAccount(activeAccount);
          setTransactions(accountTransactions);
        }
      } catch (error) {
        if (!ignore) {
          setCycle(null);
          setAccount(null);
          setTransactions([]);
          setErrorMessage(`Could not load chair tool data: ${getErrorMessage(error)}`);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    if (rolesLoading || nestedToolPath) {
      return () => {
        ignore = true;
      };
    }

    if (!canViewTool) {
      setLoading(false);
      return () => {
        ignore = true;
      };
    }

    void loadToolData();

    return () => {
      ignore = true;
    };
  }, [canViewTool, nestedToolPath, normalizedRoleSlug, rolesLoading]);

  const summary = useMemo(
    () => calculateBudgetSummary(account ? [account] : [], transactions),
    [account, transactions]
  );
  const canOpenBudgetAccount = Boolean(
    account && (canUseBudgetAdminAccess || canAccessBudgetAccount(roles, account.role_slug))
  );
  const budgetAccountPath = account ? `/app/budget/${account.id}` : "/app/budget";

  if (!rolesLoading && (!normalizedRoleSlug || !isChairRoleSlug(normalizedRoleSlug))) {
    return (
      <Card className="tools-page">
        <PageHeader
          eyebrow="Chair tools"
          title="Tool unavailable"
          subtitle="This chair workspace is not available."
          bordered
          actions={<Button to="/app/tools" variant="outline-secondary">Back to Tools</Button>}
        />
        <EmptyState title="Tool unavailable" description="Choose an available chair workspace." />
      </Card>
    );
  }

  if (!rolesLoading && !canViewTool) {
    return <Navigate to="/app/tools" replace />;
  }

  if (nestedToolPath === "party-events" && normalizedRoleSlug === socialChairRoleSlug) {
    return <PartyEventsTool />;
  }

  if (nestedToolPath === "formal-events" && normalizedRoleSlug === socialChairRoleSlug) {
    return <FormalEventsTool />;
  }

  if (nestedToolPath === "community-service-events" && communityServiceChairRoleSlugs.has(normalizedRoleSlug)) {
    return <CommunityServiceEventsTool />;
  }

  if (nestedToolPath) {
    return (
      <Card className="tools-page">
        <PageHeader
          eyebrow="Chair tools"
          title="Tool unavailable"
          subtitle="This chair workspace tool is not available."
          bordered
          actions={<Button to={`/app/tools/${normalizedRoleSlug}`} variant="outline-secondary">Back to Chair Tool</Button>}
        />
        <EmptyState title="Tool unavailable" description="Choose an available chair workspace tool." />
      </Card>
    );
  }

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow="Chair tools"
        title={getRoleLabel(normalizedRoleSlug)}
        subtitle="Budget allocation and requests for this chair role."
        bordered
        actions={<Button to="/app/tools" variant="outline-secondary">All Tools</Button>}
      />

      {(loading || rolesLoading) && (
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading chair tool...</span>
        </div>
      )}

      {errorMessage && <div className="accounts-alert budget-alert">{errorMessage}</div>}

      {!loading && !errorMessage && (
        <>
          {(canUsePartyTool || canUseFormalTool) && (
            <>
              <SectionHeader
                title="Social chair tools"
                description="Social event creation, guest lists, payment tracking, and checklist work."
              />
              <div className="action-card-grid tools-grid">
                {canUsePartyTool && (
                  <ActionCard
                    to="/app/tools/social-chair/party-events"
                    eyebrow="Events"
                    title="Party events"
                    description="Create party events and manage pre/post party checklists."
                    meta="Party"
                  />
                )}
                {canUseFormalTool && (
                  <ActionCard
                    to="/app/tools/social-chair/formal-events"
                    eyebrow="Events"
                    title="Formal events"
                    description="Create formal events, calculate brother payments, and manage setup work."
                    meta="Formal"
                  />
                )}
              </div>
            </>
          )}

          {canUseCommunityServiceTool && (
            <>
              <SectionHeader
                title="Community Service tools"
                description="Service event creation, attendance tracking, hours, and Nationals logging status."
              />
              <div className="action-card-grid tools-grid">
                <ActionCard
                  to={`/app/tools/${normalizedRoleSlug}/community-service-events`}
                  eyebrow="Events"
                  title="Community service events"
                  description="Create service events and track brother hours logged with Nationals."
                  meta="Community Service"
                />
              </div>
            </>
          )}

          <SectionHeader
            title="Budget allocation"
            description={`Active cycle: ${getCycleLabel(cycle)}`}
            actions={
              canOpenBudgetAccount ? (
                <Button to={budgetAccountPath} size="sm">Submit request</Button>
              ) : undefined
            }
          />

          {!cycle ? (
            <EmptyState
              compact
              title="No active budget cycle"
              description="Budget allocation will appear when a cycle is active."
            />
          ) : !account ? (
            <EmptyState
              compact
              title="No budget allocation"
              description="No active-cycle budget account exists for this chair role."
            />
          ) : (
            <>
              <div className="chair-tool-detail-grid">
                <MetricCard label="Allocated" value={formatMoney(account.allocated_amount)} detail={account.role_slug} tone="gold" />
                <MetricCard label="Pending" value={formatMoney(summary.pending)} detail="submitted requests" tone="warning" />
                <MetricCard label="Remaining" value={formatMoney(summary.remaining)} detail="after approved and pending" tone={summary.remaining < 0 ? "danger" : "success"} />
              </div>

              <div className="chair-tool-row chair-tool-row--detail">
                <div className="chair-tool-main">
                  <h3>{getRoleLabel(account.role_slug)}</h3>
                  <p>{account.notes ?? "Chair budget account."}</p>
                </div>
                <div className="chair-tool-metrics">
                  <span>
                    Spent
                    <strong>{formatMoney(summary.spent)}</strong>
                  </span>
                  <span>
                    Requests
                    <strong>{transactions.length}</strong>
                  </span>
                  <span>
                    Access
                    <strong>{canOpenBudgetAccount ? "Open" : "View only"}</strong>
                  </span>
                </div>
                {canOpenBudgetAccount ? (
                  <Button to={budgetAccountPath} variant="outline-secondary" size="sm">Open budget</Button>
                ) : (
                  <Badge variant="neutral">View only</Badge>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
