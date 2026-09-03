import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  canAccessAllChairTools,
  canAccessBudgetAccount,
  canAccessBudgets,
  canAccessChairTool,
  canManageEventType,
  canManageBudgets,
  canManageWaitOns,
  getChairRoleSlugs,
  getKnownChairToolRoleSlugs,
  isChairRoleSlug,
} from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import { getRoleLabel, normalizeRoleSlugForDisplay } from "../../../auth/roleDisplay";
import { ActionCard, Badge, Button, Card, EmptyState, MetricCard, PageHeader, SectionHeader } from "../../../components/ui";
import { calculateBudgetSummary, formatMoney, type BudgetAccount, type BudgetCycle, type BudgetTransaction } from "../../../lib/budget";
import { getActiveBudgetCycle, getBudgetAccountsForCycle, getTransactionsForAccount } from "../../../lib/budgetQueries";
import {
  getEventToolDefinitionForRolePath,
  getEventToolDefinitionsForRole,
  getEventToolPath,
  type EventToolDefinition,
} from "../../../lib/eventTools";
import AlumniEventsTool from "./AlumniEventsTool";
import CommunityServiceEventsTool from "./CommunityServiceEventsTool";
import FormalEventsTool from "./FormalEventsTool";
import HouseMeetingsTool from "./HouseMeetingsTool";
import ManageEvents from "../ManageEvents";
import PartyEventsTool from "./PartyEventsTool";
import ProfessionalDevelopmentEventsTool from "./ProfessionalDevelopmentEventsTool";
import StewardWaitOnTool from "./StewardWaitOnTool";
import TreasurerBudgetTools from "./TreasurerBudgetTools";

const stewardRoleSlugs = new Set(["stew", "steward"]);
const recorderRoleSlugs = new Set(["rec", "recorder"]);
const treasurerRoleSlug = "treasurer";

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

function getChairToolDescription(roleSlug: string) {
  if (roleSlug === treasurerRoleSlug) {
    return "Budget requests, reimbursements, cycles, and allocations.";
  }

  if (stewardRoleSlugs.has(roleSlug)) {
    return "Weekly wait-on schedules and published forms.";
  }

  if (recorderRoleSlugs.has(roleSlug)) {
    return "Create and manage every event type.";
  }

  const eventTools = getEventToolDefinitionsForRole(roleSlug);
  if (eventTools.length === 1) {
    return eventTools[0].description;
  }

  if (eventTools.length > 1) {
    return `Create and manage ${eventTools.length} event tools.`;
  }

  return "Budget allocation and spending request access.";
}

function getChairWorkspaceSubtitle(roleSlug: string) {
  if (stewardRoleSlugs.has(roleSlug)) {
    return "Wait-on scheduling and budget access for this chair role.";
  }

  if (recorderRoleSlugs.has(roleSlug)) {
    return "Event creation and budget access for this chair role.";
  }

  if (getEventToolDefinitionsForRole(roleSlug).length > 0) {
    return "Event creation and budget access for this chair role.";
  }

  return "Budget allocation and requests for this chair role.";
}

function EventToolPage({
  definition,
  ownerLabel,
  returnPath,
  returnLabel,
}: {
  definition: EventToolDefinition;
  ownerLabel: string;
  returnPath: string;
  returnLabel: string;
}) {
  if (definition.eventType === "party") {
    return <PartyEventsTool ownerLabel={ownerLabel} returnPath={returnPath} />;
  }

  if (definition.eventType === "formal") {
    return <FormalEventsTool ownerLabel={ownerLabel} returnPath={returnPath} />;
  }

  if (definition.eventType === "community_service") {
    return <CommunityServiceEventsTool ownerLabel={ownerLabel} returnPath={returnPath} />;
  }

  if (definition.eventType === "alumni_event") {
    return <AlumniEventsTool ownerLabel={ownerLabel} returnPath={returnPath} />;
  }

  if (definition.eventType === "professional_development") {
    return <ProfessionalDevelopmentEventsTool ownerLabel={ownerLabel} returnPath={returnPath} />;
  }

  if (definition.eventType === "house_meeting") {
    return <HouseMeetingsTool ownerLabel={ownerLabel} returnPath={returnPath} />;
  }

  return (
    <ManageEvents
      title={definition.pageTitle}
      subtitle={definition.pageSubtitle}
      returnPath={returnPath}
      returnLabel={returnLabel}
      scopedEventTypes={[definition.eventType]}
    />
  );
}

