import type { ReactNode } from "react";

export type EvidenceState =
  | "passed"
  | "pending"
  | "blocked"
  | "failed"
  | "unavailable"
  | "not-reached";

export interface EvidenceItem {
  detail?: ReactNode;
  id: string;
  label: string;
  state: EvidenceState;
}

export interface EvidenceRailProps {
  items: readonly EvidenceItem[];
  label: string;
}

const STATE_LABEL: Readonly<Record<EvidenceState, string>> = Object.freeze({
  blocked: "Blocked",
  failed: "Failed",
  "not-reached": "Not reached",
  passed: "Passed",
  pending: "Pending",
  unavailable: "Unavailable",
});

export function EvidenceRail({ items, label }: EvidenceRailProps) {
  return (
    <ol aria-label={label} data-tab-evidence-rail="">
      {items.map((item) => (
        <li data-state={item.state} key={item.id}>
          <span data-tab-evidence-label="">{item.label}</span>
          <span data-tab-evidence-state="">{STATE_LABEL[item.state]}</span>
          {item.detail !== null && item.detail !== undefined ? (
            <span data-tab-evidence-detail="">{item.detail}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
