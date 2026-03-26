import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authProvider";
import supabase from "../../config/supabaseClient";

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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const onSubmit = async (formData: FormValues) => {
    if (!session?.user?.id) {
      alert("You must be logged in to create an announcement.");
      return;
    }

    const error = await addAnnouncement(
      formData.title.trim(),
      formData.body.trim(),
      session.user.id,
      "active"
    );

    if (error) {
      alert("Failed to create announcement: " + error.message);
      return;
    }

    alert("Announcement created successfully!");
    navigate("/app/announcements");
  };

  return (
    <>
      <h1>Create Announcement</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <input
            type="text"
            className="form-control"
            {...register("title", { required: true })}
            placeholder="Title"
          />
          {errors.title && <div className="form-error mt-1">Title is required.</div>}

          <textarea
            className="form-control mt-3"
            {...register("body", { required: true })}
            placeholder="Body"
            rows={5}
          />
          {errors.body && <div className="form-error mt-1">Body is required.</div>}
        </div>

        <button type="submit" className="btn btn-primary mt-4" disabled={isSubmitting}>
          Create Announcement
        </button>
      </form>
    </>
  );
}
