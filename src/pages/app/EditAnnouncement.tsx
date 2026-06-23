import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/authProvider";
import supabase from "../../config/supabaseClient";
import useRoles from "../../auth/useRoles";
import { Button, Card, PageHeader } from "../../components/ui";

type FormValues = {
  title: string;
  body: string;
};

type AnnouncementRecord = FormValues & {
  author_id: string | null;
  visibility: string;
};

async function getAnnouncementById(announcementId: string) {
  return supabase
    .from("announcements")
    .select("title, body, author_id, visibility")
    .eq("id", announcementId)
    .single<AnnouncementRecord>();
}

async function editAnnouncement(
  announcementId: string,
  title: string,
  body: string,
  visibility: string
) {
  const { error, count } = await supabase
    .from("announcements")
    .update({
      title,
      body,
      visibility,
    }, { count: "exact" })
    .eq("id", announcementId);

  return { error, count };
}

export default function EditAnnouncement() {
  const navigate = useNavigate();
  const { announcementId } = useParams<{ announcementId: string }>();
  const { session } = useAuth();
  const { roles, loading: rolesLoading } = useRoles();
  const [loadingAnnouncement, setLoadingAnnouncement] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announcementAuthorId, setAnnouncementAuthorId] = useState<string | null>(null);
  const isAdmin = roles.includes("admin");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: "",
      body: "",
    },
  });

  useEffect(() => {
    let ignore = false;

    async function loadAnnouncement() {
      if (rolesLoading) {
        return;
      }

      if (!announcementId) {
        setLoadError("Announcement ID is missing.");
        setLoadingAnnouncement(false);
        return;
      }

      setLoadingAnnouncement(true);
      setLoadError(null);

      const { data, error } = await getAnnouncementById(announcementId);

      if (ignore) {
        return;
      }

      if (error || !data) {
        setLoadError(error?.message ?? "Announcement not found.");
        setLoadingAnnouncement(false);
        return;
      }

      const canEditAnnouncement =
        data.author_id === session?.user?.id || isAdmin;

      if (!canEditAnnouncement) {
        setLoadError("You can only edit your own announcements unless you are an admin.");
        setLoadingAnnouncement(false);
        return;
      }

      setAnnouncementAuthorId(data.author_id);
      reset({
        title: data.title ?? "",
        body: data.body ?? "",
      });
      setLoadingAnnouncement(false);
    }

    void loadAnnouncement();

    return () => {
      ignore = true;
    };
  }, [announcementId, isAdmin, reset, rolesLoading, session?.user?.id]);

  const onSubmit = async (formData: FormValues) => {
    if (!announcementId) {
      alert("Announcement ID is missing.");
      return;
    }

    if (!session?.user?.id) {
      alert("You must be logged in to edit an announcement.");
      return;
    }

    const canEditAnnouncement =
      announcementAuthorId === session.user.id || isAdmin;

    if (!canEditAnnouncement) {
      alert("You can only edit your own announcements unless you are an admin.");
      return;
    }

    const { error, count } = await editAnnouncement(
      announcementId,
      formData.title.trim(),
      formData.body.trim(),
      "active"
    );

    if (error) {
      alert("Failed to edit announcement: " + error.message);
      return;
    }

    if (count === 0) {
      alert("Edit was blocked or no matching announcement was found.");
      return;
    }

    alert("Announcement edited successfully!");
    navigate("/app/announcements");
  };

  return (
    <Card>
      <PageHeader
        title="Edit Announcement"
        subtitle="Update the title and body for this announcement."
        bordered
        actions={
          <Button type="button" variant="outline-secondary" onClick={() => navigate("/app/announcements")}>
            Cancel
          </Button>
        }
      />

      {loadingAnnouncement && <p className="mt-4 mb-0">Loading announcement...</p>}
      {loadError && <div className="form-error mb-3 mt-4">{loadError}</div>}
      {!loadingAnnouncement && !loadError && (
        <form className="mt-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <input
              type="text"
              className="form-control ui-input"
              {...register("title", { required: true })}
              placeholder="Title"
            />
            {errors.title && <div className="form-error mt-1">Title is required.</div>}

            <textarea
              className="form-control ui-textarea mt-3"
              {...register("body", { required: true })}
              placeholder="Body"
              rows={5}
            />
            {errors.body && <div className="form-error mt-1">Body is required.</div>}
          </div>

          <div className="d-flex gap-2 mt-4">
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              onClick={() => navigate("/app/announcements")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
