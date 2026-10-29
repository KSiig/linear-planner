import { describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import { buildTreeIssues } from "./treeFacts";

function issue(overrides: Partial<LinearIssue> & { id: string; identifier: string }): LinearIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/${overrides.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    sortOrder: 0,
    startedAt: null,
    completedAt: null,
    dueDate: null,
    description: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: { id: "state-todo", name: "To do", type: "unstarted", color: "#ccc", position: 1 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    ...overrides,
  };
}

const blocks = (id: string, relatedIssue: { id: string; identifier: string }) => ({
  id,
  type: "blocks",
  relatedIssue,
});

describe("buildTreeIssues", () => {
  it("reads the issue facts off the issue", () => {
    const [tree] = buildTreeIssues(
      [
        issue({
          id: "a",
          identifier: "A-1",
          dueDate: "2026-11-02",
          startedAt: "2026-10-01T08:00:00.000Z",
          completedAt: "2026-10-05T08:00:00.000Z",
          priority: 2,
          priorityLabel: "High",
          assignee: { id: "u1", name: "Robin", avatarUrl: "https://example.com/a.png" },
          projectMilestone: { id: "m1", name: "One", sortOrder: 1 },
          labels: { nodes: [{ name: "bug", color: "#f00" }] },
        }),
      ],
      new Set<string>(),
    );

    expect(tree.dueDate).toBe("2026-11-02");
    expect(tree.startedAt).toBe("2026-10-01T08:00:00.000Z");
    expect(tree.completedAt).toBe("2026-10-05T08:00:00.000Z");
    expect(tree.priorityLabel).toBe("High");
    expect(tree.assigneeName).toBe("Robin");
    expect(tree.milestone).toEqual({ id: "m1", name: "One", sortOrder: 1 });
    expect(tree.labels).toEqual([{ name: "bug", color: "#f00" }]);
  });

  it("lists the blockers of an issue with the relation that removes them", () => {
    const issues = [
      issue({
        id: "a",
        identifier: "A-1",
        relations: { nodes: [blocks("rel-1", { id: "b", identifier: "B-1" })] },
      }),
      issue({ id: "b", identifier: "B-1" }),
    ];

    const tree = buildTreeIssues(issues, new Set<string>());

    expect(tree[0].blockedBy).toEqual([]);
    expect(tree[1].blockedBy).toEqual([
      { id: "a", identifier: "A-1", title: "A-1", done: false, relationId: "rel-1" },
    ]);
  });

  it("ignores relations that do not point at a known issue", () => {
    const issues = [
      issue({
        id: "a",
        identifier: "A-1",
        relations: { nodes: [blocks("rel-1", { id: "gone", identifier: "G-1" })] },
      }),
    ];

    expect(buildTreeIssues(issues, new Set<string>())[0].blockedBy).toEqual([]);
  });

  it("marks an issue done when its state id is configured as terminal", () => {
    const issues = [
      issue({
        id: "a",
        identifier: "A-1",
        state: { id: "state-merged", name: "Merged", type: "started", color: "#0f0", position: 4 },
      }),
    ];

    expect(buildTreeIssues(issues, new Set<string>())[0].done).toBe(false);
    expect(buildTreeIssues(issues, new Set(["state-merged"]))[0].done).toBe(true);
  });

  it("marks a completed issue done without any configuration", () => {
    const issues = [
      issue({
        id: "a",
        identifier: "A-1",
        state: { id: "state-done", name: "Done", type: "completed", color: "#0f0", position: 5 },
      }),
    ];

    expect(buildTreeIssues(issues, new Set<string>())[0].done).toBe(true);
  });
});
