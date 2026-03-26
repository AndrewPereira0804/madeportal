import { useState } from "react"
import supabase from "../../config/supabaseClient";

type LikesProps = {
    announcementId: number | string;
    initialLikes: number;
};

export default function Likes({ announcementId, initialLikes }: LikesProps) {
    const [likes, setLikes] = useState(initialLikes);
    const [liked, setLiked] = useState(false);
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
        }
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
