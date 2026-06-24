import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cx } from "./utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
  textareaClassName?: string;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    id,
    className,
    textareaClassName,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("ui-field", error && "ui-field--error", className)}>
      {label && (
        <label className="ui-field__label" htmlFor={textareaId}>
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cx("form-control ui-textarea", error && "is-invalid", textareaClassName)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        ref={ref}
        {...props}
      />
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
});

export default Textarea;
