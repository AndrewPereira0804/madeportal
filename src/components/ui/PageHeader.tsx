import type { ReactNode } from "react";
import { cx } from "./utils";

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  bordered?: boolean;
  className?: string;
};

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  bordered = false,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cx(
        "ui-page-header",
        bordered && "ui-page-header--bordered",
        actions ? "ui-page-header--with-actions" : undefined,
        className,
      )}
    >
      <div className="ui-page-header__content">
        {eyebrow && <p className="ui-page-header__eyebrow">{eyebrow}</p>}
        <h1 className="ui-page-header__title">{title}</h1>
        {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}
