import { type ReactElement, useId } from "react";

interface StateProps {
  action: ReactElement;
  description: string;
  title: string;
}

export function EmptyState({ action, description, title }: StateProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section aria-describedby={descriptionId} aria-labelledby={titleId} data-tab-state="empty">
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div data-tab-state-action="">{action}</div>
    </section>
  );
}

export function ErrorState({ action, description, title }: StateProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-atomic="true"
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-live="assertive"
      data-tab-state="error"
      role="alert"
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div data-tab-state-action="">{action}</div>
    </section>
  );
}
