import Announcement, { type AnnouncementProps } from "./Announcement";
import { useEffect, useState } from "react";
import supabase from "../../config/supabaseClient";

type AnnouncementRow = {
    id: AnnouncementProps["id"];
    title: AnnouncementProps["title"];
    body: AnnouncementProps["body"];
    created_at: string;
    author_id: AnnouncementProps["author_id"];
    visibility: string;
    likes: number;
};

export default function Announcements() {
    const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    
    useEffect(() => {
        async function fetchAnnouncements() {
            setLoading(true);
            const { data, error } = await supabase
                .from("announcements")
                .select("id, created_at, title, body, visibility, author_id, likes")
                .order("created_at", { ascending: false });

            if (error) {
                setAnnouncements([]);
                setErrorMessage(error.message);
                console.error("Error fetching announcements:", error);
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

    return (
        <>
        <h1>Announcements</h1>
        {loading && <p>Loading announcements...</p>}
        {errorMessage && <p>Could not load announcements: {errorMessage}</p>}
        {!loading && !errorMessage && announcements.length === 0 && <p>No announcements yet.</p>}
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
                
                />
            ))}
        </div>
        </>
    ); 
}
