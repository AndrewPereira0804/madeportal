import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cx } from "./utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "outline-secondary"
  | "outline-gold"
  | "outline-dark"
  | "outline-light"
  | "ghost"
  | "danger";

type ButtonSize = "sm" | "md" | "lg";

type SharedButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn btn-primary ui-btn",
  secondary: "btn btn-secondary ui-btn",
  outline: "btn btn-outline-primary ui-btn",
  "outline-secondary": "btn btn-outline-secondary ui-btn",
  "outline-gold": "btn btn-outline-gold ui-btn",
  "outline-dark": "btn btn-outline-dark ui-btn",
  "outline-light": "btn btn-outline-light ui-btn",
  ghost: "btn ui-btn ui-btn--ghost",
  danger: "btn btn-outline-danger ui-btn",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

type NativeButtonProps = SharedButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    to?: undefined;
    href?: undefined;
  };

type LinkButtonProps = SharedButtonProps &
  Omit<LinkProps, "className" | "children"> & {
    to: LinkProps["to"];
    href?: undefined;
  };

type AnchorButtonProps = SharedButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    to?: undefined;
  };

export type ButtonProps = NativeButtonProps | LinkButtonProps | AnchorButtonProps;

function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  loading: boolean,
  className?: string,
): string {
  return cx(variantClass[variant], sizeClass[size], loading && "ui-btn--loading", className);
}

export default function Button(props: ButtonProps) {
  const {
    children,
    variant = "primary",
    size = "md",
    loading = false,
    className,
  } = props;

  const classes = buttonClasses(variant, size, loading, className);

  if ("to" in props && props.to !== undefined) {
    const { to, ...linkProps } = props as LinkButtonProps;
    return (
      <Link to={to} className={classes} aria-busy={loading || undefined} {...linkProps}>
        {children}
      </Link>
    );
  }

  if ("href" in props && props.href !== undefined) {
    const { href, ...anchorProps } = props as AnchorButtonProps;
    return (
      <a href={href} className={classes} aria-busy={loading || undefined} {...anchorProps}>
        {children}
      </a>
    );
  }

  const { disabled, type = "button", ...buttonProps } = props as NativeButtonProps;

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
