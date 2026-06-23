import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utils";

export type StatCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  subvalue?: ReactNode;
  trend?: ReactNode;
};

export default function StatCard({
  label,
  value,
  subvalue,
  trend,
  className,
  ...props
}: StatCardProps) {
  return (
    <div className={cx("ui-stat-card", className)} {...props}>
      <span className="ui-stat-card__label">{label}</span>
      <strong className="ui-stat-card__value">{value}</strong>
      {subvalue && <span className="ui-stat-card__subvalue">{subvalue}</span>}
      {trend && <span className="ui-stat-card__trend">{trend}</span>}
    </div>
  );
}
