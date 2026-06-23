import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type PageShellWidth = "default" | "narrow" | "wide" | "full";

export type PageShellProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  width?: PageShellWidth;
  centered?: boolean;
};

const widthClass: Record<PageShellWidth, string> = {
  default: "ui-page-shell",
  narrow: "ui-page-shell ui-page-shell--narrow",
  wide: "ui-page-shell ui-page-shell--wide",
  full: "ui-page-shell ui-page-shell--full",
};

export default function PageShell({
  children,
  width = "default",
  centered = false,
  className,
  ...props
}: PageShellProps) {
  return (
    <div
      className={cx(widthClass[width], centered && "ui-page-shell--centered", className)}
      {...props}
    >
      {children}
    </div>
  );
}
