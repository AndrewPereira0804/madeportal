import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type CardPadding = "none" | "sm" | "md" | "lg";
type CardVariant = "default" | "elevated" | "flat";

export type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  padding?: CardPadding;
  variant?: CardVariant;
  as?: "section" | "article" | "div";
};

const paddingClass: Record<CardPadding, string> = {
  none: "ui-card--padding-none",
  sm: "ui-card--padding-sm",
  md: "ui-card--padding-md",
  lg: "ui-card--padding-lg",
};

const variantClass: Record<CardVariant, string> = {
  default: "ui-card",
  elevated: "ui-card ui-card--elevated",
  flat: "ui-card ui-card--flat",
};

export default function Card({
  children,
  padding = "lg",
  variant = "default",
  as: Tag = "section",
  className,
  ...props
}: CardProps) {
  return (
    <Tag className={cx(variantClass[variant], paddingClass[padding], className)} {...props}>
      {children}
    </Tag>
  );
}
