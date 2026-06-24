import { Navigate } from "react-router-dom";
import { canAccessSystemAdmin } from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import { Card, EmptyState, PageHeader } from "../../components/ui";

export default function SystemAdmin() {
  const { roles, loading } = useRoles();

  if (loading) {
    return (
      <Card>
        <div className="accounts-loading">Loading system admin...</div>
      </Card>
    );
  }

  if (!canAccessSystemAdmin(roles)) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Card>
      <PageHeader
        title="System Admin"
        subtitle="Reserved for future system-level administration."
        bordered
      />
      <EmptyState
        title="No system tools yet"
        description="Chapter operations now live under Management."
      />
    </Card>
  );
}
