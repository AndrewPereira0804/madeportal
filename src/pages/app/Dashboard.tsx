import { useEffect, useMemo, useState } from "react";
import {
  canAccessBudgetAccount,
  canAccessBudgets,
  canAccessManagement,
  canCreateAnnouncements,
  canManageBudgets,
  canManageEvents,
  canManageMembers,
  canViewEvent,
  getChapterStatus,
  getChairRoleSlugs,
  isChapterStatusRoleSlug,
  type ChapterStatus,
} from "../../auth/roleAccess";
import { useAuth } from "../../auth/authContext";
import useRoles from "../../auth/useRoles";
import {
  ActionCard,
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeader,
} from "../../components/ui";
import supabase from "../../config/supabaseClient";
import {
  calculateBudgetSummary,
  formatMoney,
  type BudgetAccount,
  type BudgetCycle,
  type BudgetTransaction,
} from "../../lib/budget";
import {
  getActiveBudgetCycle,
  getBudgetAccountsForCycle,
  getBudgetTransactionsByStatus,
  getTransactionsForAccounts,
} from "../../lib/budgetQueries";

type DashboardProfile = {
  name: string | null;
  email: string | null;
  status: string | null;
};

type RoleRow = {
  slug: string;
  name: string;
};

type AnnouncementPreview = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  visibility: string | null;
};

