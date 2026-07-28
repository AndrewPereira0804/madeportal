import { useCallback, useEffect, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authContext";
import ProfileDetails from "./ProfileDetails";
import ProfileEditForm from "./ProfileEditForm";
import EmergencyContactsSection from "./EmergencyContactsSection";
import type { MajorRow, ProfileRow, RawMajorRow, RawProfileRow, RawUserRoleRow, RoleDetail } from "./profileTypes";
import { normalizeMajor, normalizeProfile, normalizeRoles, PROFILE_COLUMNS } from "./profileTypes";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";

export default function Account() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [majors, setMajors] = useState<MajorRow[]>([]);
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    const [profileResult, majorsResult, rolesResult] = await Promise.all([
      supabase.from("profiles").select(PROFILE_COLUMNS).eq("user_id", userId).single(),
      supabase.from("majors").select("id,major,slug").order("major", { ascending: true }),
      supabase
        .from("user_roles")
        .select("role_slug,roles!inner(slug,name)")
        .eq("user_id", userId),
    ]);

    if (profileResult.error) {
      console.error(profileResult.error);
      setProfile(null);
      setErrorMessage("Failed to load your profile.");
      setLoading(false);
      return;
    }

    const normalizedProfile = normalizeProfile(profileResult.data as RawProfileRow);
    if (!normalizedProfile) {
      setProfile(null);
      setErrorMessage("Your profile data could not be read.");
      setLoading(false);
      return;
    }

    setProfile(normalizedProfile);

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

    if (rolesResult.error) {
      console.error(rolesResult.error);
      setRoles([]);
      notices.push("Roles could not be loaded.");
    } else {
      setRoles(normalizeRoles((rolesResult.data ?? []) as RawUserRoleRow[]));
    }

    setNoticeMessage(notices.length > 0 ? notices.join(" ") : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAccount();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAccount]);

  if (loading) {
    return (
      <Card>
        <div className="d-flex align-items-center gap-2">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading account...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="account-page">
      <PageHeader
        title="Account"
        subtitle="Review your profile details and keep your basic information current."
        bordered
        actions={
          <Button type="button" variant="outline-secondary" onClick={loadAccount}>
            Refresh
          </Button>
        }
      />

      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
      {noticeMessage && <div className="alert alert-warning mt-3 mb-0">{noticeMessage}</div>}

      {!profile ? (
        <EmptyState
          title="No profile available"
          description="Portal could not find a profile row for this account."
        />
      ) : (
        <>
          <div className="account-surface mt-4">
            <ProfileDetails profile={profile} majors={majors} roles={roles} />
            <ProfileEditForm
              profile={profile}
              majors={majors}
              currentUserId={userId}
              idPrefix="account"
              onSaved={setProfile}
            />
          </div>
          <EmergencyContactsSection
            targetUserId={profile.user_id}
            currentUserId={userId}
            idPrefix="account"
            className="mt-4"
          />
        </>
      )}
    </Card>
  );
}
