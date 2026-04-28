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
        if (saving || liked) {
            return;
        }

        const previousLikes = likes;
        const nextLikes = previousLikes + 1;

        setLiked(true);
        setLikes(nextLikes);
        setSaving(true);

        const { error } = await supabase
            .from("announcements")
            .update({ likes: nextLikes })
            .eq("id", announcementId);

        setSaving(false);

        if (error) {
            setLiked(false);
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
        if (!likedAnnouncementIds.includes(announcementId)) {
            likedAnnouncementIds.push(announcementId);
            localStorage.setItem(storageKey, JSON.stringify(likedAnnouncementIds));
        }
    }

    return (
        <button
            type="button"
            className={`like-btn${liked ? " is-liked" : ""}`}
            disabled={saving || liked}
            onClick={toggleLike}
        >
            Likes: {likes}
        </button>
    );
}
