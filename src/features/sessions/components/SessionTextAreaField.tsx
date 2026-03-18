import type { TextareaHTMLAttributes } from 'react';

interface SessionTextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
}

export function SessionTextAreaField({
  id,
  label,
  required,
  error,
  className,
  ...textAreaProps
}: SessionTextAreaFieldProps) {
  return (
    <div className="session-field session-field-full">
      <label className="session-label" htmlFor={id}>
        {label}
        {required ? <span className="required-mark">*</span> : null}
      </label>
      <textarea
        id={id}
        className={className ?? 'session-textarea'}
        aria-invalid={Boolean(error)}
        {...textAreaProps}
      />
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
