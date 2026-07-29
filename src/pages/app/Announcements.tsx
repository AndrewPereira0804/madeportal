import Announcement, { type AnnouncementData } from "./Announcement";
import { useEffect, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import {
    canCreateAnnouncements,
    canDeleteAnyAnnouncement,
    canUpdateAnyAnnouncement,
} from "../../auth/roleAccess";
import useRoles from "../../auth/useRoles";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";

type AnnouncementRow = {
    id: AnnouncementData["id"];
    title: AnnouncementData["title"];
    body: AnnouncementData["body"];
    created_at: string;
    author_id: AnnouncementData["author_id"];
    visibility: string;
    likes: number;
    likedByCurrentUser: boolean;
    authorName: AnnouncementData["authorName"];
    authorRoleSlugs: AnnouncementData["authorRoleSlugs"];
};

type AnnouncementRecord = Omit<AnnouncementRow, "likedByCurrentUser" | "authorName" | "authorRoleSlugs">;

type AnnouncementLikeRow = {
    announcement_id: AnnouncementRow["id"];
};

type AuthorProfileRow = {
    user_id: string;
    name: string | null;
};

type AuthorRoleRow = {
    user_id: string;
    role_slug: string;
};

type AuthorMetadata = {
    name: string;
    roleSlugs: string[];
};

function getUniqueAuthorIds(announcements: AnnouncementRecord[]) {
    return [
        ...new Set(
            announcements
                .map((announcement) => announcement.author_id)
                .filter((authorId): authorId is string => Boolean(authorId))
        ),
    ];
}

async function getAuthorMetadata(authorIds: string[]) {
    const authorMetadataById = new Map<string, AuthorMetadata>();

    authorIds.forEach((authorId) => {
        authorMetadataById.set(authorId, {
            name: "Unknown",
            roleSlugs: [],
        });
    });

    if (authorIds.length === 0) {
        return authorMetadataById;
    }

    const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", authorIds);

    if (profileError) {
        console.warn("Could not fetch announcement author profiles:", profileError);
    } else {
        ((profileData ?? []) as AuthorProfileRow[]).forEach((profile) => {
            authorMetadataById.set(profile.user_id, {
                name: profile.name ?? "Unknown",
                roleSlugs: authorMetadataById.get(profile.user_id)?.roleSlugs ?? [],
            });
        });
    }

    const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role_slug")
        .in("user_id", authorIds);

    if (roleError) {
        console.warn("Could not fetch announcement author roles:", roleError);
    } else {
        ((roleData ?? []) as AuthorRoleRow[]).forEach((role) => {
            const currentMetadata = authorMetadataById.get(role.user_id) ?? {
                name: "Unknown",
                roleSlugs: [],
            };

            authorMetadataById.set(role.user_id, {
                ...currentMetadata,
                roleSlugs: [...currentMetadata.roleSlugs, role.role_slug],
            });
        });
    }

    return authorMetadataById;
}

function applyAnnouncementMetadata(
    announcements: AnnouncementRecord[],
    likedAnnouncementIds: Set<string>,
    authorMetadataById: Map<string, AuthorMetadata>
) {
    return announcements.map((announcement) => {
        const authorMetadata = announcement.author_id
            ? authorMetadataById.get(announcement.author_id)
            : null;

        return {
            ...announcement,
            likedByCurrentUser: likedAnnouncementIds.has(String(announcement.id)),
            authorName: authorMetadata?.name ?? "Unknown",
            authorRoleSlugs: authorMetadata?.roleSlugs ?? [],
        };
    });
}

export default function Announcements() {
    const navigate = useNavigate();
    const { session } = useAuth();
    const { roles } = useRoles();
    const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<AnnouncementRow["id"] | null>(null);
    const userId = session?.user?.id;
    const canDeleteAny = canDeleteAnyAnnouncement(roles);
    const canUpdateAny = canUpdateAnyAnnouncement(roles);
    const canCreate = canCreateAnnouncements(roles);

    useEffect(() => {
        let ignore = false;

        async function fetchAnnouncements() {
            setLoading(true);
            setErrorMessage(null);

            try {
                const { data, error } = await supabase
                    .from("announcements")
                    .select("id, created_at, title, body, visibility, author_id, likes")
                    .order("created_at", { ascending: false });

                if (error) {
                    throw error;
                }

                const announcementRows = (data ?? []) as AnnouncementRecord[];
                const authorMetadataById = await getAuthorMetadata(getUniqueAuthorIds(announcementRows));
                const likedAnnouncementIds = new Set<string>();

                if (announcementRows.length > 0 && userId) {
                    const announcementIds = announcementRows.map((announcement) => announcement.id);
                    const { data: likeData, error: likeError } = await supabase
                        .from("announcement_likes")
                        .select("announcement_id")
                        .eq("user_id", userId)
                        .in("announcement_id", announcementIds);

                    if (likeError) {
                        throw likeError;
                    }

                    ((likeData ?? []) as AnnouncementLikeRow[]).forEach((like) =>
                        likedAnnouncementIds.add(String(like.announcement_id))
                    );
                }

                if (!ignore) {
                    setAnnouncements(
                        applyAnnouncementMetadata(
                            announcementRows,
                            likedAnnouncementIds,
                            authorMetadataById
                        )
                    );
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "An unexpected error occurred.";
                if (!ignore) {
                    setAnnouncements([]);
                    setErrorMessage(`Could not load announcements: ${message}`);
                }
                console.error("Error fetching announcements:", error);
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        fetchAnnouncements();
        return () => {
            ignore = true;
        };
    }, [userId]);

    async function handleDelete(announcementId: AnnouncementRow["id"]) {
        setDeletingId(announcementId);
        setErrorMessage(null);

        try {
            const { count, error } = await supabase
                .from("announcements")
                .delete({ count: "exact" })
                .eq("id", announcementId);

            if (error) {
                throw error;
            }

            if (count === 0) {
                throw new Error(
                    "Delete was blocked or no matching announcement was found."
                );
            }

            setAnnouncements((currentAnnouncements) =>
                currentAnnouncements.filter((announcement) => announcement.id !== announcementId)
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "An unexpected error occurred while deleting.";
            setErrorMessage(`Could not delete announcement: ${message}`);
            console.error("Error deleting announcement:", error);
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <Card className="announcements-page">
            <PageHeader
                title="Announcements"
                subtitle="Latest chapter updates and notices."
                bordered
                actions={
                    canCreate ? (
                        <Button type="button" onClick={() => navigate("create")}>
                            Create Announcement
                        </Button>
                    ) : undefined
                }
            />

            {loading && <p className="announcements-state">Loading announcements...</p>}
            {errorMessage && (
                <p className="announcements-state announcements-state-error">{errorMessage}</p>
            )}
            {!loading && !errorMessage && announcements.length === 0 && (
                <EmptyState
                    title="No announcements yet"
                    description="Chapter updates, notices, and operational posts will appear here."
                    action={
                        canCreate ? (
                            <Button type="button" onClick={() => navigate("create")}>Create announcement</Button>
                        ) : undefined
                    }
                />
            )}

            {!loading && !errorMessage && announcements.length > 0 && (
                <div className="announcements-container">
                    {announcements.map((announcement: AnnouncementRow) => (
                        <Announcement
                            key={announcement.id}
                            id={announcement.id}
                            title={announcement.title}
                            body={announcement.body}
                            date={new Date(announcement.created_at).toLocaleDateString()}
                            author_id={announcement.author_id}
                            visibility={announcement.visibility}
                            likes={announcement.likes}
                            likedByCurrentUser={announcement.likedByCurrentUser}
                            authorName={announcement.authorName}
                            authorRoleSlugs={announcement.authorRoleSlugs}
                            onDelete={handleDelete}
                            isDeleting={deletingId === announcement.id}
                            canDelete={announcement.author_id === userId || canDeleteAny}
                            canEdit={announcement.author_id === userId || canUpdateAny}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
}
