import type { ReactNode } from 'react';

interface StateFeedbackProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function LoadingState({ title, description, action }: StateFeedbackProps) {
  return (
    <div className="state-feedback state-feedback-loading" role="status" aria-live="polite">
      <p className="state-feedback-title">{title}</p>
      {description ? <p className="state-feedback-description">{description}</p> : null}
      {action ? <div className="state-feedback-action">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: StateFeedbackProps) {
  return (
    <div className="state-feedback state-feedback-empty" role="status" aria-live="polite">
      <p className="state-feedback-title">{title}</p>
      {description ? <p className="state-feedback-description">{description}</p> : null}
      {action ? <div className="state-feedback-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description, action }: StateFeedbackProps) {
  return (
    <div className="state-feedback state-feedback-error" role="alert" aria-live="assertive">
      <p className="state-feedback-title">{title}</p>
      {description ? <p className="state-feedback-description">{description}</p> : null}
      {action ? <div className="state-feedback-action">{action}</div> : null}
    </div>
  );
}
