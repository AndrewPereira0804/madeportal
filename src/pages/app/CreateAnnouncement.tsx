import { useForm } from "react-hook-form";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import supabase from "../../config/supabaseClient";
import { Button, Card, Input, PageHeader, Textarea } from "../../components/ui";

type FormValues = {
  title: string;
  body: string;
};

async function addAnnouncement(
  title: string,
  body: string,
  authorId: string | null,
  visibility: string
){
  const { error } = await supabase.from("announcements").insert({
    title,
    body,
    created_at: new Date().toISOString(),
    author_id: authorId,
    visibility,
  });

  return error;
}

export default function CreateAnnouncement() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (formData: FormValues) => {
    setErrorMessage(null);

    if (!session?.user?.id) {
      setErrorMessage("You must be logged in to create an announcement.");
      return;
    }

    const error = await addAnnouncement(
      formData.title.trim(),
      formData.body.trim(),
      session.user.id,
      "active"
    );

    if (error) {
      setErrorMessage("Failed to create announcement: " + error.message);
      return;
    }

    navigate("/app/announcements");
  };

  return (
    <Card>
      <PageHeader
        title="Create Announcement"
        subtitle="Share a chapter update or notice with members."
        bordered
        actions={
          <Button type="button" variant="outline-secondary" onClick={() => navigate("/app/announcements")}>
            Cancel
          </Button>
        }
      />

      <form className="mt-4" onSubmit={handleSubmit(onSubmit)}>
        {errorMessage && <div className="alert alert-danger mb-3">{errorMessage}</div>}

        <div className="d-grid gap-3">
          <Input
            type="text"
            label="Title"
            error={errors.title ? "Title is required." : undefined}
            {...register("title", { required: true })}
            placeholder="Title"
          />

          <Textarea
            label="Body"
            error={errors.body ? "Body is required." : undefined}
            {...register("body", { required: true })}
            placeholder="Body"
            rows={6}
          />
        </div>

        <Button type="submit" className="mt-4" loading={isSubmitting}>
          Create Announcement
        </Button>
      </form>
    </Card>
  );
}
