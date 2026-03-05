import { useEffect, useMemo, useState } from "react";
import supabase from "../../config/supabaseClient";
import useRoles from "../../auth/useRoles";
import { Navigate } from "react-router-dom";

type AccountStatus = "pending" | "active" | "suspended";

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  status: AccountStatus;
  created_at: string | null;
};

type RoleRow = {
  slug: string;
  name: string;
};

type UserRoleRow = {
  user_id: string;
  role_slug: string;
};

type UserVM = ProfileRow & {
  roleSlugs: string[];
};

type RawProfileRow = {
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
  status?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

const TABS: { key: AccountStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
];

function isAccountStatus(value: string | null | undefined): value is AccountStatus {
  return value === "pending" || value === "active" || value === "suspended";
}

function toCleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeProfiles(rows: RawProfileRow[]): ProfileRow[] {
  return rows
    .map((row) => {
      if (!row.user_id || !isAccountStatus(row.status)) {
        return null;
      }

      const email = toCleanString(row.email);
      const name = toCleanString(row.name);

      return {
        user_id: row.user_id,
        name,
        email,
        status: row.status,
        created_at: toCleanString(row.created_at),
      };
    })
    .filter((row): row is ProfileRow => row !== null)
    .sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return bTime - aTime;
    });
}

function formatCreatedAt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown creation date";
}

function statusPillClass(status: AccountStatus) {
  return `status-pill status-${status}`;
}

