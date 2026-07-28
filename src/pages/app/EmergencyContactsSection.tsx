import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import supabase from "../../config/supabaseClient";
import { Button, Input, Select, cx } from "../../components/ui";
import {
  buildEmergencyContactPayload,
  createBlankEmergencyContactDraft,
  emergencyContactToDraft,
  emergencyContactTypeOptions,
  EMERGENCY_CONTACT_COLUMNS,
  formatEmergencyContactType,
  isEmergencyContactType,
  normalizeEmergencyContact,
  sortEmergencyContacts,
  type EmergencyContactDraft,
  type EmergencyContactInsertPayload,
  type EmergencyContactRow,
  type RawEmergencyContactRow,
} from "../../lib/emergencyContacts";

type EmergencyContactsSectionProps = {
  targetUserId: string | null;
  currentUserId: string | null;
  idPrefix: string;
  canReadAll?: boolean;
  canManageAll?: boolean;
  title?: string;
  className?: string;
};

type EditingContactId = "new" | string | null;

export default function EmergencyContactsSection({
  targetUserId,
  currentUserId,
  idPrefix,
  canReadAll = false,
  canManageAll = false,
  title = "Emergency contacts",
  className,
}: EmergencyContactsSectionProps) {
  const canManage = Boolean(
    targetUserId && currentUserId && (targetUserId === currentUserId || canManageAll)
  );
  const canRead = Boolean(targetUserId && (canManage || canReadAll || canManageAll));

  const [contacts, setContacts] = useState<EmergencyContactRow[]>([]);
  const [draft, setDraft] = useState<EmergencyContactDraft>(() => createBlankEmergencyContactDraft());
  const [editingContactId, setEditingContactId] = useState<EditingContactId>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const editingContact = useMemo(
    () => contacts.find((contact) => contact.id === editingContactId) ?? null,
    [contacts, editingContactId]
  );

  const loadContacts = useCallback(async () => {
    if (!targetUserId || !canRead) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("emergency_contacts")
      .select(EMERGENCY_CONTACT_COLUMNS)
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setContacts([]);
      setErrorMessage("Failed to load emergency contacts.");
      setLoading(false);
      return;
    }

    const normalizedContacts = ((data ?? []) as RawEmergencyContactRow[])
      .map(normalizeEmergencyContact)
      .filter((contact): contact is EmergencyContactRow => contact !== null);

    setContacts(sortEmergencyContacts(normalizedContacts));
    setLoading(false);
  }, [canRead, targetUserId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraft(createBlankEmergencyContactDraft());
      setEditingContactId(null);
      setSuccessMessage(null);
      void loadContacts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadContacts]);

  if (!canRead) {
    return null;
  }

  function startAddingContact() {
    setDraft(createBlankEmergencyContactDraft());
    setEditingContactId("new");
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function startEditingContact(contact: EmergencyContactRow) {
    setDraft(emergencyContactToDraft(contact));
    setEditingContactId(contact.id);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function cancelEditing() {
    setDraft(createBlankEmergencyContactDraft());
    setEditingContactId(null);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!targetUserId || !canManage) {
      setErrorMessage("You cannot edit emergency contacts for this profile.");
      return;
    }

    const result = buildEmergencyContactPayload(draft);
    if (result.errorMessage !== null) {
      setErrorMessage(result.errorMessage);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (editingContactId === "new") {
      const insertPayload: EmergencyContactInsertPayload = {
        ...result.payload,
        user_id: targetUserId,
      };

      const { data, error } = await supabase
        .from("emergency_contacts")
        .insert(insertPayload)
        .select(EMERGENCY_CONTACT_COLUMNS)
        .single();

      if (error) {
        console.error(error);
        setErrorMessage("Failed to add this emergency contact.");
        setSaving(false);
        return;
      }

      const savedContact = normalizeEmergencyContact(data as RawEmergencyContactRow);
      if (!savedContact) {
        setErrorMessage("This contact was saved, but the updated data could not be read.");
        setSaving(false);
        return;
      }

      setContacts((current) => sortEmergencyContacts([savedContact, ...current]));
      setDraft(createBlankEmergencyContactDraft());
      setEditingContactId(null);
      setSuccessMessage("Emergency contact added.");
      setSaving(false);
      return;
    }

    if (!editingContactId) {
      setErrorMessage("Choose a contact to edit.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("emergency_contacts")
      .update(result.payload)
      .eq("id", editingContactId)
      .eq("user_id", targetUserId)
      .select(EMERGENCY_CONTACT_COLUMNS)
      .single();

    if (error) {
      console.error(error);
      setErrorMessage("Failed to update this emergency contact.");
      setSaving(false);
      return;
    }

    const savedContact = normalizeEmergencyContact(data as RawEmergencyContactRow);
    if (!savedContact) {
      setErrorMessage("This contact was saved, but the updated data could not be read.");
      setSaving(false);
      return;
    }

    setContacts((current) =>
      sortEmergencyContacts(current.map((contact) => (contact.id === savedContact.id ? savedContact : contact)))
    );
    setDraft(createBlankEmergencyContactDraft());
    setEditingContactId(null);
    setSuccessMessage("Emergency contact updated.");
    setSaving(false);
  }

  async function handleDelete(contact: EmergencyContactRow) {
    if (!targetUserId || !canManage) {
      setErrorMessage("You cannot delete emergency contacts for this profile.");
      return;
    }

    if (!window.confirm("Delete this emergency contact?")) {
      return;
    }

    setDeletingContactId(contact.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("emergency_contacts")
      .delete()
      .eq("id", contact.id)
      .eq("user_id", targetUserId);

    if (error) {
      console.error(error);
      setErrorMessage("Failed to delete this emergency contact.");
      setDeletingContactId(null);
      return;
    }

    setContacts((current) => current.filter((currentContact) => currentContact.id !== contact.id));
    if (editingContactId === contact.id) {
      setDraft(createBlankEmergencyContactDraft());
      setEditingContactId(null);
    }
    setSuccessMessage("Emergency contact deleted.");
    setDeletingContactId(null);
  }

  return (
    <section className={cx("account-section emergency-contacts-section", className)}>
      <div className="emergency-contacts-header">
        <h2 className="h5 mb-0">{title}</h2>
        {canManage && (
          <Button
            type="button"
            variant={editingContactId === "new" ? "outline-secondary" : "outline"}
            size="sm"
            onClick={editingContactId === "new" ? cancelEditing : startAddingContact}
            disabled={saving}
          >
            {editingContactId === "new" ? "Cancel" : "Add contact"}
          </Button>
        )}
      </div>

      {errorMessage && <div className="alert alert-danger mt-3 mb-0">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success mt-3 mb-0">{successMessage}</div>}

      {canManage && editingContactId !== null && (
        <form className="emergency-contact-form" onSubmit={handleSubmit}>
          <h3 className="emergency-contact-form-title">
            {editingContactId === "new" ? "Add contact" : `Edit ${editingContact?.name ?? "contact"}`}
          </h3>
          <div className="emergency-contact-form-grid">
            <Select
              id={`${idPrefix}EmergencyContactType`}
              label="Type"
              value={draft.contactType}
              onChange={(event) => {
                const nextType = event.target.value;
                setDraft((current) => ({
                  ...current,
                  contactType: isEmergencyContactType(nextType) ? nextType : "",
                }));
              }}
              required
              disabled={saving}
            >
              <option value="">Choose type</option>
              {emergencyContactTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Input
              id={`${idPrefix}EmergencyContactName`}
              label="Name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              required
              disabled={saving}
            />

            <Input
              id={`${idPrefix}EmergencyContactPhone`}
              label="Phone"
              type="tel"
              value={draft.phone}
              onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
              required
              disabled={saving}
            />

            <Input
              id={`${idPrefix}EmergencyContactEmail`}
              label="Email"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              disabled={saving}
            />
          </div>

          <div className="d-flex gap-2 flex-wrap mt-3">
            <Button type="submit" loading={saving} disabled={saving}>
              {saving ? "Saving..." : "Save contact"}
            </Button>
            <Button type="button" variant="outline-secondary" onClick={cancelEditing} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="accounts-loading emergency-contacts-loading">Loading emergency contacts...</div>
      ) : contacts.length === 0 ? (
        <p className="emergency-contacts-empty">No emergency contacts added.</p>
      ) : (
        <div className="emergency-contact-list">
          {contacts.map((contact) => (
            <div key={contact.id} className="emergency-contact-row">
              <div className="emergency-contact-main">
                <div className="emergency-contact-type">{formatEmergencyContactType(contact.contact_type)}</div>
                <div className="emergency-contact-name">{contact.name}</div>
                <div className="emergency-contact-meta">
                  <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  {contact.email && (
                    <>
                      <span aria-hidden="true"> - </span>
                      <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    </>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="emergency-contact-actions">
                  <Button
                    type="button"
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => startEditingContact(contact)}
                    disabled={saving || deletingContactId !== null}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDelete(contact)}
                    disabled={saving || deletingContactId !== null}
                    loading={deletingContactId === contact.id}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
