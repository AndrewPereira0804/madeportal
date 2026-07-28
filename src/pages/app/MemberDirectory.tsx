import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canManageAllEmergencyContacts,
  canReadAllEmergencyContacts,
  getChapterStatus,
  type ChapterStatus,
} from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authContext";
import EmergencyContactsSection from "./EmergencyContactsSection";
import ProfileDetails from "./ProfileDetails";
import ProfileEditForm from "./ProfileEditForm";
import type { MajorRow, ProfileRow, RawMajorRow, RawProfileRow, RawUserRoleRow, RoleDetail } from "./profileTypes";
import {
  normalizeMajor,
  normalizeProfile,
  normalizeRoleDetail,
  PROFILE_COLUMNS,
  profileSortValue,
  toCleanString,
} from "./profileTypes";
import { Button, Card, PageHeader } from "../../components/ui";

type DirectoryRoleRow = RawUserRoleRow & {
  user_id?: unknown;
};

type ChapterFilter = "all" | ChapterStatus;
type MajorFilter = "all" | "none" | string;

const chapterFilterOptions: { value: ChapterFilter; label: string }[] = [
  { value: "all", label: "All member types" },
  { value: "brother", label: "Brother" },
  { value: "neophyte", label: "Neophyte" },
  { value: "alumni", label: "Alumni" },
];

function normalizeDirectoryRoles(rows: DirectoryRoleRow[]) {
  const rolesByUser: Record<string, RoleDetail[]> = {};

  for (const row of rows) {
    const userId = toCleanString(row.user_id);
    const role = normalizeRoleDetail(row);

    if (!userId || !role) {
      continue;
    }

    rolesByUser[userId] = [...(rolesByUser[userId] ?? []), role];
  }

  for (const [userId, roles] of Object.entries(rolesByUser)) {
    rolesByUser[userId] = roles.sort((a, b) => (a.name ?? a.slug).localeCompare(b.name ?? b.slug));
  }

  return rolesByUser;
}

function formatMemberName(profile: ProfileRow) {
  return profile.name ?? profile.email ?? "No info provided";
}

