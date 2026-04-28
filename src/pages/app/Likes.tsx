import { useMemo, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useAuth } from "../../auth/authProvider";

type LikesProps = {
    announcementId: number | string;
    initialLikes: number;
};

export default function Likes({ announcementId, initialLikes }: LikesProps) {
    const { session } = useAuth();
    const storageKey = useMemo(() => {
        const userId = session?.user?.id ?? "anonymous";
        return `announcement-likes:${userId}`;
    }, [session?.user?.id]);
    const [likes, setLikes] = useState(initialLikes);
    const [liked, setLiked] = useState(() => {
        const savedLikes = localStorage.getItem(storageKey);
        if (!savedLikes) {
            return false;
        }

        try {
            const likedAnnouncementIds = JSON.parse(savedLikes) as Array<number | string>;
            return likedAnnouncementIds.includes(announcementId);
        } catch {
            return false;
        }
    });
    const [saving, setSaving] = useState(false);

    async function toggleLike() {
        if (saving) {
            return;
        }

        const previousLikes = likes;
        const previousLiked = liked;
        const nextLiked = !previousLiked;
        const nextLikes = nextLiked ? previousLikes + 1 : Math.max(0, previousLikes - 1);

        setLiked(nextLiked);
        setLikes(nextLikes);
        setSaving(true);

        const { error } = await supabase
            .from("announcements")
            .update({ likes: nextLikes })
            .eq("id", announcementId);

        setSaving(false);

        if (error) {
            setLiked(previousLiked);
            setLikes(previousLikes);
            console.error("Error updating likes:", error);
            return;
        }

        const savedLikes = localStorage.getItem(storageKey);
        let likedAnnouncementIds: Array<number | string> = [];
        if (savedLikes) {
            try {
                likedAnnouncementIds = JSON.parse(savedLikes) as Array<number | string>;
            } catch {
                likedAnnouncementIds = [];
            }
        }
        if (nextLiked && !likedAnnouncementIds.includes(announcementId)) {
            likedAnnouncementIds.push(announcementId);
        } else if (!nextLiked && likedAnnouncementIds.includes(announcementId)) {
            likedAnnouncementIds = likedAnnouncementIds.filter((id) => id !== announcementId);
        }
        localStorage.setItem(storageKey, JSON.stringify(likedAnnouncementIds));
    }

    return (
        <button
            type="button"
            className={`like-btn${liked ? " is-liked" : ""}`}
            disabled={saving}
            onClick={toggleLike}
        >
            Likes: {likes}
        </button>
    );
}
