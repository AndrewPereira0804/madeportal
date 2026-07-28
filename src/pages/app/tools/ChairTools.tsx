import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  canAccessAllChairTools,
  canAccessBudgetAccount,
  canAccessBudgets,
  canAccessChairTool,
  canManageAlumniEvents,
  canManageCommunityServiceEvents,
  canManageFormalEvents,
  canManageEventType,
  canManagePartyEvents,
  canManageProfessionalDevelopmentEvents,
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
import { eventTypeOptions, type EventTypeSlug } from "../../../lib/eventTypes";
import AlumniEventsTool from "./AlumniEventsTool";
import CommunityServiceEventsTool from "./CommunityServiceEventsTool";
import FormalEventsTool from "./FormalEventsTool";
import ManageEvents from "../ManageEvents";
import PartyEventsTool from "./PartyEventsTool";
import ProfessionalDevelopmentEventsTool from "./ProfessionalDevelopmentEventsTool";
import StewardWaitOnTool from "./StewardWaitOnTool";
import TreasurerBudgetTools from "./TreasurerBudgetTools";

const socialChairRoleSlug = "social-chair";
const alumniChairRoleSlugs = new Set(["alumni-chair", "alumni-chairman"]);
const partyFormalToolRoleSlugs = new Set([socialChairRoleSlug, "hsm", "health-safety-manager"]);
const communityServiceChairRoleSlugs = new Set(["cs-chair", "community-service-chair"]);
const professionalDevelopmentRoleSlugs = new Set([
  "professional-dev",
  "professional-dev-chair",
  "professional-development",
  "professional-development-chair",
]);
const stewardRoleSlugs = new Set(["stew", "steward"]);
const recorderRoleSlugs = new Set(["rec", "recorder"]);
const treasurerRoleSlug = "treasurer";

type ScopedChairEventToolConfig = {
  path: string;
  sectionTitle: string;
  sectionDescription: string;
  cardTitle: string;
  cardDescription: string;
  cardMeta: string;
  pageTitle: string;
  pageSubtitle: string;
  eventTypes: EventTypeSlug[];
};

const chapterDevelopmentEventTool: ScopedChairEventToolConfig = {
  path: "brotherhood-events",
  sectionTitle: "Chapter Development tools",
  sectionDescription: "Brotherhood event creation and calendar management.",
  cardTitle: "Brotherhood events",
  cardDescription: "Create brotherhood events and manage calendar details.",
  cardMeta: "Brotherhood",
  pageTitle: "Brotherhood Events",
  pageSubtitle: "Create, edit, and delete brotherhood events you are permitted to manage.",
  eventTypes: ["brotherhood_event"],
};

const philanthropyEventTool: ScopedChairEventToolConfig = {
  path: "philanthropy-events",
  sectionTitle: "Philanthropy tools",
  sectionDescription: "Philanthropy event creation and calendar management.",
  cardTitle: "Philanthropy events",
  cardDescription: "Create philanthropy events and manage calendar details.",
  cardMeta: "Philanthropy",
  pageTitle: "Philanthropy Events",
  pageSubtitle: "Create, edit, and delete philanthropy events you are permitted to manage.",
  eventTypes: ["philanthropy"],
};

const scholarshipEventTool: ScopedChairEventToolConfig = {
  path: "scholarship-events",
  sectionTitle: "Scholarship tools",
  sectionDescription: "Scholarship event creation and calendar management.",
  cardTitle: "Scholarship events",
  cardDescription: "Create scholarship events and manage calendar details.",
  cardMeta: "Scholarship",
  pageTitle: "Scholarship Events",
  pageSubtitle: "Create, edit, and delete scholarship events you are permitted to manage.",
  eventTypes: ["scholarship"],
};

const newMemberEventTool: ScopedChairEventToolConfig = {
  path: "new-member-events",
  sectionTitle: "Member Educator tools",
  sectionDescription: "New member meeting and event creation.",
  cardTitle: "New member events",
  cardDescription: "Create new member meetings and events for the chapter calendar.",
  cardMeta: "New Members",
  pageTitle: "New Member Events",
  pageSubtitle: "Create, edit, and delete new member meetings and events you are permitted to manage.",
  eventTypes: ["new_member_meeting", "new_member_event"],
};