export function ChairToolsIndex() {
  const { roles, loading: rolesLoading } = useRoles();
  const canViewAllChairTools = canAccessAllChairTools(roles);
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
                description={getChairToolDescription(roleSlug)}
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
  const nestedEventToolDefinition = getEventToolDefinitionForRolePath(normalizedRoleSlug, nestedToolPath);
  const isTreasurerWorkspace = normalizedRoleSlug === treasurerRoleSlug;
  const canViewBudgetAccountTool =
    isTreasurerWorkspace && /^accounts\/[^/]+$/.test(nestedToolPath) && canAccessBudgets(roles);
  const canViewEventTool = Boolean(
    nestedEventToolDefinition && canManageEventType(roles, nestedEventToolDefinition.eventType)
  );
  const canViewTool = Boolean(
    normalizedRoleSlug && (canAccessChairTool(roles, normalizedRoleSlug) || canViewBudgetAccountTool || canViewEventTool)
  );
  const canUseBudgetAdminAccess = canManageBudgets(roles);
  const canUseWaitOnTool = stewardRoleSlugs.has(normalizedRoleSlug) && canManageWaitOns(roles);
  const eventToolDefinitionsForRole = useMemo(
    () => getEventToolDefinitionsForRole(normalizedRoleSlug),
    [normalizedRoleSlug]
  );
  const accessibleEventToolDefinitions = useMemo(
    () =>
      eventToolDefinitionsForRole.filter((definition) =>
        canManageEventType(roles, definition.eventType)
      ),
    [eventToolDefinitionsForRole, roles]
  );
  const currentChairToolPath = `/app/tools/${normalizedRoleSlug}`;

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

    if (rolesLoading || nestedToolPath || isTreasurerWorkspace) {
      return () => {
        ignore = true;
      };
    }

    if (!canViewTool) {
      return () => {
        ignore = true;
      };
    }

    void loadToolData();

    return () => {
      ignore = true;
    };
  }, [canViewTool, isTreasurerWorkspace, nestedToolPath, normalizedRoleSlug, rolesLoading]);

  const summary = useMemo(
    () => calculateBudgetSummary(account ? [account] : [], transactions),
    [account, transactions]
  );
  const canOpenBudgetAccount = Boolean(
    account && (canUseBudgetAdminAccess || canAccessBudgetAccount(roles, account.role_slug))
  );
  const budgetAccountPath = account ? `/app/tools/treasurer/accounts/${account.id}` : "/app/tools";

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

  if (isTreasurerWorkspace) {
    return <TreasurerBudgetTools toolPath={nestedToolPath} />;
  }

  if (nestedToolPath === "wait-ons" && stewardRoleSlugs.has(normalizedRoleSlug)) {
    return (
      <StewardWaitOnTool
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={currentChairToolPath}
      />
    );
  }

  if (nestedToolPath === "house-events" && (normalizedRoleSlug === "hm" || normalizedRoleSlug === "house-manager")) {
    return <Navigate to={`${currentChairToolPath}/work-parties`} replace />;
  }

  if (nestedToolPath === "events" && recorderRoleSlugs.has(normalizedRoleSlug)) {
    return <Navigate to="/app/events/manage" replace />;
  }

  if (nestedEventToolDefinition) {
    const canReturnToWorkspace = canAccessChairTool(roles, normalizedRoleSlug);
    const returnPath = canReturnToWorkspace ? currentChairToolPath : "/app/events/manage";
    const returnLabel = canReturnToWorkspace ? `${getRoleLabel(normalizedRoleSlug)} Tools` : "Manage Events";

    return (
      <EventToolPage
        definition={nestedEventToolDefinition}
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={returnPath}
        returnLabel={returnLabel}
      />
    );
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
        subtitle={getChairWorkspaceSubtitle(normalizedRoleSlug)}
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
          {accessibleEventToolDefinitions.length > 0 && (
            <>
              <SectionHeader
                title="Event creation tools"
                description="Create calendar events one type at a time."
              />
              <div className="action-card-grid tools-grid">
                {accessibleEventToolDefinitions.map((definition) => (
                  <ActionCard
                    key={definition.eventType}
                    to={getEventToolPath(definition, normalizedRoleSlug)}
                    eyebrow="Events"
                    title={definition.title}
                    description={definition.description}
                    meta={definition.meta}
                  />
                ))}
              </div>
            </>
          )}

          {canUseWaitOnTool && (
            <>
              <SectionHeader
                title="Steward tools"
                description="Weekly wait-on assignment scheduling and publishing."
              />
              <div className="action-card-grid tools-grid">
                <ActionCard
                  to={`${currentChairToolPath}/wait-ons`}
                  eyebrow="Wait-ons"
                  title="Wait-on scheduler"
                  description="Assign brothers to weekly meal, mop, and Sunday wait-on slots."
                  meta="Weekly"
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
