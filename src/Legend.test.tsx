// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ScheduledIssue } from "./scheduler";
import { Legend } from "./Legend";

beforeAll(() => {
  // The legend only renders on the wide layout.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
});

function issue(overrides: Partial<ScheduledIssue> = {}): ScheduledIssue {
  return {
    id: "i1",
    identifier: "A-1",
    title: "Ship the thing",
    url: "https://linear.app/siig/issue/A-1",
    stateName: "In Progress",
    stateType: "started",
    stateColor: "#f2994a",
    stateProgress: 0.5,
    priority: 0,
    estimate: 3,
    hasEstimate: true,
    done: false,
    isCapacityForecast: false,
    ...overrides,
  } as ScheduledIssue;
}

describe("Legend", () => {
  it("names every status it is given", () => {
    render(
      <Legend
        issues={[
          issue(),
          issue({ id: "i2", identifier: "A-2", stateName: "Todo", stateType: "unstarted", stateColor: "#a3a3a3", stateProgress: 0 }),
        ]}
      />,
    );
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByText("Todo")).toBeTruthy();
  });

  it("keeps the blocked and done keys", () => {
    render(<Legend issues={[issue()]} />);
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("does not show an estimate, a default duration or a workday value", () => {
    render(<Legend issues={[issue(), issue({ id: "i2", identifier: "A-2", hasEstimate: false, estimate: 0 })]} />);
    expect(screen.queryByText(/no estimate/i)).toBeNull();
    expect(screen.queryByText(/default 3d/i)).toBeNull();
    expect(screen.queryByText(/working day/i)).toBeNull();
    expect(screen.queryByText(/\d+d/)).toBeNull();
  });

  it("does not show a capacity forecast", () => {
    render(<Legend issues={[issue({ isCapacityForecast: true })]} />);
    expect(screen.queryByText(/capacity forecast/i)).toBeNull();
    expect(screen.queryByText(/forecast/i)).toBeNull();
  });
});