const houseManagerEventTool: ScopedChairEventToolConfig = {
  path: "house-events",
  sectionTitle: "House Manager tools",
  sectionDescription: "House Manager event creation.",
  cardTitle: "House events",
  cardDescription: "Create work party events for the chapter calendar.",
  cardMeta: "House",
  pageTitle: "House Events",
  pageSubtitle: "Create, edit, and delete events you are permitted to manage.",
  eventTypes: ["work_party"],
};

const recorderEventTool: ScopedChairEventToolConfig = {
  path: "events",
  sectionTitle: "Recorder tools",
  sectionDescription: "Create and manage events for every chair event type.",
  cardTitle: "All events",
  cardDescription: "Create any event type and manage calendar details.",
  cardMeta: "All Event Types",
  pageTitle: "Recorder Events",
  pageSubtitle: "Create, edit, and delete events across every chair event type.",
  eventTypes: eventTypeOptions.map((eventType) => eventType.slug),
};

const scopedChairEventToolsByRoleSlug: Record<string, ScopedChairEventToolConfig> = {
  "chapter-dev": chapterDevelopmentEventTool,
  "chapter-dev-chair": chapterDevelopmentEventTool,
  "chapter-development": chapterDevelopmentEventTool,
  "chapter-development-chair": chapterDevelopmentEventTool,
  "philo-chair": philanthropyEventTool,
  "philanthropy-chair": philanthropyEventTool,
  scholarship: scholarshipEventTool,
  membered: newMemberEventTool,
  "member-educator": newMemberEventTool,
  hm: houseManagerEventTool,
  "house-manager": houseManagerEventTool,
  rec: recorderEventTool,
  recorder: recorderEventTool,
};

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

  if (alumniChairRoleSlugs.has(roleSlug)) {
    return "Alumni event creation and location details.";
  }

  if (stewardRoleSlugs.has(roleSlug)) {
    return "Weekly wait-on schedules and published forms.";
  }

  if (professionalDevelopmentRoleSlugs.has(roleSlug)) {
    return "Professional development event creation and speaker details.";
  }

  if (recorderRoleSlugs.has(roleSlug)) {
    return "Create and manage every chair event type.";
  }

  if (scopedChairEventToolsByRoleSlug[roleSlug]) {
    return scopedChairEventToolsByRoleSlug[roleSlug].cardDescription;
  }

  return "Budget allocation and spending request access.";
}

