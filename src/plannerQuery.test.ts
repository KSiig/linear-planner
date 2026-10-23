import { describe, expect, it } from "vitest";
import { emptyPlannerQuery, matchesQuery, type QueryIssue } from "./plannerQuery";

const TODAY = "2026-10-23";
const HUSKOB = "huskob";
const AD_HOC = "ad-hoc";

function issue(overrides: Partial<QueryIssue> = {}): QueryIssue {
  return {
    project: { id: AD_HOC },
    state: { type: "started" },
    assignee: { id: "kasper" },
    priority: 2,
    labels: { nodes: [{ name: "Bug" }] },
    projectMilestone: { id: "m1" },
    dueDate: "2026-11-28",
    ...overrides,
  };
}

describe("matchesQuery", () => {
  it("does not match an Ad-hoc issue when projectIds is empty and the selected project is Huskøb", () => {
    const query = emptyPlannerQuery();
    expect(matchesQuery(issue(), query, HUSKOB, TODAY)).toBe(false);
  });

  it("matches the same issue when projectIds contains the Ad-hoc id", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC] };
    expect(matchesQuery(issue(), query, HUSKOB, TODAY)).toBe(true);
  });

  it("matches due 2026-11-28 as soon and not as next", () => {
    const soon = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "soon" as const };
    const next = { ...soon, dueWindow: "next" as const };
    expect(matchesQuery(issue(), soon, HUSKOB, TODAY)).toBe(true);
    expect(matchesQuery(issue(), next, HUSKOB, TODAY)).toBe(false);
  });

  it("matches a null due date as none and not as soon", () => {
    const none = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "none" as const };
    const soon = { ...none, dueWindow: "soon" as const };
    expect(matchesQuery(issue({ dueDate: null }), none, HUSKOB, TODAY)).toBe(true);
    expect(matchesQuery(issue({ dueDate: null }), soon, HUSKOB, TODAY)).toBe(false);
  });

  it("matches assignee unassigned when the issue has no assignee", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC], assigneeIds: ["unassigned"] };
    expect(matchesQuery(issue({ assignee: null }), query, HUSKOB, TODAY)).toBe(true);
    expect(matchesQuery(issue(), query, HUSKOB, TODAY)).toBe(false);
  });
});
