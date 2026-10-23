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
    state: { name: "Todo", type: "unstarted", color: "#000", position: 0 },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
  };
  return { ...base, project: { id: projectId, name: projectName } };
}

describe("filterMatchingIssues", () => {
  it("keeps only the header project when projectIds is empty, even if another issue is in the Soon window", () => {
    const today = "2026-01-01";
    const soonDue = "2026-01-20";
    const header = issue("header", "project-1", "Header", "2026-03-01");
    const otherSoon = issue("other", "project-2", "Other", soonDue);
    const query = emptyPlannerQuery();

    const kept = filterMatchingIssues([otherSoon, header], query, "project-1", today);

    expect(query.projectIds).toEqual([]);
    expect(kept.map((row) => row.id)).toEqual(["header"]);
    expect(otherSoon.dueDate).toBe(soonDue);
  });
});
