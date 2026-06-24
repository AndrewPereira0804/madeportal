import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

type MetricTone = "default" | "gold" | "success" | "warning" | "danger" | "info";

export type MetricCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  tone?: MetricTone;
};

export default function MetricCard({
  label,
  value,
  detail,
  meta,
  tone = "default",
  className,
  ...props
}: MetricCardProps) {
  return (
    <div className={cx("ui-metric-card", `ui-metric-card--${tone}`, className)} {...props}>
      <span className="ui-metric-card__label">{label}</span>
      <strong className="ui-metric-card__value">{value}</strong>
      {detail && <span className="ui-metric-card__detail">{detail}</span>}
      {meta && <span className="ui-metric-card__meta">{meta}</span>}
    </div>
  );
}