type EventPreview = {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  created_by: string | null;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

const roleLabelFallbacks: Record<string, string> = {
  admin: "Admin",
  alum: "Alumni",
  alumni: "Alumni",
  brother: "Brother",
  "cs-chair": "Community Service Chairman",
  ea: "President",
  eda: "Vice President",
  hm: "House Manager",
  hsm: "Health & Safety Manager",
  "membered": "Member Educator",
  neophyte: "Neophyte",
  "philo-chair": "Philanthropy Chairman",
  rec: "Recorder",
  scholarship: "Scholarship Chairman",
  "social-chair": "Social Chairman",
  stew: "Steward",
  treasurer: "Treasurer",
};

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function roleLabel(slug: string, roleLookup: Record<string, string>) {
  const normalized = normalizeSlug(slug);
  if (roleLookup[normalized]) {
    return roleLookup[normalized];
  }

  if (roleLabelFallbacks[normalized]) {
    return roleLabelFallbacks[normalized];
  }

  return normalized
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Time not set";
  }

  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatChapterStatus(status: ChapterStatus | null) {
  if (!status) {
    return "Unassigned";
  }

  return status === "alumni" ? "Alumni" : status.charAt(0).toUpperCase() + status.slice(1);
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

function getDisplayName(profile: DashboardProfile | null, fallbackEmail: string | undefined) {
  const source = profile?.name ?? profile?.email ?? fallbackEmail;
  if (!source) {
    return "Member";
  }

  return source.includes("@") ? source.split("@")[0] : source;
}

function canShowAnnouncementForChapter(announcement: AnnouncementPreview, chapterStatus: ChapterStatus | null) {
  if (chapterStatus !== "alumni") {
    return true;
  }

  const visibility = normalizeSlug(announcement.visibility ?? "");
  return visibility === "" || visibility === "active" || visibility === "general" || visibility === "all" || visibility === "alum" || visibility === "alumni";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function SkeletonStack() {
  return (
    <div className="loading-stack" aria-label="Loading">
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line--short" />
      <span className="skeleton-line" />
    </div>
  );
}

export default function Dashboard() {
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const userId = session?.user?.id ?? null;

  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [roleLookup, setRoleLookup] = useState<Record<string, string>>({});
  const [announcements, setAnnouncements] = useState<AnnouncementPreview[]>([]);
  const [events, setEvents] = useState<EventPreview[]>([]);
  const [pendingMemberCount, setPendingMemberCount] = useState<number | null>(null);
  const [pendingBudgetRequests, setPendingBudgetRequests] = useState<BudgetTransaction[]>([]);
  const [activeBudgetCycle, setActiveBudgetCycle] = useState<BudgetCycle | null>(null);
  const [budgetAccounts, setBudgetAccounts] = useState<BudgetAccount[]>([]);
  const [budgetTransactions, setBudgetTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const chapterStatus = useMemo(() => getChapterStatus(roles), [roles]);
  const isAlumni = chapterStatus === "alumni";
  const hasManagementAccess = canAccessManagement(roles);
  const hasMemberManagementAccess = canManageMembers(roles);
  const hasBudgetAccess = canAccessBudgets(roles);
  const hasBudgetAdminAccess = canManageBudgets(roles);
  const hasEventManagementAccess = canManageEvents(roles);
  const hasAnnouncementShortcutAccess = canCreateAnnouncements(roles);
  const chairRoleSlugs = useMemo(() => getChairRoleSlugs(roles), [roles]);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      if (!userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessages([]);

      const nextErrors: string[] = [];
      const now = new Date().toISOString();

      const [profileResult, roleResult, announcementResult, eventResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("name,email,status")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("roles").select("slug,name").order("name", { ascending: true }),
        supabase
          .from("announcements")
          .select("id, title, body, created_at, visibility")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("events")
          .select("id, title, description, start, end, created_by, visible_to_alum, visible_to_neophyte")
          .gte("end", now)
          .order("start", { ascending: true })
          .limit(12),
      ]);

      if (profileResult.error) {
        nextErrors.push(`Could not load your profile: ${profileResult.error.message}`);
      }

      if (roleResult.error) {
        nextErrors.push(`Could not load role labels: ${roleResult.error.message}`);
      }

      if (announcementResult.error) {
        nextErrors.push(`Could not load announcements: ${announcementResult.error.message}`);
      }

      if (eventResult.error) {
        nextErrors.push(`Could not load events: ${eventResult.error.message}`);
      }

      let nextPendingMemberCount: number | null = null;
      if (hasMemberManagementAccess) {
        const { count, error } = await supabase
          .from("profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("status", "pending");

        if (error) {
          nextErrors.push(`Could not load pending member tasks: ${error.message}`);
        } else {
          nextPendingMemberCount = count ?? 0;
        }
      }

      let nextPendingBudgetRequests: BudgetTransaction[] = [];
      if (hasBudgetAdminAccess) {
        try {
          nextPendingBudgetRequests = await getBudgetTransactionsByStatus(["submitted"]);
        } catch (error) {
          nextErrors.push(`Could not load pending budget requests: ${getErrorMessage(error)}`);
        }
      }

      let nextActiveBudgetCycle: BudgetCycle | null = null;
      let nextBudgetAccounts: BudgetAccount[] = [];
      let nextBudgetTransactions: BudgetTransaction[] = [];
      const shouldLoadBudgetSnapshot = hasBudgetAccess || hasBudgetAdminAccess || chairRoleSlugs.length > 0;

      if (shouldLoadBudgetSnapshot) {
        try {
          nextActiveBudgetCycle = await getActiveBudgetCycle();

          if (nextActiveBudgetCycle) {
            const allAccounts = await getBudgetAccountsForCycle(nextActiveBudgetCycle.id);
            const chairRoleSet = new Set(chairRoleSlugs.map(normalizeSlug));
            nextBudgetAccounts = hasBudgetAdminAccess
              ? allAccounts
              : allAccounts.filter(
                  (account) =>
                    canAccessBudgetAccount(roles, account.role_slug) ||
                    chairRoleSet.has(normalizeSlug(account.role_slug))
                );
            nextBudgetTransactions = await getTransactionsForAccounts(
              nextBudgetAccounts.map((account) => account.id)
            );
          }
        } catch (error) {
          nextErrors.push(`Could not load budget allocations: ${getErrorMessage(error)}`);
        }
      }

      if (ignore) {
        return;
      }

      const nextRoleLookup = ((roleResult.data ?? []) as RoleRow[]).reduce<Record<string, string>>(
        (lookup, role) => {
          lookup[normalizeSlug(role.slug)] = role.name;
          return lookup;
        },
        {}
      );

      setProfile((profileResult.data ?? null) as DashboardProfile | null);
      setRoleLookup(nextRoleLookup);
      setAnnouncements((announcementResult.data ?? []) as AnnouncementPreview[]);
      setEvents((eventResult.data ?? []) as EventPreview[]);
      setPendingMemberCount(nextPendingMemberCount);
      setPendingBudgetRequests(nextPendingBudgetRequests);
      setActiveBudgetCycle(nextActiveBudgetCycle);
      setBudgetAccounts(nextBudgetAccounts);
      setBudgetTransactions(nextBudgetTransactions);
      setErrorMessages(nextErrors);
      setLoading(false);
    }

    if (rolesLoading) {
      return () => {
        ignore = true;
      };
    }

    void loadDashboard();

    return () => {
      ignore = true;
    };
  }, [
    chairRoleSlugs,
    hasBudgetAccess,
    hasBudgetAdminAccess,
    hasMemberManagementAccess,
    roles,
    rolesLoading,
    userId,
  ]);

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => canViewEvent(roles, event, userId))
      .slice(0, 4);
  }, [events, roles, userId]);

  const visibleAnnouncements = useMemo(() => {
    return announcements
      .filter((announcement) => canShowAnnouncementForChapter(announcement, chapterStatus))
      .slice(0, 4);
  }, [announcements, chapterStatus]);

  const positionRoleSlugs = useMemo(
    () => roles.filter((roleSlug) => !isChapterStatusRoleSlug(roleSlug)),
    [roles]
  );

  const roleSummary = positionRoleSlugs.length > 0
    ? positionRoleSlugs.slice(0, 2).map((roleSlug) => roleLabel(roleSlug, roleLookup)).join(", ")
    : formatChapterStatus(chapterStatus);
  const displayName = getDisplayName(profile, session?.user?.email);
  const pendingBudgetTotal = pendingBudgetRequests.reduce((total, request) => total + request.amount, 0);
  const budgetAccountByRoleSlug = useMemo(
    () => new Map(budgetAccounts.map((account) => [normalizeSlug(account.role_slug), account])),
    [budgetAccounts]
  );
  const budgetTransactionsByAccountId = useMemo(() => {
    const grouped = new Map<string, BudgetTransaction[]>();
    for (const transaction of budgetTransactions) {
      const transactionsForAccount = grouped.get(transaction.budget_account_id) ?? [];
      transactionsForAccount.push(transaction);
      grouped.set(transaction.budget_account_id, transactionsForAccount);
    }
    return grouped;
  }, [budgetTransactions]);
  const chairAccounts = chairRoleSlugs
    .map((roleSlug) => budgetAccountByRoleSlug.get(normalizeSlug(roleSlug)) ?? null)
    .filter((account): account is BudgetAccount => account !== null);

  return (
    <div className="dashboard-page">
      <Card className="dashboard-hero" padding="lg">
        <PageHeader
          eyebrow="Mass Delta Portal"
          title={`Welcome, ${displayName}`}
          subtitle="Your dashboard changes with your chapter status and active roles."
          actions={
            hasAnnouncementShortcutAccess ? (
              <Button to="/app/announcements/create">Post update</Button>
            ) : undefined
          }
        />

        <div className="dashboard-role-strip" aria-label="Current access">
          <div className="dashboard-role-group">
            <span className="dashboard-role-label">Chapter status</span>
            <Badge variant={chapterStatus === "alumni" ? "neutral" : "info"}>
              {formatChapterStatus(chapterStatus)}
            </Badge>
          </div>
          <div className="dashboard-role-group dashboard-role-group--wide">
            <span className="dashboard-role-label">Active positions</span>
            <div className="dashboard-role-badges">
              {positionRoleSlugs.length > 0 ? (
                positionRoleSlugs.map((roleSlug) => (
                  <Badge key={roleSlug} variant="neutral">
                    {roleLabel(roleSlug, roleLookup)}
                  </Badge>
                ))
              ) : (
                <span className="dashboard-muted-text">No active positions assigned.</span>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-metrics" aria-label="Portal overview">
          <MetricCard
            label="Upcoming events"
            value={rolesLoading || loading ? "..." : visibleEvents.length}
            detail={isAlumni ? "alumni-visible events" : "visible to your roles"}
            tone="gold"
          />
          <MetricCard
            label="Latest posts"
            value={rolesLoading || loading ? "..." : visibleAnnouncements.length}
            detail={isAlumni ? "general announcements" : "recent announcements"}
            tone="info"
          />
          <MetricCard
            label="Access lane"
            value={roleSummary}
            detail={positionRoleSlugs.length > 2 ? `+${positionRoleSlugs.length - 2} more role(s)` : "current role set"}
            tone="default"
          />
        </div>
      </Card>

      {errorMessages.length > 0 && (
        <div className="alert alert-warning mt-1 mb-0">
          {errorMessages.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}

      <div className="dashboard-grid">
        <Card className="dashboard-panel" padding="lg">
          <SectionHeader
            title="Upcoming events"
            description={isAlumni ? "Alumni-visible events returned by the calendar." : "Upcoming events visible to your roles."}
            actions={<Button to="/app/scheduling" variant="outline-secondary" size="sm">Open calendar</Button>}
          />

          {loading || rolesLoading ? (
            <SkeletonStack />
          ) : visibleEvents.length === 0 ? (
            <EmptyState
              compact
              title="No visible events"
              description={isAlumni ? "There are no upcoming alumni-visible events." : "There are no upcoming events for your current role set."}
            />
          ) : (
            <div className="event-preview-list">
              {visibleEvents.map((event) => (
                <article key={event.id} className="event-preview-card">
                  <div className="event-preview-date">
                    <span>{formatShortDate(event.start)}</span>
                    <strong>{new Date(event.start).toLocaleDateString("en-US", { weekday: "short" })}</strong>
                  </div>
                  <div className="event-preview-body">
                    <h3>{event.title}</h3>
                    <p>{event.description || "No description provided."}</p>
                    <span>{formatDateTime(event.start)} to {formatDateTime(event.end)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card className="dashboard-panel" padding="lg">
          <SectionHeader
            title="Recent announcements"
            description={isAlumni ? "General and alumni-visible posts." : "Latest chapter posts."}
            actions={<Button to="/app/announcements" variant="outline-secondary" size="sm">View all</Button>}
          />

          {loading || rolesLoading ? (
            <SkeletonStack />
          ) : visibleAnnouncements.length === 0 ? (
            <EmptyState
              compact
              title="No announcements yet"
              description={isAlumni ? "There are no alumni-visible announcements." : "New chapter updates will appear here."}
            />
          ) : (
            <div className="announcement-preview-list">
              {visibleAnnouncements.map((announcement) => (
                <article key={announcement.id} className="announcement-preview-card">
                  <div>
                    <h3>{announcement.title}</h3>
                    <p>{announcement.body || "No announcement body provided."}</p>
                  </div>
                  <div className="announcement-preview-meta">
                    <Badge variant="info">{announcement.visibility ?? "general"}</Badge>
                    <span>{formatShortDate(announcement.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>

      <section className="dashboard-section" aria-label="Quick actions">
        <SectionHeader
          title="Quick actions"
          description={isAlumni ? "Alumni-visible Portal areas." : "Common routes for your current access."}
          className="mt-0"
        />

        <div className="action-card-grid dashboard-quick-actions">
          <ActionCard
            to="/app/scheduling"
            eyebrow="Scheduling"
            title="Open calendar"
            description="View upcoming events."
            meta="Events"
          />
          <ActionCard
            to="/app/announcements"
            eyebrow="Updates"
            title="Read announcements"
            description="Catch up on recent chapter posts."
            meta="Feed"
          />
          {!isAlumni && (
            <ActionCard
              to="/app/directory"
              eyebrow="Members"
              title="Open member directory"
              description="Search active members."
              meta="Directory"
            />
          )}
          {!isAlumni && hasBudgetAccess && (
            <ActionCard
              to="/app/budget"
              eyebrow="Finance"
              title="Review budget position"
              description="View balances and expenses."
              meta="Budget"
            />
          )}
          {!isAlumni && hasManagementAccess && (
            <ActionCard
              to="/app/manage"
              eyebrow="Operations"
              title="Open management"
              description="Review member and chapter operation tools."
              meta="Manage"
            />
          )}
          {!isAlumni && hasAnnouncementShortcutAccess && (
            <ActionCard
              to="/app/announcements/create"
              eyebrow="Announcements"
              title="Create announcement"
              description="Post a chapter update."
              meta="Post"
            />
          )}
          {!isAlumni && hasEventManagementAccess && (
            <ActionCard
              to="/app/events/manage"
              eyebrow="Events"
              title="Create or manage event"
              description="Prepare scheduling updates."
              meta="Events"
            />
          )}
        </div>
      </section>

      {!isAlumni && (
        <div className="dashboard-role-grid" aria-label="Role-based modules">
          {hasManagementAccess && (
            <Card className="dashboard-role-card" padding="lg">
              <SectionHeader
                title="Management"
                description="Member and chapter operations for admin, President, and Vice President roles."
                actions={<Button to="/app/manage" variant="outline-secondary" size="sm">Open</Button>}
              />

              {loading || rolesLoading ? (
                <SkeletonStack />
              ) : pendingMemberCount === null ? (
                <EmptyState compact title="Pending tasks unavailable" description="The member task summary could not be loaded." />
              ) : pendingMemberCount === 0 ? (
                <EmptyState compact title="No pending member tasks" description="There are no pending account approvals right now." />
              ) : (
                <div className="dashboard-task-row">
                  <div>
                    <span className="dashboard-task-count">{pendingMemberCount}</span>
                    <span className="dashboard-task-label">pending member task{pendingMemberCount === 1 ? "" : "s"}</span>
                  </div>
                  <Button to="/app/manage/members" variant="outline-secondary" size="sm">Review members</Button>
                </div>
              )}
            </Card>
          )}

          {hasBudgetAdminAccess && (
            <Card className="dashboard-role-card" padding="lg">
              <SectionHeader
                title="Budget management"
                description={`Active cycle: ${getCycleLabel(activeBudgetCycle)}`}
                actions={<Button to="/app/budget/admin" variant="outline-secondary" size="sm">Open</Button>}
              />

              {loading || rolesLoading ? (
                <SkeletonStack />
              ) : pendingBudgetRequests.length === 0 ? (
                <EmptyState compact title="No pending budget requests" description="Submitted requests will appear here for review." />
              ) : (
                <div className="dashboard-task-row">
                  <div>
                    <span className="dashboard-task-count">{pendingBudgetRequests.length}</span>
                    <span className="dashboard-task-label">
                      pending request{pendingBudgetRequests.length === 1 ? "" : "s"} totaling {formatMoney(pendingBudgetTotal)}
                    </span>
                  </div>
                  <Button to="/app/budget/admin" variant="outline-secondary" size="sm">Review requests</Button>
                </div>
              )}
            </Card>
          )}

          <Card className="dashboard-role-card dashboard-role-card--chair" padding="lg">
            <SectionHeader
              title="My chair tools"
              description={`Budget cycle: ${getCycleLabel(activeBudgetCycle)}`}
              actions={hasBudgetAccess ? <Button to="/app/budget" variant="outline-secondary" size="sm">Budget</Button> : undefined}
            />

            {loading || rolesLoading ? (
              <SkeletonStack />
            ) : chairRoleSlugs.length === 0 ? (
              <EmptyState compact title="No chair roles assigned" description="Chair-specific tools will appear here when a chair role is assigned." />
            ) : (
              <>
                {chairAccounts.length === 0 && (
                  <EmptyState
                    compact
                    title="No budget allocation"
                    description="Your chair role does not have an account in the active budget cycle."
                    className="dashboard-chair-empty"
                  />
                )}
                <div className="chair-tool-list">
                  {chairRoleSlugs.map((roleSlug) => {
                    const account = budgetAccountByRoleSlug.get(normalizeSlug(roleSlug)) ?? null;
                    const accountTransactions = account ? budgetTransactionsByAccountId.get(account.id) ?? [] : [];
                    const summary = calculateBudgetSummary(account ? [account] : [], accountTransactions);
                    const canSubmitRequest = Boolean(account && canAccessBudgetAccount(roles, account.role_slug));

                    return (
                      <article key={roleSlug} className="chair-tool-row">
                        <div className="chair-tool-main">
                          <h3>{roleLabel(roleSlug, roleLookup)}</h3>
                          <p>{account?.notes ?? "Chair budget access and spending requests."}</p>
                        </div>
                        <div className="chair-tool-metrics">
                          <span>
                            Allocated
                            <strong>{account ? formatMoney(account.allocated_amount) : "Not assigned"}</strong>
                          </span>
                          <span>
                            Remaining
                            <strong>{account ? formatMoney(summary.remaining) : "No allocation"}</strong>
                          </span>
                          <span>
                            Pending
                            <strong>{account ? formatMoney(summary.pending) : "No requests"}</strong>
                          </span>
                        </div>
                        {account ? (
                          canSubmitRequest ? (
                            <Button to={`/app/budget/${account.id}`} variant="outline-secondary" size="sm">Submit request</Button>
                          ) : (
                            <Badge variant="neutral">Allocation only</Badge>
                          )
                        ) : (
                          <Badge variant="warning">No allocation</Badge>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
