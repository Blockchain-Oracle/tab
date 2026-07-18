import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StageFlowline, type StageFlowlineStage } from "../index.ts";

const RED_MARKER = "[RED: motion policy]";

const initialStages = [
  { id: "identity", label: "Identity", state: "active" },
  { id: "balance", label: "Balance", state: "upcoming" },
  { id: "authorization", label: "Authorization", state: "upcoming" },
] as const satisfies readonly StageFlowlineStage[];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function states() {
  return within(screen.getByRole("list", { name: "Checkout progress" }))
    .getAllByRole("listitem")
    .map((item) => ({
      current: item.getAttribute("aria-current"),
      label: item.querySelector("[data-tab-flowline-label]")?.textContent,
      state: item.getAttribute("data-state"),
    }));
}

it(`${RED_MARKER} advances only from a new caller snapshot`, () => {
  vi.useFakeTimers();
  const { rerender } = render(<StageFlowline label="Checkout progress" stages={initialStages} />);

  const before = states();
  act(() => vi.advanceTimersByTime(60_000));
  expect(states()).toEqual(before);

  rerender(
    <StageFlowline
      label="Checkout progress"
      stages={[
        { id: "identity", label: "Identity", state: "complete" },
        { id: "balance", label: "Balance", state: "active" },
        { id: "authorization", label: "Authorization", state: "upcoming" },
      ]}
    />,
  );

  expect(states()).toEqual([
    { current: null, label: "Identity", state: "complete" },
    { current: "step", label: "Balance", state: "active" },
    { current: null, label: "Authorization", state: "upcoming" },
  ]);
});
