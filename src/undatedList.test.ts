import { describe, it, expect } from "vitest";
import type { ScheduledIssue } from "./scheduler";
import { groupUndatedIssues } from "./undatedGroups";

function issue(overrides: Partial<ScheduledIssue> & Pick<ScheduledIssue, "id" | "identifier" | "isCapacityForecast">): ScheduledIssue {
  return { priority: 0, milestone: null, ...overrides } as ScheduledIssue;
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
});