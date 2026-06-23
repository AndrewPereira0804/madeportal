import { useEffect, useMemo, useState } from "react";
import supabase from "../../config/supabaseClient";
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

type AnnouncementPreview = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  visibility: string;
};

type EventPreview = {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  visible_to_alum: boolean;
  visible_to_neophyte: boolean;
};

function formatDateTime(value: string) {
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

export default function Dashboard() {
  const { roles } = useRoles();
  const [announcements, setAnnouncements] = useState<AnnouncementPreview[]>([]);
  const [events, setEvents] = useState<EventPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setLoading(true);
      setErrorMessage(null);

      const now = new Date().toISOString();
      const [announcementResult, eventResult] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, title, body, created_at, visibility")
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("events")
          .select("id, title, description, start, end, visible_to_alum, visible_to_neophyte")
          .gte("end", now)
          .order("start", { ascending: true })
          .limit(8),
      ]);

      if (ignore) {
        return;
      }

      if (announcementResult.error || eventResult.error) {
        setErrorMessage(
          announcementResult.error?.message ??
            eventResult.error?.message ??
            "Dashboard data could not be loaded."
        );
        setAnnouncements([]);
        setEvents([]);
        setLoading(false);
        return;
      }

      setAnnouncements((announcementResult.data ?? []) as AnnouncementPreview[]);
      setEvents((eventResult.data ?? []) as EventPreview[]);
      setLoading(false);
    }

    void loadDashboard();

    return () => {
      ignore = true;
    };
  }, []);

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => {
        if (roles.includes("brother")) return true;
        if (event.visible_to_alum && roles.includes("alum")) return true;
        if (event.visible_to_neophyte && roles.includes("neophyte")) return true;
        return false;
      })
      .slice(0, 4);
  }, [events, roles]);

  const roleSummary = roles.length > 0 ? roles.slice(0, 3).join(", ") : "member";

  return (
    <div className="dashboard-page">
      <Card className="dashboard-hero" padding="lg">
        <PageHeader
          eyebrow="Dashboard"
          title="Portal"
          subtitle="Announcements, events, budgets, and member tools."
          actions={<Button to="/app/announcements/create">Post update</Button>}
        />

        <div className="dashboard-metrics" aria-label="Portal overview">
          <MetricCard label="Upcoming events" value={visibleEvents.length} detail="visible to your roles" tone="gold" />
          <MetricCard label="Latest posts" value={announcements.length} detail="recent announcements" tone="info" />
          <MetricCard label="Access lane" value={roleSummary} detail="current role set" tone="default" />
        </div>
      </Card>

      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}

      <div className="dashboard-grid">
        <Card className="dashboard-panel" padding="lg">
          <SectionHeader
            title="Next on the calendar"
          description="Upcoming visible events."
            actions={<Button to="/app/scheduling" variant="outline-secondary" size="sm">Open calendar</Button>}
          />

          {loading ? (
            <div className="loading-stack">
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
              <span className="skeleton-line" />
            </div>
          ) : visibleEvents.length === 0 ? (
            <EmptyState
              compact
              title="No visible events"
            description="There are no upcoming events."
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
            description="Latest posts."
            actions={<Button to="/app/announcements" variant="outline-secondary" size="sm">View all</Button>}
          />

          {loading ? (
            <div className="loading-stack">
              <span className="skeleton-line" />
              <span className="skeleton-line skeleton-line--short" />
              <span className="skeleton-line" />
            </div>
          ) : announcements.length === 0 ? (
            <EmptyState compact title="No announcements yet" description="New chapter updates will appear here." />
          ) : (
            <div className="announcement-preview-list">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="announcement-preview-card">
                  <div>
                    <h3>{announcement.title}</h3>
                    <p>{announcement.body}</p>
                  </div>
                  <div className="announcement-preview-meta">
                    <Badge variant="info">{announcement.visibility}</Badge>
                    <span>{formatShortDate(announcement.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="action-card-grid" aria-label="Quick actions">
        <ActionCard
          to="/budget"
          eyebrow="Finance"
          title="Review budget position"
          description="View balances and expenses."
          meta="Budget"
        />
        <ActionCard
          to="/app/events/manage"
          eyebrow="Scheduling"
          title="Manage calendar operations"
          description="Create or update events."
          meta="Events"
        />
        <ActionCard
          to="/app/directory"
          eyebrow="Members"
          title="Open member directory"
          description="Search active members."
          meta="Directory"
        />
      </div>
    </div>
  );
}
