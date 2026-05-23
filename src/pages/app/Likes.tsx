import { useEffect, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authProvider";

type LikesProps = {
    announcementId: number | string;
    initialLikes: number;
    initialLiked: boolean;
};

export default function Likes({ announcementId, initialLikes, initialLiked }: LikesProps) {
    const { session } = useAuth();
    const userId = session?.user?.id;
    const [likes, setLikes] = useState(initialLikes);
    const [liked, setLiked] = useState(initialLiked);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        setLikes(initialLikes);
    }, [announcementId, initialLikes]);

    useEffect(() => {
        setLiked(initialLiked);
    }, [announcementId, initialLiked, userId]);

    async function refreshLikeCount() {
        const { data, error } = await supabase
            .from("announcements")
            .select("likes")
            .eq("id", announcementId)
            .single();

        if (error) {
            throw error;
        }

        if (typeof data?.likes === "number") {
            setLikes(data.likes);
        }
    }

    async function toggleLike() {
        if (saving || !userId) {
            return;
        }

        const previousLikes = likes;
        const previousLiked = liked;
        const nextLiked = !previousLiked;
        const nextLikes = Math.max(0, previousLikes + (nextLiked ? 1 : -1));

        setLiked(nextLiked);
        setLikes(nextLikes);
        setSaving(true);
        setErrorMessage(null);

        try {
            if (nextLiked) {
                const { error } = await supabase
                    .from("announcement_likes")
                    .upsert(
                        { announcement_id: announcementId, user_id: userId },
                        {
                            ignoreDuplicates: true,
                            onConflict: "announcement_id,user_id",
                        }
                    );

                if (error) {
                    throw error;
                }
            } else {
                const { error } = await supabase
                    .from("announcement_likes")
                    .delete()
                    .eq("announcement_id", announcementId)
                    .eq("user_id", userId);

                if (error) {
                    throw error;
                }
            }

            await refreshLikeCount();
        } catch (error) {
            setLiked(previousLiked);
            setLikes(previousLikes);
            const message =
                error instanceof Error ? error.message : "An unexpected error occurred.";
            setErrorMessage(`Could not update like: ${message}`);
            console.error("Error updating like:", error);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="like-control">
            <button
                type="button"
                className={`like-btn${liked ? " is-liked" : ""}`}
                disabled={saving || !userId}
                aria-pressed={liked}
                onClick={toggleLike}
            >
                {saving ? "Saving..." : `${liked ? "Unlike" : "Like"} (${likes})`}
            </button>
            {errorMessage && (
                <span className="like-error" role="status">
                    {errorMessage}
                </span>
            )}
        </div>
    );
}
