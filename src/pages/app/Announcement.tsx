import Likes from "./Likes";

export type AnnouncementProps = {
    id: number | string;
    title: string;
    body: string;
    date: string;
    author_id: string | null;
    visibility: string;
    likes: number;
};

export default function Announcement({ id, title, body, date, author_id, visibility, likes }: AnnouncementProps) {
    return (
        <div className="announcement-card">
            <h2 className="announcement-title">{title}</h2>
            <p className="announcement-content">{body}</p>
            <p className="announcement-date">{date}</p>
            <p className="announcement-author">By: {author_id ?? "Unknown"}</p>
            <p className="announcement-visibility">Visibility: {visibility}</p>
            <Likes announcementId={id} initialLikes={likes} />
        </div>
    )
    
}
