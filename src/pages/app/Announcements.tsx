import Announcement, { type AnnouncementData } from "./Announcement";
import { useEffect, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authProvider";
import useRoles from "../../auth/useRoles";
import { Button, Card, PageHeader } from "../../components/ui";

type AnnouncementRow = {
    id: AnnouncementData["id"];
    title: AnnouncementData["title"];
    body: AnnouncementData["body"];
    created_at: string;
    author_id: AnnouncementData["author_id"];
    visibility: string;
    likes: number;
    likedByCurrentUser: boolean;
};

type AnnouncementRecord = Omit<AnnouncementRow, "likedByCurrentUser">;

type AnnouncementLikeRow = {
    announcement_id: AnnouncementRow["id"];
};

export default function Announcements() {
    const navigate = useNavigate();
    const { session } = useAuth();
    const { roles } = useRoles();
    const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<AnnouncementRow["id"] | null>(null);
    const userId = session?.user?.id;
    const isAdmin = roles.includes("admin");

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
                if (announcementRows.length === 0 || !userId) {
                    if (!ignore) {
                        setAnnouncements(
                            announcementRows.map((announcement) => ({
                                ...announcement,
                                likedByCurrentUser: false,
                            }))
                        );
                    }
                    return;
                }

                const announcementIds = announcementRows.map((announcement) => announcement.id);
                const { data: likeData, error: likeError } = await supabase
                    .from("announcement_likes")
                    .select("announcement_id")
                    .eq("user_id", userId)
                    .in("announcement_id", announcementIds);

                if (likeError) {
                    throw likeError;
                }

                const likedAnnouncementIds = new Set(
                    ((likeData ?? []) as AnnouncementLikeRow[]).map((like) =>
                        String(like.announcement_id)
                    )
                );

                if (!ignore) {
                    setAnnouncements(
                        announcementRows.map((announcement) => ({
                            ...announcement,
                            likedByCurrentUser: likedAnnouncementIds.has(String(announcement.id)),
                        }))
                    );
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "An unexpected error occurred.";
                if (!ignore) {
                    setAnnouncements([]);
                    setErrorMessage(`Could not load announcements: ${message}`);
                }
                console.log("Error fetching announcements:", error);
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
            console.log("Error deleting announcement:", error);
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
                    <Button type="button" onClick={() => navigate("create")}>
                        Create Announcement
                    </Button>
                }
            />

            {loading && <p className="announcements-state">Loading announcements...</p>}
            {errorMessage && (
                <p className="announcements-state announcements-state-error">{errorMessage}</p>
            )}
            {!loading && !errorMessage && announcements.length === 0 && (
                <p className="announcements-state">No announcements yet.</p>
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
                            onDelete={handleDelete}
                            isDeleting={deletingId === announcement.id}
                            canDelete={announcement.author_id === userId || isAdmin}
                            canEdit={announcement.author_id === userId}
                        />
                    ))}
                </div>
            )}
        </Card>
    );
}
