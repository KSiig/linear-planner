// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { TreeIssue } from "./treeFacts";
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

function issue(overrides: Partial<TreeIssue> = {}): TreeIssue {
  return {
    id: "i1",
    identifier: "A-1",
    title: "Ship the thing",
    url: "https://linear.app/siig/issue/A-1",
    milestone: null,
    stateName: "In Progress",
    stateType: "started",
    stateColor: "#f2994a",
    stateProgress: 0.5,
    priority: 0,
    priorityLabel: "No priority",
    assigneeAvatarUrl: null,
    assigneeName: null,
    labels: [],
    done: false,
    blockedBy: [],
    dueDate: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
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

  it("shows no estimate, no default duration and no workday value", () => {
    render(<Legend issues={[issue(), issue({ id: "i2", identifier: "A-2" })]} />);
    expect(screen.queryByText(/no estimate/i)).toBeNull();
    expect(screen.queryByText(/default 3d/i)).toBeNull();
    expect(screen.queryByText(/working day/i)).toBeNull();
    expect(screen.queryByText(/\d+d/)).toBeNull();
  });

  it("shows no capacity forecast", () => {
    render(<Legend issues={[issue()]} />);
    expect(screen.queryByText(/capacity forecast/i)).toBeNull();
    expect(screen.queryByText(/forecast/i)).toBeNull();
  });
});
