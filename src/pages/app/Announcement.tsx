import Likes from "./Likes";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getAnnouncementAuthorAccent } from "../../auth/roleAccess";
import { Badge, Button, Textarea } from "../../components/ui";

export type AnnouncementReplyData = {
    id: string;
    announcement_id: number | string;
    author_id: string;
    body: string;
    created_at: string;
    authorName: string;
};

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
    replies: AnnouncementReplyData[];
    replyCount: number;
    repliesLoaded: boolean;
    repliesLoading: boolean;
    repliesError: string | null;
};

type AnnouncementProps = AnnouncementData & {
    onDelete: (announcementId: AnnouncementData["id"]) => Promise<void>;
    onLoadReplies: (announcementId: AnnouncementData["id"]) => Promise<void>;
    onCreateReply: (announcementId: AnnouncementData["id"], body: string) => Promise<void>;
    onUpdateReply: (replyId: AnnouncementReplyData["id"], body: string) => Promise<void>;
    onDeleteReply: (
        announcementId: AnnouncementData["id"],
        replyId: AnnouncementReplyData["id"]
    ) => Promise<void>;
    isDeleting?: boolean;
    canDelete?: boolean;
    canEdit?: boolean;
    canReply?: boolean;
    canModerateReplies?: boolean;
    currentUserId?: string | null;
};

