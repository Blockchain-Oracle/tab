import type { ReactElement } from "react";

export interface UnreadBadgeProps {
  count: number | null | undefined;
  /** Screen-reader noun, e.g. "unread notifications" / "failed deliveries". */
  srLabel?: string | undefined;
}

/**
 * Unread counter pill. Hidden while unknown (null/undefined) and at zero —
 * a zero badge is noise. Caps the display at 99+.
 */
export function UnreadBadge({
  count,
  srLabel = "unread notifications",
}: UnreadBadgeProps): ReactElement | null {
  if (!count || count < 1) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span data-tab-unread-badge="" key={display}>
      {display}
      <span data-tab-sr-only="">{`${count} ${srLabel}`}</span>
    </span>
  );
}
