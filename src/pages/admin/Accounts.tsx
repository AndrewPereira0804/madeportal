import React, { useEffect, useMemo, useState } from "react";
import  supabase  from "../../config/supabaseClient";
import useRoles from "../../auth/useRoles";
import { Navigate } from "react-router-dom";

// don't call hooks at module scope – we'll grab roles inside the component

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
};

const TABS: { key: AccountStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
];

function isAccountStatus(value: string | null | undefined): value is AccountStatus {
  return value === "pending" || value === "active" || value === "suspended";
}

function normalizeProfiles(rows: RawProfileRow[]): ProfileRow[] {
  return rows
    .map((row) => {
      if (!row.user_id || !isAccountStatus(row.status)) {
        return null;
      }

      return {
        user_id: row.user_id,
        name: row.name ?? null,
        email: row.email ?? null,
        status: row.status,
        created_at: row.created_at ?? null,
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

export default function Accounts() {
  const { roles, loading: rolesLoading } = useRoles();

  // always declare hooks in the same order on every render
  const [tab, setTab] = useState<AccountStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rolesLookup, setRolesLookup] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);

  // role editing UI state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftRoleSlugs, setDraftRoleSlugs] = useState<string[]>([]);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);

    // 1) Fetch roles lookup (slug -> name)
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

    const roles = (rolesData ?? []) as RoleRow[];
    const lookup: Record<string, string> = {};
    for (const r of roles) lookup[r.slug] = r.name;
    setRolesLookup(lookup);

    // 2) Fetch profiles
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

    // 3) Fetch user_roles for these users
    const userIds = profs.map((p) => p.user_id);
    if (userIds.length === 0) {
      setUserRoles([]);
      setLoading(false);
      return;
    }

    // Supabase has limits on long IN lists; for typical fraternity size this is fine.
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
        if (!q) return true;
        const hay = [
          u.name ?? "",
          u.email ?? "",
          u.user_id,
          ...(u.roleSlugs ?? []),
        ]
          .join(" ")
          .toLowerCase();
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

    // Optional: log to audit_log if you want (and your RLS allows it)
    // const { data: me } = await supabase.auth.getUser();
    // await supabase.from("audit_log").insert({
    //   actor_id: me?.user?.id ?? null,
    //   target_user_id: userId,
    //   action: `status:${status}`,
    // });

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

    // Delete removed roles
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

    // Insert added roles
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

  // gating now that all hooks have been declared
  if (rolesLoading) return <div>Loading…</div>;
  if (!roles.includes("admin")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200 }}>
      <h2 style={{ margin: 0 }}>Admin · Account Management</h2>
      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Approve/deny pending accounts, and manage roles for active members.
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            disabled={tab === t.key}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: tab === t.key ? "#f3f3f3" : "white",
              cursor: tab === t.key ? "default" : "pointer",
            }}
          >
            {t.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name/email/id/role…"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
            minWidth: 280,
          }}
        />
        <button
          onClick={loadData}
          disabled={loading || saving}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd" }}
        >
          Refresh
        </button>
      </div>

      {errorMsg && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#fff3f3" }}>
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 16 }}>Loading…</div>
      ) : (
        <div style={{ marginTop: 14, border: "1px solid #e6e6e6", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isEditing = editingUserId === u.user_id;

                return (
                  <tr key={u.user_id} style={{ borderTop: "1px solid #eee" }}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{u.name ?? "(no name)"}</div>
                      <div style={{ opacity: 0.85 }}>{u.email ?? "(no email)"}</div>
                      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                        {u.user_id} · {formatCreatedAt(u.created_at)}
                      </div>
                    </Td>

                    <Td>{u.status}</Td>

                    <Td>
                      {!isEditing ? (
                        <div>
                          {(u.roleSlugs?.length ?? 0) > 0
                            ? u.roleSlugs.map(roleLabel).join(", ")
                            : "(none)"}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {allRoleSlugs.map((slug) => (
                            <label
                              key={slug}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                border: "1px solid #eee",
                                padding: "6px 8px",
                                borderRadius: 10,
                              }}
                            >
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
                    </Td>

                    <Td>
                      {tab === "pending" && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            disabled={saving}
                            onClick={() => updateStatus(u.user_id, "active")}
                            style={primaryBtn}
                          >
                            Approve
                          </button>
                          <button
                            disabled={saving}
                            onClick={() => {
                              if (!window.confirm("Deny this account? (status → suspended)"))
                                return;
                              updateStatus(u.user_id, "suspended");
                            }}
                            style={dangerBtn}
                          >
                            Deny
                          </button>
                        </div>
                      )}

                      {tab === "active" && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {!isEditing ? (
                            <>
                              <button
                                disabled={saving}
                                onClick={() => startEditing(u)}
                                style={secondaryBtn}
                              >
                                Edit roles
                              </button>
                              <button
                                disabled={saving}
                                onClick={() => {
                                  if (!window.confirm("Suspend this account?")) return;
                                  updateStatus(u.user_id, "suspended");
                                }}
                                style={dangerBtn}
                              >
                                Suspend
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                disabled={saving}
                                onClick={() => saveRoles(u.user_id, draftRoleSlugs)}
                                style={primaryBtn}
                              >
                                Save
                              </button>
                              <button
                                disabled={saving}
                                onClick={() => {
                                  setEditingUserId(null);
                                  setDraftRoleSlugs([]);
                                }}
                                style={secondaryBtn}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {tab === "suspended" && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            disabled={saving}
                            onClick={() => updateStatus(u.user_id, "active")}
                            style={primaryBtn}
                          >
                            Reinstate
                          </button>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr style={{ borderTop: "1px solid #eee" }}>
                  <Td colSpan={4} style={{ opacity: 0.75 }}>
                    No users in this view.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
        Tip: If you want “Deny removes from page”, that’s exactly what happens—once status becomes
        <code> suspended</code>, they move to the Suspended tab.
      </div>
    </div>
  );
}

function Th(props: React.PropsWithChildren) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: 12,
        fontSize: 13,
        borderBottom: "1px solid #eee",
      }}
    >
      {props.children}
    </th>
  );
}

function Td(
  props: React.PropsWithChildren<{ colSpan?: number; style?: React.CSSProperties }>
) {
  return (
    <td style={{ padding: 12, verticalAlign: "top", ...props.style }} colSpan={props.colSpan}>
      {props.children}
    </td>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#f3f3f3",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "white",
};

const dangerBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff5f5",
};
