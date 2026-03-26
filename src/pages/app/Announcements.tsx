import Announcement, { type AnnouncementData } from "./Announcement";
import { useEffect, useState } from "react";
import supabase from "../../config/supabaseClient";
import { useNavigate } from "react-router-dom";

type AnnouncementRow = {
    id: AnnouncementData["id"];
    title: AnnouncementData["title"];
    body: AnnouncementData["body"];
    created_at: string;
    author_id: AnnouncementData["author_id"];
    visibility: string;
    likes: number;
};


export default function Announcements() {
    const navigate = useNavigate();
    const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<AnnouncementRow["id"] | null>(null);
    
    useEffect(() => {
        async function fetchAnnouncements() {
            setLoading(true);
            const { data, error } = await supabase
                .from("announcements")
                .select("id, created_at, title, body, visibility, author_id, likes")
                .order("created_at", { ascending: false });

            if (error) {
                setAnnouncements([]);
                setErrorMessage(`Could not load announcements: ${error.message}`);
                console.log("Error fetching announcements:", error);
            } else {
                setAnnouncements((data ?? []) as AnnouncementRow[]);
                setErrorMessage(null);
            }

            setLoading(false);
        }

        fetchAnnouncements();
        return () => {
            setAnnouncements([]);
            setLoading(false);
            setErrorMessage(null);
        };
    }, []);

    async function handleDelete(announcementId: AnnouncementRow["id"]) {
        setDeletingId(announcementId);
        setErrorMessage(null);

        try {
            const { data, error } = await supabase
                .from("announcements")
                .delete()
                .eq("id", announcementId)
                .select("id");

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) {
                throw new Error(
                    "Delete completed without removing any rows. Check the Supabase DELETE and SELECT policies for announcements."
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
        <section className="theme-card announcements-page p-4 p-md-5">
            <div className="announcements-header">
                <h1 className="page-title">Announcements</h1>
                <p className="page-subtitle mt-2">Latest chapter updates and notices.</p>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => navigate("create")}
                >
                    Create Announcement
                </button>
            </div>

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
                            onDelete={handleDelete}
                            isDeleting={deletingId === announcement.id}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
