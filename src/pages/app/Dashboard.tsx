import { useEffect, useMemo, useState } from "react";
import {
  canAccessAllChairTools,
  canAccessManagement,
  canCreateAnnouncements,
  canManageBudgets,
  canManageEvents,
  canManageMembers,
  canViewEvent,
  getChapterStatus,
  getChairRoleSlugs,
  hasAlumniRole,
  isChapterStatusRoleSlug,
  type ChapterStatus,
} from "../../auth/roleAccess";
import { useAuth } from "../../auth/authContext";
import { buildRoleLabelLookup, getRoleLabel, normalizeRoleSlugForDisplay } from "../../auth/roleDisplay";
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
  formatMoney,
  type BudgetCycle,
  type BudgetTransaction,
} from "../../lib/budget";
import {
  getActiveBudgetCycle,
  getBudgetTransactionsByStatus,
} from "../../lib/budgetQueries";
import { formatEventDateTime, toCurrentEventTimestamp } from "../../lib/eventDateTime";
import { getEventTypeClassName, getEventTypeLabel, type EventTypeSlug } from "../../lib/eventTypes";
import { getPublishedWaitOnsForUserWeek } from "../../lib/waitOnQueries";
import { formatWaitOnSlotLabel, getCurrentWeekStartValue, type WaitOnAssignment } from "../../lib/waitOns";

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
  event_type: EventTypeSlug | null;
  start: string;
  end: string;
  created_by: string | null;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

const RECENT_ANNOUNCEMENT_WINDOW_DAYS = 14;

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getRecentAnnouncementCutoff() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_ANNOUNCEMENT_WINDOW_DAYS);
  return cutoff.toISOString();
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

  const visibility = normalizeRoleSlugForDisplay(announcement.visibility ?? "");
  return visibility === "" || visibility === "active" || visibility === "general" || visibility === "all" || visibility === "alum" || visibility === "alumni";
}

