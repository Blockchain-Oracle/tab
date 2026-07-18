import type { ReactNode } from "react";

export type StageFlowlineState =
  | "complete"
  | "active"
  | "upcoming"
  | "blocked"
  | "failed"
  | "unavailable";

export interface StageFlowlineStage {
  detail?: ReactNode;
  id: string;
  label: string;
  state: StageFlowlineState;
}

export interface StageFlowlineProps {
  currentStageId: string;
  label: string;
  stages: readonly StageFlowlineStage[];
}

const STATE_LABEL: Readonly<Record<StageFlowlineState, string>> = Object.freeze({
  active: "In progress",
  blocked: "Blocked",
  complete: "Complete",
  failed: "Failed",
  unavailable: "Unavailable",
  upcoming: "Not started",
});

export class InvalidStageFlowlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStageFlowlineError";
  }
}

function validateStages(stages: readonly StageFlowlineStage[], currentStageId: string) {
  if (stages.length === 0) {
    throw new InvalidStageFlowlineError("A StageFlowline requires at least one stage.");
  }
  const ids = new Set<string>();
  let activeId: string | undefined;
  for (const stage of stages) {
    if (ids.has(stage.id)) {
      throw new InvalidStageFlowlineError(`Duplicate StageFlowline id: ${stage.id}`);
    }
    ids.add(stage.id);
    if (stage.state === "active") {
      if (activeId) {
        throw new InvalidStageFlowlineError("A StageFlowline may have only one active stage.");
      }
      activeId = stage.id;
    }
  }
  if (!ids.has(currentStageId)) {
    throw new InvalidStageFlowlineError("The current StageFlowline id must identify a stage.");
  }
  if (activeId && activeId !== currentStageId) {
    throw new InvalidStageFlowlineError("An active StageFlowline stage must be current.");
  }
}

function FlowlineMark() {
  return (
    <svg aria-hidden="true" data-tab-flowline-mark="" focusable="false" viewBox="0 0 20 52">
      <path d="M10 0V52" data-tab-flowline-path="" pathLength="1" />
      <circle cx="10" cy="16" data-tab-flowline-node="" r="5" />
    </svg>
  );
}

export function StageFlowline({ currentStageId, label, stages }: StageFlowlineProps) {
  validateStages(stages, currentStageId);

  return (
    <ol aria-label={label} aria-live="polite" data-tab-stage-flowline="">
      {stages.map((stage) => (
        <li
          aria-current={stage.id === currentStageId ? "step" : undefined}
          data-state={stage.state}
          key={stage.id}
        >
          <FlowlineMark />
          <span data-tab-flowline-content="">
            <span data-tab-flowline-label="">{stage.label}</span>
            <span data-tab-flowline-state="">{STATE_LABEL[stage.state]}</span>
            {stage.detail !== null && stage.detail !== undefined ? (
              <span data-tab-flowline-detail="">{stage.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
