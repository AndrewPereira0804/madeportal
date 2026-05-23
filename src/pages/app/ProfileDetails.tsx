import { useMemo } from "react";
import type { MajorRow, ProfileRow, RoleDetail } from "./profileTypes";
import { formatCreatedAt, NO_INFO } from "./profileTypes";

type ProfileDetailsProps = {
  profile: ProfileRow;
  majors: MajorRow[];
  roles: RoleDetail[];
};

function displayValue(value: string | number | null) {
  if (value === null) {
    return <span className="account-empty-value">{NO_INFO}</span>;
  }

  return String(value);
}

function statusPillClass(status: ProfileRow["status"]) {
  return `status-pill status-${status}`;
}

export default function ProfileDetails({ profile, majors, roles }: ProfileDetailsProps) {
  const majorById = useMemo(() => {
    const lookup = new Map<number, MajorRow>();
    for (const major of majors) {
      lookup.set(major.id, major);
    }
    return lookup;
  }, [majors]);

  const selectedMajorLabel =
    profile.major === null ? null : majorById.get(profile.major)?.major ?? `Major ID ${profile.major}`;
  const roleLabels = roles.map((role) => role.name ?? role.slug);

  return (
    <section className="account-section">
      <h2 className="h5 mb-3">Profile data</h2>
      <dl className="account-detail-grid">
        <div>
          <dt>User ID</dt>
          <dd>{profile.user_id}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{displayValue(profile.email)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={statusPillClass(profile.status)}>{profile.status}</span>
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{displayValue(formatCreatedAt(profile.created_at))}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{displayValue(profile.name)}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{displayValue(profile.phone)}</dd>
        </div>
        <div>
          <dt>Graduation year</dt>
          <dd>{displayValue(profile.grad_year)}</dd>
        </div>
        <div>
          <dt>Major</dt>
          <dd>{displayValue(selectedMajorLabel)}</dd>
        </div>
        <div>
          <dt>Hometown</dt>
          <dd>{displayValue(profile.hometown)}</dd>
        </div>
        <div>
          <dt>Roles</dt>
          <dd>
            {roleLabels.length > 0 ? roleLabels.join(", ") : <span className="account-empty-value">No roles assigned</span>}
          </dd>
        </div>
      </dl>
    </section>
  );
}
