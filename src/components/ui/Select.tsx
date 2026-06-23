import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "./utils";

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  selectClassName?: string;
};

export default function Select({
  label,
  hint,
  error,
  id,
  className,
  selectClassName,
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("ui-field", error && "ui-field--error", className)}>
      {label && (
        <label className="ui-field__label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cx("form-select ui-select", error && "is-invalid", selectClassName)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {children}
      </select>
      {hint && !error && (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