export default function Accounts() {
  const { roles, loading: rolesLoading } = useRoles();

  const [tab, setTab] = useState<AccountStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rolesLookup, setRolesLookup] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftRoleSlugs, setDraftRoleSlugs] = useState<string[]>([]);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);

    const { data: rolesData, error: rolesErr } = await supabase
      .from("roles")
      .select("slug,name")
      .order("name", { ascending: true });

    if (rolesErr) {
      console.error(rolesErr);
      setErrorMsg("Failed to load roles.");
      setLoading(false);
      return;
    }

    const roleRows = (rolesData ?? []) as RoleRow[];
    const lookup: Record<string, string> = {};
    for (const role of roleRows) {
      lookup[role.slug] = role.name;
    }
    setRolesLookup(lookup);

    const { data: profilesData, error: profilesErr } = await supabase
      .from("profiles")
      .select("user_id,name,email,status,created_at")
      .order("created_at", { ascending: false });

    if (profilesErr) {
      console.error(profilesErr);
      setErrorMsg("Failed to load profiles.");
      setLoading(false);
      return;
    }

    const profs = normalizeProfiles((profilesData ?? []) as RawProfileRow[]);
    setProfiles(profs);

    const userIds = profs.map((p) => p.user_id);
    if (userIds.length === 0) {
      setUserRoles([]);
      setLoading(false);
      return;
    }

    const { data: userRolesData, error: urErr } = await supabase
      .from("user_roles")
      .select("user_id,role_slug")
      .in("user_id", userIds);

    if (urErr) {
      console.error(urErr);
      setErrorMsg("Failed to load user roles.");
      setLoading(false);
      return;
    }

    setUserRoles((userRolesData ?? []) as UserRoleRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const users: UserVM[] = useMemo(() => {
    const rolesByUser = new Map<string, string[]>();
    for (const ur of userRoles) {
      const list = rolesByUser.get(ur.user_id) ?? [];
      list.push(ur.role_slug);
      rolesByUser.set(ur.user_id, list);
    }

    return profiles.map((p) => ({
      ...p,
      roleSlugs: rolesByUser.get(p.user_id) ?? [],
    }));
  }, [profiles, userRoles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => u.status === tab)
      .filter((u) => {
        if (!q) {
          return true;
        }

        const hay = [u.name ?? "", u.email ?? "", u.user_id, ...u.roleSlugs].join(" ").toLowerCase();
        return hay.includes(q);
      });
  }, [users, tab, search]);

  function roleLabel(slug: string) {
    return rolesLookup[slug] ?? slug;
  }

  async function updateStatus(userId: string, status: AccountStatus) {
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("user_id", userId);

    if (error) {
      console.error(error);
      setErrorMsg("Failed to update status.");
      setSaving(false);
      return;
    }

    await loadData();
    setSaving(false);
  }

  async function saveRoles(userId: string, nextSlugs: string[]) {
    setSaving(true);
    setErrorMsg(null);

    const current = users.find((u) => u.user_id === userId)?.roleSlugs ?? [];
    const currentSet = new Set(current);
    const nextSet = new Set(nextSlugs);

    const toAdd = [...nextSet].filter((r) => !currentSet.has(r));
    const toRemove = [...currentSet].filter((r) => !nextSet.has(r));

    if (toRemove.length > 0) {
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .in("role_slug", toRemove);

      if (delErr) {
        console.error(delErr);
        setErrorMsg("Failed to remove some roles.");
        setSaving(false);
        return;
      }
    }

    if (toAdd.length > 0) {
      const rows = toAdd.map((role_slug) => ({ user_id: userId, role_slug }));
      const { error: insErr } = await supabase.from("user_roles").insert(rows);

      if (insErr) {
        console.error(insErr);
        setErrorMsg("Failed to add some roles.");
        setSaving(false);
        return;
      }
    }

    setEditingUserId(null);
    setDraftRoleSlugs([]);
    await loadData();
    setSaving(false);
  }

  function startEditing(u: UserVM) {
    setEditingUserId(u.user_id);
    setDraftRoleSlugs([...u.roleSlugs].sort());
  }

  function toggleDraftRole(slug: string) {
    setDraftRoleSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  const allRoleSlugs = useMemo(
    () => Object.keys(rolesLookup).sort((a, b) => roleLabel(a).localeCompare(roleLabel(b))),
    [rolesLookup]
  );

  if (rolesLoading) {
    return <div className="accounts-loading">Loading...</div>;
  }

  if (!roles.includes("admin")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-card accounts-page">
      <h2 className="accounts-title">Admin Account Management</h2>
      <p className="accounts-subtitle">
        Approve or deny pending accounts, and manage roles for active members.
      </p>

      <div className="accounts-toolbar">
        <div className="accounts-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              disabled={tab === t.key}
              className={`accounts-tab${tab === t.key ? " is-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="accounts-toolbar-spacer" />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name/email/id/role..."
          className="accounts-search"
        />
        <button
          type="button"
          onClick={loadData}
          disabled={loading || saving}
          className="btn-secondary"
        >
          Refresh
        </button>
      </div>

      {errorMsg && <div className="accounts-alert">{errorMsg}</div>}

      {loading ? (
        <div className="accounts-loading">Loading...</div>
      ) : (
        <div className="accounts-table-wrap">
          <table className="accounts-table">
            <thead>
              <tr>
                <th className="accounts-th">User</th>
                <th className="accounts-th">Status</th>
                <th className="accounts-th">Roles</th>
                <th className="accounts-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isEditing = editingUserId === u.user_id;

                return (
                  <tr key={u.user_id}>
                    <td className="accounts-td">
                      <div className="accounts-user-name">{u.name ?? "(no name)"}</div>
                      <div className="accounts-user-email">{u.email ?? "(no email)"}</div>
                      <div className="accounts-user-meta">
                        {u.user_id} - {formatCreatedAt(u.created_at)}
                      </div>
                    </td>

                    <td className="accounts-td">
                      <span className={statusPillClass(u.status)}>{u.status}</span>
                    </td>

                    <td className="accounts-td">
                      {!isEditing ? (
                        <div>
                          {u.roleSlugs.length > 0 ? u.roleSlugs.map(roleLabel).join(", ") : "(none)"}
                        </div>
                      ) : (
                        <div className="accounts-role-editor">
                          {allRoleSlugs.map((slug) => (
                            <label key={slug} className="accounts-role-option">
                              <input
                                type="checkbox"
                                checked={draftRoleSlugs.includes(slug)}
                                onChange={() => toggleDraftRole(slug)}
                              />
                              {roleLabel(slug)}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="accounts-td">
                      {tab === "pending" && (
                        <div className="accounts-actions">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => updateStatus(u.user_id, "active")}
                            className="btn-primary"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              if (!window.confirm("Deny this account? (status -> suspended)")) {
                                return;
                              }
                              updateStatus(u.user_id, "suspended");
                            }}
                            className="btn-danger"
                          >
                            Deny
                          </button>
                        </div>
                      )}

                      {tab === "active" && (
                        <div className="accounts-actions">
                          {!isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => startEditing(u)}
                                className="btn-secondary"
                              >
                                Edit roles
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  if (!window.confirm("Suspend this account?")) {
                                    return;
                                  }
                                  updateStatus(u.user_id, "suspended");
                                }}
                                className="btn-danger"
                              >
                                Suspend
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => saveRoles(u.user_id, draftRoleSlugs)}
                                className="btn-primary"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setEditingUserId(null);
                                  setDraftRoleSlugs([]);
                                }}
                                className="btn-secondary"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {tab === "suspended" && (
                        <div className="accounts-actions">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => updateStatus(u.user_id, "active")}
                            className="btn-primary"
                          >
                            Reinstate
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td className="accounts-td accounts-empty" colSpan={4}>
                    No users in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="accounts-tip">
        Tip: when you deny an account, it moves to the Suspended tab.
      </p>
    </div>
  );
}
