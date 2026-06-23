import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type BadgeVariant =
  | "default"
  | "pending"
  | "active"
  | "suspended"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
};

const variantClass: Record<BadgeVariant, string> = {
  default: "ui-badge",
  pending: "ui-badge ui-badge--pending",
  active: "ui-badge ui-badge--active",
  suspended: "ui-badge ui-badge--suspended",
  success: "ui-badge ui-badge--success",
  warning: "ui-badge ui-badge--warning",
  danger: "ui-badge ui-badge--danger",
  neutral: "ui-badge ui-badge--neutral",
};

export default function Badge({
  children,
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span className={cx(variantClass[variant], className)} {...props}>
      {children}
    </span>
  );
}
