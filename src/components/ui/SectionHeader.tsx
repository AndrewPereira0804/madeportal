import type { ReactNode } from "react";
import { cx } from "./utils";

export type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass = {
  sm: "ui-section-header ui-section-header--sm",
  md: "ui-section-header",
  lg: "ui-section-header ui-section-header--lg",
};

export default function SectionHeader({
  title,
  description,
  actions,
  size = "md",
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx(sizeClass[size], actions ? "ui-section-header--with-actions" : undefined, className)}>
      <div className="ui-section-header__content">
        <h2 className="ui-section-header__title">{title}</h2>
        {description && <p className="ui-section-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-section-header__actions">{actions}</div>}
    </div>
  );
}
