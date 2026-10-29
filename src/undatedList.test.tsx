// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ScheduledIssue } from "./scheduler";
import { UndatedList } from "./UndatedList";
import { groupUndatedIssues } from "./undatedGroups";

afterEach(() => {
  cleanup();
});

function issue(overrides: Partial<ScheduledIssue> & Pick<ScheduledIssue, "id" | "identifier" | "isCapacityForecast">): ScheduledIssue {
  return {
    priority: 0,
    milestone: null,
    title: "Fix the login page",
    url: "https://linear.app/siig/issue/A-1",
    stateName: "Todo",
    stateType: "unstarted",
    stateColor: "#a3a3a3",
    stateProgress: 0,
    done: false,
    blockedBy: [],
    estimate: 3,
    hasEstimate: true,
    ...overrides,
  } as ScheduledIssue;
}

describe("groupUndatedIssues", () => {
  const milestones = [
    { id: "m1", name: "One", sortOrder: 1 },
    { id: "m2", name: "Two", sortOrder: 2 },
  ];

  it("drops issues that sit on the timeline", () => {
    const groups = groupUndatedIssues([
      issue({ id: "a", identifier: "A-1", isCapacityForecast: false }),
      issue({ id: "b", identifier: "A-2", isCapacityForecast: true }),
    ], milestones);
    expect(groups).toEqual([
      { id: null, name: "No milestone", issues: [expect.objectContaining({ identifier: "A-2" })] },
    ]);
  });

  it("keeps milestone order and puts urgent issues ahead of no priority", () => {
    const groups = groupUndatedIssues([
      issue({ id: "late", identifier: "A-2", isCapacityForecast: true, priority: 0, milestone: { id: "m2", name: "Two", sortOrder: 2 } }),
      issue({ id: "none", identifier: "A-9", isCapacityForecast: true, priority: 0, milestone: { id: "m1", name: "One", sortOrder: 1 } }),
      issue({ id: "urgent", identifier: "A-1", isCapacityForecast: true, priority: 1, milestone: { id: "m1", name: "One", sortOrder: 1 } }),
    ], milestones);
    expect(groups.map((group) => group.name)).toEqual(["One", "Two"]);
    expect(groups[0].issues.map((item) => item.identifier)).toEqual(["A-1", "A-9"]);
  });

  it("orders issues with the same priority by identifier", () => {
    const groups = groupUndatedIssues([
      issue({ id: "b", identifier: "A-2", isCapacityForecast: true, priority: 1 }),
      issue({ id: "a", identifier: "A-1", isCapacityForecast: true, priority: 1 }),
    ], milestones);
    expect(groups[0].issues.map((item) => item.identifier)).toEqual(["A-1", "A-2"]);
  });
});

describe("UndatedList", () => {
  it("lists the undated issues grouped by milestone", () => {
    render(
      <UndatedList
        issues={[
          issue({ id: "a", identifier: "A-1", isCapacityForecast: true }),
          issue({ id: "b", identifier: "A-2", isCapacityForecast: true, milestone: { id: "m1", name: "One", sortOrder: 1 } }),
        ]}
        milestones={[{ id: "m1", name: "One", sortOrder: 1 }]}
      />,
    );
    expect(screen.getByRole("region", { name: "No due date" })).toBeTruthy();
    expect(screen.getByText("One")).toBeTruthy();
    expect(screen.getByText("No milestone")).toBeTruthy();
    expect(screen.getByText("A-1")).toBeTruthy();
    expect(screen.getByText("A-2")).toBeTruthy();
  });

  it("shows no estimate, workday value or default duration", () => {
    render(
      <UndatedList
        issues={[
          issue({ id: "a", identifier: "A-1", isCapacityForecast: true, estimate: 3 }),
          issue({ id: "b", identifier: "A-2", isCapacityForecast: true, estimate: 2.5, hasEstimate: false }),
        ]}
        milestones={[]}
      />,
    );
    expect(screen.queryAllByText(/^\d+(\.\d+)?d$/)).toEqual([]);
    expect(screen.queryByText(/no estimate/i)).toBeNull();
    expect(screen.queryByText(/working day/i)).toBeNull();
  });

  it("shows no capacity forecast and no date", () => {
    render(
      <UndatedList
        issues={[issue({ id: "a", identifier: "A-1", isCapacityForecast: true })]}
        milestones={[]}
      />,
    );
    expect(screen.queryByText(/capacity forecast/i)).toBeNull();
    expect(screen.queryByText(/forecast/i)).toBeNull();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
  });

  it("keeps the blocked marker and drops it when the issue is not blocked", () => {
    render(
      <UndatedList
        issues={[
          issue({
            id: "a",
            identifier: "A-1",
            isCapacityForecast: true,
            blockedBy: [{ id: "b", identifier: "B-1", title: "blocker", done: false, relationId: "rel-1" }],
          }),
          issue({ id: "b", identifier: "A-2", isCapacityForecast: true }),
        ]}
        milestones={[]}
      />,
    );
    expect(screen.getAllByText("Blocked")).toHaveLength(1);
  });

  it("renders nothing when there is no undated issue", () => {
    const { container } = render(<UndatedList issues={[]} milestones={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
