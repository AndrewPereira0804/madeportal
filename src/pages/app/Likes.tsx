import { useEffect, useRef, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authContext";

type LikesProps = {
    announcementId: number | string;
    initialLikes: number;
    initialLiked: boolean;
};

type LikeState = {
    announcementId: LikesProps["announcementId"];
    likes: number;
    liked: boolean;
};

export default function Likes({ announcementId, initialLikes, initialLiked }: LikesProps) {
    const { session } = useAuth();
    const userId = session?.user?.id;
    const [likeState, setLikeState] = useState<LikeState>({
        announcementId,
        likes: initialLikes,
        liked: initialLiked,
    });
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [likeAnimationActive, setLikeAnimationActive] = useState(false);
    const animationTimeoutRef = useRef<number | null>(null);

    const hasLocalStateForAnnouncement = String(likeState.announcementId) === String(announcementId);
    const likes = hasLocalStateForAnnouncement ? likeState.likes : initialLikes;
    const liked = hasLocalStateForAnnouncement ? likeState.liked : initialLiked;
    const buttonClassName = [
        "like-btn",
        liked ? "is-liked" : "",
        saving ? "is-saving" : "",
        likeAnimationActive ? "is-animating" : "",
    ]
        .filter(Boolean)
        .join(" ");

    useEffect(() => {
        return () => {
            if (animationTimeoutRef.current !== null) {
                window.clearTimeout(animationTimeoutRef.current);
            }
        };
    }, []);

    function triggerLikeAnimation() {
        if (animationTimeoutRef.current !== null) {
            window.clearTimeout(animationTimeoutRef.current);
        }

        setLikeAnimationActive(true);
        animationTimeoutRef.current = window.setTimeout(() => {
            setLikeAnimationActive(false);
            animationTimeoutRef.current = null;
        }, 360);
    }

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
            setLikeState((currentState) => {
                if (String(currentState.announcementId) !== String(announcementId)) {
                    return currentState;
                }

                return {
                    ...currentState,
                    likes: data.likes,
                };
            });
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

        triggerLikeAnimation();
        setLikeState({
            announcementId,
            likes: nextLikes,
            liked: nextLiked,
        });
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
            setLikeState({
                announcementId,
                likes: previousLikes,
                liked: previousLiked,
            });
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
                className={buttonClassName}
                disabled={saving || !userId}
                aria-pressed={liked}
                aria-label={`${liked ? "Unlike" : "Like"} announcement, ${likes} ${likes === 1 ? "like" : "likes"}`}
                onClick={toggleLike}
            >
                <span className="like-btn__icon" aria-hidden="true" />
                <span className="like-btn__label">{saving ? "Saving" : liked ? "Liked" : "Like"}</span>
                <span className="like-btn__count" aria-live="polite">{likes}</span>
            </button>
            {errorMessage && (
                <span className="like-error" role="status">
                    {errorMessage}
                </span>
            )}
        </div>
    );
}