function getChairWorkspaceSubtitle(roleSlug: string) {
  if (stewardRoleSlugs.has(roleSlug)) {
    return "Wait-on scheduling and budget access for this chair role.";
  }

  if (recorderRoleSlugs.has(roleSlug)) {
    return "All event creation and budget access for this chair role.";
  }

  if (scopedChairEventToolsByRoleSlug[roleSlug]) {
    return "Event creation and budget access for this chair role.";
  }

  return "Budget allocation and requests for this chair role.";
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
  const isTreasurerWorkspace = normalizedRoleSlug === treasurerRoleSlug;
  const canViewBudgetAccountTool =
    isTreasurerWorkspace && /^accounts\/[^/]+$/.test(nestedToolPath) && canAccessBudgets(roles);
  const canViewTool = Boolean(
    normalizedRoleSlug && (canAccessChairTool(roles, normalizedRoleSlug) || canViewBudgetAccountTool)
  );
  const canUseBudgetAdminAccess = canManageBudgets(roles);
  const canUseAlumniTool = alumniChairRoleSlugs.has(normalizedRoleSlug) && canManageAlumniEvents(roles);
  const canUsePartyTool = partyFormalToolRoleSlugs.has(normalizedRoleSlug) && canManagePartyEvents(roles);
  const canUseFormalTool = partyFormalToolRoleSlugs.has(normalizedRoleSlug) && canManageFormalEvents(roles);
  const canUseCommunityServiceTool =
    communityServiceChairRoleSlugs.has(normalizedRoleSlug) && canManageCommunityServiceEvents(roles);
  const canUseProfessionalDevelopmentTool =
    professionalDevelopmentRoleSlugs.has(normalizedRoleSlug) && canManageProfessionalDevelopmentEvents(roles);
  const canUseWaitOnTool = stewardRoleSlugs.has(normalizedRoleSlug) && canManageWaitOns(roles);
  const scopedChairEventToolConfig = scopedChairEventToolsByRoleSlug[normalizedRoleSlug];
  const canUseScopedChairEventTool = Boolean(
    scopedChairEventToolConfig &&
      (canAccessAllChairTools(roles) ||
        scopedChairEventToolConfig.eventTypes.some((eventType) => canManageEventType(roles, eventType)))
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
      setLoading(false);
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

  if (nestedToolPath === "party-events" && partyFormalToolRoleSlugs.has(normalizedRoleSlug)) {
    return (
      <PartyEventsTool
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={currentChairToolPath}
      />
    );
  }

  if (nestedToolPath === "formal-events" && partyFormalToolRoleSlugs.has(normalizedRoleSlug)) {
    return (
      <FormalEventsTool
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={currentChairToolPath}
      />
    );
  }

  if (nestedToolPath === "community-service-events" && communityServiceChairRoleSlugs.has(normalizedRoleSlug)) {
    return <CommunityServiceEventsTool />;
  }

  if (nestedToolPath === "alumni-events" && alumniChairRoleSlugs.has(normalizedRoleSlug)) {
    return (
      <AlumniEventsTool
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={currentChairToolPath}
      />
    );
  }

  if (nestedToolPath === "professional-development-events" && professionalDevelopmentRoleSlugs.has(normalizedRoleSlug)) {
    return (
      <ProfessionalDevelopmentEventsTool
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={currentChairToolPath}
      />
    );
  }

  if (nestedToolPath === "wait-ons" && stewardRoleSlugs.has(normalizedRoleSlug)) {
    return (
      <StewardWaitOnTool
        ownerLabel={getRoleLabel(normalizedRoleSlug)}
        returnPath={currentChairToolPath}
      />
    );
  }

  if (scopedChairEventToolConfig && nestedToolPath === scopedChairEventToolConfig.path) {
    return (
      <ManageEvents
        title={scopedChairEventToolConfig.pageTitle}
        subtitle={scopedChairEventToolConfig.pageSubtitle}
        returnPath={currentChairToolPath}
        returnLabel={`${getRoleLabel(normalizedRoleSlug)} Tools`}
        scopedEventTypes={scopedChairEventToolConfig.eventTypes}
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
          {canUseAlumniTool && (
            <>
              <SectionHeader
                title="Alumni Chairman tools"
                description="Alumni event creation with public location details."
              />
              <div className="action-card-grid tools-grid">
                <ActionCard
                  to={`${currentChairToolPath}/alumni-events`}
                  eyebrow="Events"
                  title="Alumni events"
                  description="Create alumni events and publish location details for alumni accounts."
                  meta="Alumni"
                />
              </div>
            </>
          )}

          {(canUsePartyTool || canUseFormalTool) && (
            <>
              <SectionHeader
                title={normalizedRoleSlug === socialChairRoleSlug ? "Social chair tools" : "Party and formal tools"}
                description="Party and formal event creation, guest lists, payment tracking, and checklist work."
              />
              <div className="action-card-grid tools-grid">
                {canUsePartyTool && (
                  <ActionCard
                    to={`${currentChairToolPath}/party-events`}
                    eyebrow="Events"
                    title="Party events"
                    description="Create party events and manage pre/post party checklists."
                    meta="Party"
                  />
                )}
                {canUseFormalTool && (
                  <ActionCard
                    to={`${currentChairToolPath}/formal-events`}
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

          {canUseProfessionalDevelopmentTool && (
            <>
              <SectionHeader
                title="Professional Development tools"
                description="Professional development event creation with optional speaker details."
              />
              <div className="action-card-grid tools-grid">
                <ActionCard
                  to={`${currentChairToolPath}/professional-development-events`}
                  eyebrow="Events"
                  title="Professional development events"
                  description="Create professional development events and publish speaker details."
                  meta="Professional Development"
                />
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

          {scopedChairEventToolConfig && canUseScopedChairEventTool && (
            <>
              <SectionHeader
                title={scopedChairEventToolConfig.sectionTitle}
                description={scopedChairEventToolConfig.sectionDescription}
              />
              <div className="action-card-grid tools-grid">
                <ActionCard
                  to={`${currentChairToolPath}/${scopedChairEventToolConfig.path}`}
                  eyebrow="Events"
                  title={scopedChairEventToolConfig.cardTitle}
                  description={scopedChairEventToolConfig.cardDescription}
                  meta={scopedChairEventToolConfig.cardMeta}
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
