import { describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import { toIssueQuickLookData } from "./issueQuickLookModel";
import { emptyPlannerQuery } from "./plannerQuery";
import { filterMatchingIssues, toOverviewIssue, type StampedIssue } from "./applyPlannerQuery";
import { noDateCard } from "./views/overview/cards/no-date";

function issue(
  id: string,
  projectId: string,
  projectName: string,
  dueDate: string | null,
  overrides: Partial<LinearIssue> = {},
): StampedIssue {
  const base: LinearIssue = {
    id,
    identifier: id,
    title: id,
    url: `https://linear.app/issue/${id}`,
    priority: 0,
    priorityLabel: "No priority",
    sortOrder: 0,
    startedAt: null,
    completedAt: null,
    dueDate,
    description: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2025-12-01T00:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#000", position: 0 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
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

describe("toOverviewIssue", () => {
  it("keeps the canonical quick-look facts of a fetched issue", () => {
    const source = issue("issue-1", "project-1", "Linear Planner", null, {
      identifier: "SII-184",
      title: "Repair the Overview projection",
      url: "https://linear.app/siig/issue/SII-184",
      priority: 2,
      priorityLabel: "High",
      startedAt: "2026-01-02T09:00:00.000Z",
      completedAt: "2026-01-03T10:00:00.000Z",
      description: "<p>Canonical description</p>",
      updatedAt: "2026-01-04T11:12:13.000Z",
      createdAt: "2025-12-15T08:00:00.000Z",
      state: { id: "state-started", name: "In Progress", type: "started", color: "#f2994a", position: 2 },
      assignee: { id: "user-1", name: "Kasper", avatarUrl: "https://example.test/kasper.png" },
      projectMilestone: { id: "milestone-1", name: "M4", sortOrder: 1 },
      labels: { nodes: [{ name: "frontend", color: "#5e6ad2" }] },
      relations: {
        nodes: [{
          id: "relation-out",
          type: "blocks",
          relatedIssue: { id: "blocked", identifier: "SII-2", title: "Blocked issue", state: { type: "unstarted" } },
        }],
      },
      inverseRelations: {
        nodes: [{
          id: "relation-in",
          type: "blocks",
          relatedIssue: { id: "blocker", identifier: "SII-1", title: "Blocker issue", state: { type: "completed" } },
        }],
      },
    });

    const overview = toOverviewIssue(source);

    expect(overview).toEqual(toIssueQuickLookData(source));
    expect(overview).toMatchObject({
      id: "issue-1",
      identifier: "SII-184",
      title: "Repair the Overview projection",
      url: "https://linear.app/siig/issue/SII-184",
      state: { id: "state-started", name: "In Progress", type: "started", color: "#f2994a" },
      teamId: "team-1",
      priority: 2,
      priorityLabel: "High",
      assignee: { id: "user-1", name: "Kasper", avatarUrl: "https://example.test/kasper.png" },
      labels: [{ name: "frontend", color: "#5e6ad2" }],
      milestone: { id: "milestone-1", name: "M4" },
      project: { id: "project-1", name: "Linear Planner" },
      dueDate: null,
      createdAt: "2025-12-15T08:00:00.000Z",
      updatedAt: "2026-01-04T11:12:13.000Z",
      enteredStartedStatusAt: "2026-01-02T09:00:00.000Z",
      completedAt: "2026-01-03T10:00:00.000Z",
      description: "Canonical description",
      blockedBy: [{
        relationId: "relation-in",
        issue: { id: "blocker", identifier: "SII-1", title: "Blocker issue", stateType: "completed", isOpen: false },
      }],
      blocks: [{
        relationId: "relation-out",
        issue: { id: "blocked", identifier: "SII-2", title: "Blocked issue", stateType: "unstarted", isOpen: true },
      }],
    });
    expect(overview.updatedAt).toBe(source.updatedAt);
  });

  it("orders production no-date rows with the fetched updatedAt values", async () => {
    const older = toOverviewIssue(issue("older", "project-1", "Linear Planner", null, {
      identifier: "SII-2",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const newer = toOverviewIssue(issue("newer", "project-1", "Linear Planner", null, {
      identifier: "SII-1",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }));

    const model = await noDateCard.load({ today: "2026-04-08", issues: [newer, older] });

    expect(model?.sections[0]?.rows.map((row) => row.identifier)).toEqual(["SII-2", "SII-1"]);
  });
});