function formatReplyDate(createdAt: string) {
    return new Date(createdAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

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
    replies,
    replyCount,
    repliesLoaded,
    repliesLoading,
    repliesError,
    onDelete,
    onLoadReplies,
    onCreateReply,
    onUpdateReply,
    onDeleteReply,
    isDeleting = false,
    canDelete = false,
    canEdit = false,
    canReply = false,
    canModerateReplies = false,
    currentUserId = null,
}: AnnouncementProps) {
    const navigate = useNavigate();
    const [replyBody, setReplyBody] = useState("");
    const [replyFormOpen, setReplyFormOpen] = useState(false);
    const [replyListOpen, setReplyListOpen] = useState(false);
    const [replyError, setReplyError] = useState<string | null>(null);
    const [submittingReply, setSubmittingReply] = useState(false);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [editingReplyBody, setEditingReplyBody] = useState("");
    const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
    const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
    const showActions = canDelete || canEdit;
    const accent = getAnnouncementAuthorAccent(authorRoleSlugs);
    const replyCountLabel = `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
    const replyFormId = `announcement-reply-form-${id}`;
    const replyListId = `announcement-reply-list-${id}`;
    const canToggleReplies = replyCount > 0 || replyListOpen;

    function toggleReplyForm() {
        if (replyFormOpen) {
            setReplyError(null);
        }

        setReplyFormOpen(!replyFormOpen);
    }

    async function toggleReplyList() {
        if (replyListOpen) {
            setReplyListOpen(false);
            return;
        }

        setReplyListOpen(true);

        if (!repliesLoaded) {
            await onLoadReplies(id);
        }
    }

    async function handleReplySubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setReplyError(null);

        try {
            setSubmittingReply(true);
            await onCreateReply(id, replyBody);
            setReplyBody("");
            setReplyFormOpen(false);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "An unexpected error occurred.";
            setReplyError(`Could not add reply: ${message}`);
        } finally {
            setSubmittingReply(false);
        }
    }

    function startEditingReply(reply: AnnouncementReplyData) {
        setReplyError(null);
        setEditingReplyId(reply.id);
        setEditingReplyBody(reply.body);
    }

    function cancelEditingReply() {
        setEditingReplyId(null);
        setEditingReplyBody("");
    }

    async function handleReplyUpdate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!editingReplyId) {
            return;
        }

        setReplyError(null);

        try {
            setSavingReplyId(editingReplyId);
            await onUpdateReply(editingReplyId, editingReplyBody);
            cancelEditingReply();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "An unexpected error occurred.";
            setReplyError(`Could not update reply: ${message}`);
        } finally {
            setSavingReplyId(null);
        }
    }

    async function handleReplyDelete(replyId: AnnouncementReplyData["id"]) {
        setReplyError(null);

        try {
            setDeletingReplyId(replyId);
            await onDeleteReply(id, replyId);
            if (editingReplyId === replyId) {
                cancelEditingReply();
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "An unexpected error occurred.";
            setReplyError(`Could not delete reply: ${message}`);
        } finally {
            setDeletingReplyId(null);
        }
    }

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

            <section className="announcement-replies" aria-label={`Replies to ${title}`}>
                <div className="announcement-replies__header">
                    <h3>Replies</h3>
                    <div className="announcement-replies__controls">
                        <span>{replyCountLabel}</span>
                        {canToggleReplies && (
                            <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                aria-expanded={replyListOpen}
                                aria-controls={replyListId}
                                loading={repliesLoading}
                                onClick={() => {
                                    void toggleReplyList();
                                }}
                            >
                                {replyListOpen ? "Hide replies" : "View replies"}
                            </Button>
                        )}
                        {canReply && (
                            <Button
                                type="button"
                                variant="outline-secondary"
                                size="sm"
                                aria-expanded={replyFormOpen}
                                aria-controls={replyFormId}
                                onClick={toggleReplyForm}
                            >
                                {replyFormOpen ? "Hide reply" : "Reply"}
                            </Button>
                        )}
                    </div>
                </div>

                {replyError && (
                    <p className="announcement-reply-error" role="status">
                        {replyError}
                    </p>
                )}

                {canReply && replyFormOpen && (
                    <form
                        id={replyFormId}
                        className="announcement-reply-form"
                        onSubmit={handleReplySubmit}
                    >
                        <Textarea
                            label="Reply"
                            value={replyBody}
                            rows={3}
                            maxLength={1200}
                            onChange={(event) => setReplyBody(event.target.value)}
                            disabled={submittingReply}
                        />
                        <div className="announcement-reply-form__actions">
                            <Button
                                type="submit"
                                size="sm"
                                loading={submittingReply}
                                disabled={!replyBody.trim()}
                            >
                                Reply
                            </Button>
                        </div>
                    </form>
                )}

                {replyListOpen && (
                    <div id={replyListId}>
                        {repliesLoading && (
                            <p className="announcement-replies__empty">Loading replies...</p>
                        )}

                        {repliesError && (
                            <p className="announcement-reply-error" role="status">
                                {repliesError}
                            </p>
                        )}

                        {!repliesLoading && !repliesError && repliesLoaded && replies.length === 0 && (
                            <p className="announcement-replies__empty">No replies yet.</p>
                        )}

                        {!repliesLoading && !repliesError && replies.length > 0 && (
                            <div className="announcement-reply-list">
                                {replies.map((reply) => {
                                    const isReplyAuthor = reply.author_id === currentUserId;
                                    const canEditReply = isReplyAuthor;
                                    const canDeleteReply = isReplyAuthor || canModerateReplies;
                                    const isEditing = editingReplyId === reply.id;

                                    return (
                                        <article className="announcement-reply" key={reply.id}>
                                            <div className="announcement-reply__meta">
                                                <span>{reply.authorName}</span>
                                                <time dateTime={reply.created_at}>
                                                    {formatReplyDate(reply.created_at)}
                                                </time>
                                            </div>

                                            {isEditing ? (
                                                <form
                                                    className="announcement-reply-edit-form"
                                                    onSubmit={handleReplyUpdate}
                                                >
                                                    <Textarea
                                                        label="Edit reply"
                                                        value={editingReplyBody}
                                                        rows={3}
                                                        maxLength={1200}
                                                        onChange={(event) => setEditingReplyBody(event.target.value)}
                                                        disabled={savingReplyId === reply.id}
                                                    />
                                                    <div className="announcement-reply__actions">
                                                        <Button
                                                            type="submit"
                                                            size="sm"
                                                            loading={savingReplyId === reply.id}
                                                            disabled={!editingReplyBody.trim()}
                                                        >
                                                            Save
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline-secondary"
                                                            size="sm"
                                                            onClick={cancelEditingReply}
                                                            disabled={savingReplyId === reply.id}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <>
                                                    <p className="announcement-reply__body">{reply.body}</p>
                                                    {(canEditReply || canDeleteReply) && (
                                                        <div className="announcement-reply__actions">
                                                            {canEditReply && (
                                                                <Button
                                                                    type="button"
                                                                    variant="outline-secondary"
                                                                    size="sm"
                                                                    onClick={() => startEditingReply(reply)}
                                                                    disabled={deletingReplyId === reply.id}
                                                                >
                                                                    Edit
                                                                </Button>
                                                            )}
                                                            {canDeleteReply && (
                                                                <Button
                                                                    type="button"
                                                                    variant="danger"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        void handleReplyDelete(reply.id);
                                                                    }}
                                                                    loading={deletingReplyId === reply.id}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </article>
    );
}
