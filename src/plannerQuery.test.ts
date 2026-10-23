import { describe, expect, it } from "vitest";
import { emptyPlannerQuery, matchesQuery, scopeProjectIds, type QueryIssue } from "./plannerQuery";

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

describe("scopeProjectIds", () => {
  it("uses a non-empty projectIds set in that order", () => {
    const query = { ...emptyPlannerQuery(), projectIds: ["B", "A"] };
    expect(scopeProjectIds(query, ["A", "B", "C"])).toEqual(["B", "A"]);
  });

  it("uses every selectable id in fetchProjects order when projectIds is empty", () => {
    expect(scopeProjectIds(emptyPlannerQuery(), ["A", "B"])).toEqual(["A", "B"]);
  });

  it("loads no issues when there are no selectable projects and projectIds is empty", () => {
    expect(scopeProjectIds(emptyPlannerQuery(), [])).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("matches an Ad-hoc issue when projectIds is empty", () => {
    expect(matchesQuery(issue(), emptyPlannerQuery(), TODAY)).toBe(true);
  });

  it("drops an Ad-hoc issue when projectIds is only Huskøb", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [HUSKOB] };
    expect(matchesQuery(issue(), query, TODAY)).toBe(false);
  });

  it("matches the same issue when projectIds contains the Ad-hoc id", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC] };
    expect(matchesQuery(issue(), query, TODAY)).toBe(true);
  });

  it("matches due 2026-11-28 as soon and not as next", () => {
    const soon = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "soon" as const };
    const next = { ...soon, dueWindow: "next" as const };
    expect(matchesQuery(issue(), soon, TODAY)).toBe(true);
    expect(matchesQuery(issue(), next, TODAY)).toBe(false);
  });

  it("matches a null due date as none and not as soon", () => {
    const none = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "none" as const };
    const soon = { ...none, dueWindow: "soon" as const };
    expect(matchesQuery(issue({ dueDate: null }), none, TODAY)).toBe(true);
    expect(matchesQuery(issue({ dueDate: null }), soon, TODAY)).toBe(false);
  });

  it("matches assignee unassigned when the issue has no assignee", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC], assigneeIds: ["unassigned"] };
    expect(matchesQuery(issue({ assignee: null }), query, TODAY)).toBe(true);
    expect(matchesQuery(issue(), query, TODAY)).toBe(false);
  });
});
