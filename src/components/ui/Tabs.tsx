import type { ReactNode } from "react";
import { cx } from "./utils";

export type TabItem<TValue extends string> = {
  value: TValue;
  label: ReactNode;
  count?: ReactNode;
};

export type TabsProps<TValue extends string> = {
  items: TabItem<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  ariaLabel: string;
  className?: string;
};

export default function Tabs<TValue extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: TabsProps<TValue>) {
  return (
    <div className={cx("ui-tabs", className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cx("ui-tab", selected && "ui-tab--active")}
            onClick={() => onChange(item.value)}
            disabled={selected}
          >
            <span>{item.label}</span>
            {item.count !== undefined && <span className="ui-tab__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
