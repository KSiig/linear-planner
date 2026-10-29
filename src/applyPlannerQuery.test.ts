import { describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import { emptyPlannerQuery } from "./plannerQuery";
import { filterMatchingIssues, type StampedIssue } from "./applyPlannerQuery";

function issue(id: string, projectId: string, projectName: string, dueDate: string | null): StampedIssue {
  const base: LinearIssue = {
    id,
    identifier: id,
    title: id,
    url: `https://linear.app/issue/${id}`,
    estimate: null,
    priority: 0,
    priorityLabel: "No priority",
    sortOrder: 0,
    startedAt: null,
    completedAt: null,
    dueDate,
    description: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#000", position: 0 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
  };
  return { ...base, project: { id: projectId, name: projectName } };
}

describe("filterMatchingIssues", () => {
  const today = "2026-01-01";
  const fromA = issue("a", "A", "A", "2026-03-01");
  const fromB = issue("b", "B", "B", "2026-01-20");

  it("keeps issues from A and from B when projectIds is empty", () => {
    const kept = filterMatchingIssues([fromA, fromB], emptyPlannerQuery(), today);
    expect(kept.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("drops issues from B when projectIds is only A", () => {
    const query = { ...emptyPlannerQuery(), projectIds: ["A"] };
    const kept = filterMatchingIssues([fromA, fromB], query, today);
    expect(kept.map((row) => row.id)).toEqual(["a"]);
  });
});
