import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import supabase from "../../config/supabaseClient";
import { Button, Input, Select } from "../../components/ui";
import type { MajorRow, ProfileDraft, ProfileRow, RawProfileRow } from "./profileTypes";
import { buildProfileUpdatePayload, normalizeProfile, PROFILE_COLUMNS, profileToDraft } from "./profileTypes";

type ProfileEditFormProps = {
  profile: ProfileRow;
  majors: MajorRow[];
  currentUserId: string | null;
  idPrefix: string;
  onSaved: (profile: ProfileRow) => void;
};

export default function ProfileEditForm({ profile, majors, currentUserId, idPrefix, onSaved }: ProfileEditFormProps) {
  const [draft, setDraft] = useState<ProfileDraft>(() => profileToDraft(profile));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canEdit = currentUserId === profile.user_id;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraft(profileToDraft(profile));
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [profile]);

  if (!canEdit) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUserId || currentUserId !== profile.user_id) {
      setErrorMessage("This profile cannot be edited from your account.");
      return;
    }

    const { payload, errorMessage: validationError } = buildProfileUpdatePayload(draft, profile.major, majors);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("user_id", currentUserId)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      console.error(error);
      setErrorMessage("Failed to save this profile.");
      setSaving(false);
      return;
    }

    const updatedProfile = normalizeProfile(data as RawProfileRow);
    if (!updatedProfile) {
      setErrorMessage("This profile was saved, but the updated data could not be read.");
      setSaving(false);
      return;
    }

    setDraft(profileToDraft(updatedProfile));
    setSuccessMessage("Profile saved.");
    setSaving(false);
    onSaved(updatedProfile);
  }

  function resetDraft() {
    setDraft(profileToDraft(profile));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  return (
    <form className="account-section account-form" onSubmit={handleSubmit}>
      <h2 className="h5 mb-3">Basic info</h2>

      {errorMessage && <div className="alert alert-danger mb-3">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success mb-3">{successMessage}</div>}

      <div className="d-grid gap-3">
        <Input
          id={`${idPrefix}Name`}
          label="Name"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          disabled={saving}
        />

        <Input
          id={`${idPrefix}Phone`}
          label="Phone"
          type="tel"
          value={draft.phone}
          onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
          disabled={saving}
        />

        <Input
          id={`${idPrefix}GradYear`}
          label="Graduation year"
          type="number"
          min="1900"
          max="2200"
          inputMode="numeric"
          value={draft.gradYear}
          onChange={(event) => setDraft((current) => ({ ...current, gradYear: event.target.value }))}
          disabled={saving}
        />

        <Select
          id={`${idPrefix}Major`}
          label="Major"
          value={draft.majorId}
          onChange={(event) => setDraft((current) => ({ ...current, majorId: event.target.value }))}
          disabled={saving}
        >
            <option value="">No info provided</option>
            {majors.map((major) => (
              <option key={major.id} value={major.id}>
                {major.major}
              </option>
            ))}
        </Select>

        <Input
          id={`${idPrefix}Hometown`}
          label="Hometown"
          value={draft.hometown}
          onChange={(event) => setDraft((current) => ({ ...current, hometown: event.target.value }))}
          disabled={saving}
        />
      </div>

      <div className="d-flex gap-2 flex-wrap mt-4">
        <Button type="submit" disabled={saving} loading={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" variant="outline-secondary" onClick={resetDraft} disabled={saving}>
          Reset
        </Button>
      </div>
    </form>
  );
}
