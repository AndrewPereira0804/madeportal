import { useEffect, useState } from "react";
import Likes from "./Likes";
import supabase from "../../config/supabaseClient";
import { useNavigate } from "react-router-dom";
import { Badge, Button } from "../../components/ui";

export type AnnouncementData = {
    id: number | string;
    title: string;
    body: string;
    date: string;
    author_id: string | null;
    visibility: string;
    likes: number;
    likedByCurrentUser: boolean;
};

type AnnouncementProps = AnnouncementData & {
    onDelete: (announcementId: AnnouncementData["id"]) => Promise<void>;
    isDeleting?: boolean;
    canDelete?: boolean;
    canEdit?: boolean;
};


async function getAuthorName(authorId: string | null): Promise<string> {
    if (!authorId) {
        return "Unknown";
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", authorId)
        .single();

    if (error) {
        console.error("Error fetching author name:", error);
        return "Unknown";
    }

    return data?.name ?? "Unknown";
}

export default function Announcement({
    id,
    title,
    body,
    date,
    author_id,
    visibility,
    likes,
    likedByCurrentUser,
    onDelete,
    isDeleting = false,
    canDelete = false,
    canEdit = false,
}: AnnouncementProps) {
    const [authorName, setAuthorName] = useState("Unknown");
    const navigate = useNavigate();
    const showActions = canDelete || canEdit;

    useEffect(() => {
        let ignore = false;

        async function loadAuthorName() {
            const name = await getAuthorName(author_id);
            if (!ignore) {
                setAuthorName(name);
            }
        }

        loadAuthorName();

        return () => {
            ignore = true;
        };
    }, [author_id]);

    return (
        <article className="announcement-card">
            <div className="announcement-card-top">
                <h2 className="announcement-title">{title}</h2>
                <Badge variant="info">{visibility}</Badge>
            </div>

            <p className="announcement-content">{body}</p>

            <div className="announcement-meta">
                <p className="announcement-date">{date}</p>
                <p className="announcement-author">By: {authorName ?? "Unknown"}</p>
            </div>

            <div className="announcement-actions">
                <Likes
                    announcementId={id}
                    initialLikes={likes}
                    initialLiked={likedByCurrentUser}
                />
                {showActions && (
                    <>
                        {canDelete && (
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                    void onDelete(id);
                                }}
                                disabled={isDeleting}
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </Button>
                        )}
                        {canEdit && (
                            <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                onClick={() => {
                                    navigate(`/app/announcements/${id}/edit`);
                                }}
                            >
                                Edit
                            </Button>
                        )}
                    </>
                )}
            </div>
            
        </article>
    );
}
