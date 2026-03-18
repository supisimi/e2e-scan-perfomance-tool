import type { InputHTMLAttributes } from 'react';

interface SessionTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
}

export function SessionTextField({
  id,
  label,
  required,
  error,
  className,
  ...inputProps
}: SessionTextFieldProps) {
  return (
    <div className="session-field">
      <label className="session-label" htmlFor={id}>
        {label}
        {required ? <span className="required-mark">*</span> : null}
      </label>
      <input id={id} className={className ?? 'session-input'} aria-invalid={Boolean(error)} {...inputProps} />
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