export default function MemberDirectory() {
  const { session } = useAuth();
  const { roles: currentUserRoles } = useRoles();
  const userId = session?.user.id ?? null;

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [majors, setMajors] = useState<MajorRow[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, RoleDetail[]>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [majorFilter, setMajorFilter] = useState<MajorFilter>("all");
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const majorById = useMemo(() => {
    const lookup = new Map<number, MajorRow>();
    for (const major of majors) {
      lookup.set(major.id, major);
    }
    return lookup;
  }, [majors]);

  const hasProfilesWithoutMajor = useMemo(() => profiles.some((profile) => profile.major === null), [profiles]);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    const [profilesResult, majorsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("status", "active")
        .order("name", { ascending: true }),
      supabase.from("majors").select("id,major,slug").order("major", { ascending: true }),
    ]);

    if (profilesResult.error) {
      console.error(profilesResult.error);
      setProfiles([]);
      setRolesByUser({});
      setSelectedUserId(null);
      setErrorMessage("Failed to load the member directory.");
      setLoading(false);
      return;
    }

    const activeProfiles = ((profilesResult.data ?? []) as RawProfileRow[])
      .map(normalizeProfile)
      .filter((profile): profile is ProfileRow => profile !== null && profile.status === "active")
      .sort((a, b) => profileSortValue(a).localeCompare(profileSortValue(b)));

    setProfiles(activeProfiles);
    setSelectedUserId((current) => {
      if (current && activeProfiles.some((profile) => profile.user_id === current)) {
        return current;
      }

      return activeProfiles.find((profile) => profile.user_id === userId)?.user_id ?? activeProfiles[0]?.user_id ?? null;
    });

    const notices: string[] = [];

    if (majorsResult.error) {
      console.error(majorsResult.error);
      setMajors([]);
      notices.push("Majors could not be loaded.");
    } else {
      setMajors(
        ((majorsResult.data ?? []) as RawMajorRow[])
          .map(normalizeMajor)
          .filter((row): row is MajorRow => row !== null)
      );
    }

    if (activeProfiles.length === 0) {
      setRolesByUser({});
      setNoticeMessage(notices.length > 0 ? notices.join(" ") : null);
      setLoading(false);
      return;
    }

    const { data: rolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id,role_slug,roles!inner(slug,name)")
      .in(
        "user_id",
        activeProfiles.map((profile) => profile.user_id)
      );

    if (rolesError) {
      console.error(rolesError);
      setRolesByUser({});
      notices.push("Roles could not be loaded.");
    } else {
      setRolesByUser(normalizeDirectoryRoles((rolesData ?? []) as DirectoryRoleRow[]));
    }

    setNoticeMessage(notices.length > 0 ? notices.join(" ") : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDirectory();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDirectory]);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return profiles.filter((profile) => {
      const majorName = profile.major === null ? "" : majorById.get(profile.major)?.major ?? "";
      const memberRoles = rolesByUser[profile.user_id] ?? [];
      const roleSlugs = memberRoles.map((role) => role.slug);
      const chapterStatus = getChapterStatus(roleSlugs);

      if (majorFilter !== "all") {
        const profileMajorValue = profile.major === null ? "none" : String(profile.major);
        if (profileMajorValue !== majorFilter) {
          return false;
        }
      }

      if (chapterFilter !== "all" && chapterStatus !== chapterFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const roleNames = memberRoles.map((role) => role.name ?? role.slug);
      const haystack = [
        profile.name ?? "",
        profile.email ?? "",
        profile.phone ?? "",
        profile.hometown ?? "",
        profile.grad_year === null ? "" : String(profile.grad_year),
        majorName,
        ...roleNames,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [chapterFilter, majorById, majorFilter, profiles, rolesByUser, search]);

  const effectiveSelectedUserId = useMemo(() => {
    if (selectedUserId && filteredProfiles.some((profile) => profile.user_id === selectedUserId)) {
      return selectedUserId;
    }

    return filteredProfiles.find((profile) => profile.user_id === userId)?.user_id ?? filteredProfiles[0]?.user_id ?? null;
  }, [filteredProfiles, selectedUserId, userId]);

  const selectedProfile = effectiveSelectedUserId
    ? filteredProfiles.find((profile) => profile.user_id === effectiveSelectedUserId) ?? null
    : null;
  const selectedRoles = selectedProfile ? rolesByUser[selectedProfile.user_id] ?? [] : [];
  const isSelectedOwnProfile = selectedProfile?.user_id === userId;
  const canReadAnyEmergencyContacts = canReadAllEmergencyContacts(currentUserRoles);
  const canManageAnyEmergencyContacts = canManageAllEmergencyContacts(currentUserRoles);
  const hasActiveFilters = search.trim() !== "" || majorFilter !== "all" || chapterFilter !== "all";
  const activeCountLabel =
    filteredProfiles.length === profiles.length
      ? `${filteredProfiles.length} active`
      : `${filteredProfiles.length} of ${profiles.length} active`;

  function handleProfileSaved(updatedProfile: ProfileRow) {
    setProfiles((current) =>
      current
        .map((profile) => (profile.user_id === updatedProfile.user_id ? updatedProfile : profile))
        .filter((profile) => profile.status === "active")
        .sort((a, b) => profileSortValue(a).localeCompare(profileSortValue(b)))
    );
  }

  function handleClearFilters() {
    setSearch("");
    setMajorFilter("all");
    setChapterFilter("all");
  }

  return (
    <Card className="directory-page">
      <PageHeader
        title="Member Directory"
        subtitle="Active member profiles."
        bordered
        actions={
          <Button type="button" variant="outline-secondary" onClick={loadDirectory}>
            Refresh
          </Button>
        }
      />

      <div className="directory-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="form-control directory-search"
          placeholder="Search"
        />
        <select
          id="directory-major-filter"
          className="form-select directory-filter"
          value={majorFilter}
          onChange={(event) => setMajorFilter(event.target.value)}
          aria-label="Filter by major"
        >
          <option value="all">All majors</option>
          {hasProfilesWithoutMajor && <option value="none">No major listed</option>}
          {majors.map((major) => (
            <option key={major.id} value={major.id}>
              {major.major}
            </option>
          ))}
        </select>
        <select
          id="directory-chapter-filter"
          className="form-select directory-filter directory-filter-status"
          value={chapterFilter}
          onChange={(event) => setChapterFilter(event.target.value as ChapterFilter)}
          aria-label="Filter by member type"
        >
          {chapterFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear
          </Button>
        )}
        <span className="directory-count">{activeCountLabel}</span>
      </div>

      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
      {noticeMessage && <div className="alert alert-warning mt-3 mb-0">{noticeMessage}</div>}

      {loading ? (
        <div className="accounts-loading">Loading directory...</div>
      ) : (
        <div className="directory-layout mt-4">
          <div className="directory-list" aria-label="Active members">
            {filteredProfiles.map((profile) => {
              const isSelected = profile.user_id === effectiveSelectedUserId;
              const memberRoles = rolesByUser[profile.user_id] ?? [];

              return (
                <button
                  key={profile.user_id}
                  type="button"
                  className={`directory-member${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelectedUserId(profile.user_id)}
                  aria-pressed={isSelected}
                >
                  <span className="directory-member-name">{formatMemberName(profile)}</span>
                  <span className="directory-member-meta">
                    {memberRoles.length > 0 ? memberRoles.map((role) => role.name ?? role.slug).join(", ") : "No roles assigned"}
                  </span>
                </button>
              );
            })}

            {filteredProfiles.length === 0 && <p className="directory-empty">No active members found.</p>}
          </div>

          <div className="directory-detail">
            {!selectedProfile ? (
              <p className="mb-0 text-body-secondary">No member selected.</p>
            ) : (
              <>
                <div className={isSelectedOwnProfile ? "account-surface directory-profile-surface" : "directory-profile-single"}>
                  <ProfileDetails profile={selectedProfile} majors={majors} roles={selectedRoles} />
                  {isSelectedOwnProfile && (
                    <ProfileEditForm
                      profile={selectedProfile}
                      majors={majors}
                      currentUserId={userId}
                      idPrefix="directory"
                      onSaved={handleProfileSaved}
                    />
                  )}
                </div>
                <EmergencyContactsSection
                  targetUserId={selectedProfile.user_id}
                  currentUserId={userId}
                  idPrefix={`directory-${selectedProfile.user_id}`}
                  canReadAll={canReadAnyEmergencyContacts}
                  canManageAll={canManageAnyEmergencyContacts}
                  className="directory-emergency-contacts"
                />
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
