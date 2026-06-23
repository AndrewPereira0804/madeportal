import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cx } from "./utils";

export type ActionCardProps = Omit<LinkProps, "className" | "children"> & {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export default function ActionCard({
  title,
  description,
  eyebrow,
  meta,
  className,
  ...props
}: ActionCardProps) {
  return (
    <Link className={cx("ui-action-card", className)} {...props}>
      <span className="ui-action-card__content">
        {eyebrow && <span className="ui-action-card__eyebrow">{eyebrow}</span>}
        <span className="ui-action-card__title">{title}</span>
        {description && <span className="ui-action-card__description">{description}</span>}
      </span>
      {meta && <span className="ui-action-card__meta">{meta}</span>}
    </Link>
  );
}
