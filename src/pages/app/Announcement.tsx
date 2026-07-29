import Likes from "./Likes";
import { useNavigate } from "react-router-dom";
import { getAnnouncementAuthorAccent } from "../../auth/roleAccess";
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
    authorName: string;
    authorRoleSlugs: string[];
};

type AnnouncementProps = AnnouncementData & {
    onDelete: (announcementId: AnnouncementData["id"]) => Promise<void>;
    isDeleting?: boolean;
    canDelete?: boolean;
    canEdit?: boolean;
};

export default function Announcement({
    id,
    title,
    body,
    date,
    visibility,
    likes,
    likedByCurrentUser,
    authorName,
    authorRoleSlugs,
    onDelete,
    isDeleting = false,
    canDelete = false,
    canEdit = false,
}: AnnouncementProps) {
    const navigate = useNavigate();
    const showActions = canDelete || canEdit;
    const accent = getAnnouncementAuthorAccent(authorRoleSlugs);

    return (
        <article className={`announcement-card announcement-card--${accent}`}>
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
