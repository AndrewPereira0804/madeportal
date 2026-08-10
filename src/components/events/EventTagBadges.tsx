import Badge from "../ui/Badge";
import { cx } from "../ui/utils";
import {
  getEventTypeClassName,
  getEventTypeLabel,
  normalizeEventTags,
} from "../../lib/eventTypes";

type EventTagBadgesProps = {
  eventTags: unknown;
  eventType?: string | null;
  className?: string;
  maxTags?: number;
};

export default function EventTagBadges({
  eventTags,
  eventType,
  className,
  maxTags,
}: EventTagBadgesProps) {
  const tags = normalizeEventTags(eventTags, eventType);
  const visibleTags = typeof maxTags === "number" ? tags.slice(0, maxTags) : tags;
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <span className={cx("event-tag-list", className)}>
      {visibleTags.map((tag) => (
        <Badge key={tag} variant="neutral" className={`event-type-badge ${getEventTypeClassName(tag)}`}>
          {getEventTypeLabel(tag)}
        </Badge>
      ))}
      {hiddenCount > 0 && <Badge variant="neutral">+{hiddenCount}</Badge>}
    </span>
  );
}