function isRecentAnnouncement(announcement: AnnouncementPreview, cutoffTimestamp: number) {
  return new Date(announcement.created_at).getTime() >= cutoffTimestamp;
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
  const [waitOnAssignments, setWaitOnAssignments] = useState<WaitOnAssignment[]>([]);
  const [alumniEventInvitations, setAlumniEventInvitations] = useState<EventPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  const chapterStatus = useMemo(() => getChapterStatus(roles), [roles]);
  const isAlumni = chapterStatus === "alumni";
  const hasAlumniEventAccess = hasAlumniRole(roles);
  const hasManagementAccess = canAccessManagement(roles);
  const hasMemberManagementAccess = canManageMembers(roles);
  const hasBudgetAdminAccess = canManageBudgets(roles);
  const hasEventManagementAccess = canManageEvents(roles);
  const hasAnnouncementShortcutAccess = canCreateAnnouncements(roles);
  const canOpenAllChairTools = canAccessAllChairTools(roles);
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
      const now = toCurrentEventTimestamp();
      const recentAnnouncementCutoff = getRecentAnnouncementCutoff();

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
          .gte("created_at", recentAnnouncementCutoff)
          .order("created_at", { ascending: false }),
        supabase
          .from("events")
          .select("id, title, description, event_type, start, end, created_by, visible_to_alum, visible_to_neophyte")
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
      let nextActiveBudgetCycle: BudgetCycle | null = null;
      if (hasBudgetAdminAccess) {
        try {
          const [budgetRequests, activeCycle] = await Promise.all([
            getBudgetTransactionsByStatus(["submitted"]),
            getActiveBudgetCycle(),
          ]);
          nextPendingBudgetRequests = budgetRequests;
          nextActiveBudgetCycle = activeCycle;
        } catch (error) {
          nextErrors.push(`Could not load budget management tasks: ${getErrorMessage(error)}`);
        }
      }

      let nextWaitOnAssignments: WaitOnAssignment[] = [];
      try {
        nextWaitOnAssignments = await getPublishedWaitOnsForUserWeek(userId, getCurrentWeekStartValue());
      } catch (error) {
        nextErrors.push(`Could not load wait-on notifications: ${getErrorMessage(error)}`);
      }

      let nextAlumniEventInvitations: EventPreview[] = [];
      if (hasAlumniEventAccess) {
        const { data, error } = await supabase
          .from("events")
          .select("id, title, description, event_type, start, end, created_by, visible_to_alum, visible_to_neophyte")
          .eq("event_type", "alumni_event")
          .gte("end", now)
          .order("start", { ascending: true })
          .limit(5);

        if (error) {
          nextErrors.push(`Could not load alumni event invitations: ${error.message}`);
        } else {
          nextAlumniEventInvitations = (data ?? []) as EventPreview[];
        }
      }

      if (ignore) {
        return;
      }

      const nextRoleLookup = buildRoleLabelLookup((roleResult.data ?? []) as RoleRow[]);

      setProfile((profileResult.data ?? null) as DashboardProfile | null);
      setRoleLookup(nextRoleLookup);
      setAnnouncements((announcementResult.data ?? []) as AnnouncementPreview[]);
      setEvents((eventResult.data ?? []) as EventPreview[]);
      setPendingMemberCount(nextPendingMemberCount);
      setPendingBudgetRequests(nextPendingBudgetRequests);
      setActiveBudgetCycle(nextActiveBudgetCycle);
      setWaitOnAssignments(nextWaitOnAssignments);
      setAlumniEventInvitations(nextAlumniEventInvitations);
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
    hasBudgetAdminAccess,
    hasAlumniEventAccess,
    hasMemberManagementAccess,
    rolesLoading,
    userId,
  ]);

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => canViewEvent(roles, event))
      .slice(0, 4);
  }, [events, roles]);

  const visibleAnnouncements = useMemo(() => {
    const cutoffTimestamp = new Date(getRecentAnnouncementCutoff()).getTime();
    return announcements
      .filter((announcement) => canShowAnnouncementForChapter(announcement, chapterStatus))
      .filter((announcement) => isRecentAnnouncement(announcement, cutoffTimestamp));
  }, [announcements, chapterStatus]);

  const positionRoleSlugs = useMemo(
    () => roles.filter((roleSlug) => !isChapterStatusRoleSlug(roleSlug)),
    [roles]
  );

  const roleSummary = positionRoleSlugs.length > 0
    ? positionRoleSlugs.slice(0, 2).map((roleSlug) => getRoleLabel(roleSlug, roleLookup)).join(", ")
    : formatChapterStatus(chapterStatus);
  const displayName = getDisplayName(profile, session?.user?.email);
  const pendingBudgetTotal = pendingBudgetRequests.reduce((total, request) => total + request.amount, 0);
  const hasChairTools = canOpenAllChairTools || chairRoleSlugs.length > 0;
  const currentWaitOnWeek = getCurrentWeekStartValue();

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
                    {getRoleLabel(roleSlug, roleLookup)}
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
            detail={isAlumni ? "general posts, last 14 days" : "last 14 days"}
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

      {waitOnAssignments.length > 0 && (
        <Card className="dashboard-wait-on-alert" padding="md">
          <div className="dashboard-wait-on-alert-body">
            <div>
              <Badge variant="warning">Wait-on</Badge>
              <h2>You have a wait-on scheduled this week.</h2>
              <p>Check the published wait-on form.</p>
              <div className="wait-on-alert-slots">
                {waitOnAssignments.map((assignment) => (
                  <Badge key={assignment.id} variant="neutral">
                    {formatWaitOnSlotLabel(assignment.slot_key)}
                  </Badge>
                ))}
              </div>
            </div>
            <Button to={`/app/wait-ons?week=${currentWaitOnWeek}`} variant="outline-secondary">
              Open form
            </Button>
          </div>
        </Card>
      )}

      {alumniEventInvitations.length > 0 && (
        <Card className="dashboard-alumni-alert" padding="md">
          <div className="dashboard-alumni-alert-body">
            <div>
              <Badge variant="info">Alumni event</Badge>
              <h2>You have been invited to an alumni event.</h2>
              <div className="dashboard-alumni-event-list">
                {alumniEventInvitations.map((event) => (
                  <span key={event.id}>
                    {event.title} - {formatEventDateTime(event.start, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                ))}
              </div>
            </div>
            <Button to="/app/scheduling" variant="outline-secondary">
              Open calendar
            </Button>
          </div>
        </Card>
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
                    <span>{formatEventDateTime(event.start, { month: "short", day: "numeric" })}</span>
                    <strong>{formatEventDateTime(event.start, { weekday: "short" })}</strong>
                  </div>
                  <div className="event-preview-body">
                    <div className="event-preview-heading">
                      <h3>{event.title}</h3>
                      <Badge variant="neutral" className={`event-type-badge ${getEventTypeClassName(event.event_type)}`}>
                        {getEventTypeLabel(event.event_type)}
                      </Badge>
                    </div>
                    <p>{event.description || "No description provided."}</p>
                    <span>
                      {formatEventDateTime(event.start, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      to{" "}
                      {formatEventDateTime(event.end, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card className="dashboard-panel" padding="lg">
          <SectionHeader
            title="Recent announcements"
            description={isAlumni ? "General and alumni-visible posts from the last 14 days." : "Chapter posts from the last 14 days."}
            actions={<Button to="/app/announcements" variant="outline-secondary" size="sm">View all</Button>}
          />

          {loading || rolesLoading ? (
            <SkeletonStack />
          ) : visibleAnnouncements.length === 0 ? (
            <EmptyState
              compact
              title="No recent announcements"
              description={isAlumni ? "There are no alumni-visible announcements from the last 14 days." : "There are no chapter posts from the last 14 days."}
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
                    <span>{formatShortDate(announcement.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
        <section>
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
          {!isAlumni && hasChairTools && (
            <ActionCard
              to="/app/tools"
              eyebrow="Tools"
              title="Open chair tools"
              description={
                canOpenAllChairTools
                  ? "All chair workspaces available."
                  : `${chairRoleSlugs.length} chair workspace${chairRoleSlugs.length === 1 ? "" : "s"} available.`
              }
              meta="Tools"
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

              {(hasAnnouncementShortcutAccess || hasEventManagementAccess) && (
                <div className="dashboard-compact-actions">
                  {hasAnnouncementShortcutAccess && (
                    <Button to="/app/announcements/create" variant="outline-secondary" size="sm">Create announcement</Button>
                  )}
                  {hasEventManagementAccess && (
                    <Button to="/app/events/manage" variant="outline-secondary" size="sm">Manage events</Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {hasBudgetAdminAccess && (
            <Card className="dashboard-role-card" padding="lg">
              <SectionHeader
                title="Budget management"
                description={`Active cycle: ${getCycleLabel(activeBudgetCycle)}`}
                actions={<Button to="/app/tools/treasurer" variant="outline-secondary" size="sm">Open</Button>}
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
                  <Button to="/app/tools/treasurer/requests" variant="outline-secondary" size="sm">Review requests</Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
