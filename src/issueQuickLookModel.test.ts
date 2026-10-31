import { describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import { toIssueQuickLookData, toPlainText } from "./issueQuickLookModel";

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-1",
    identifier: "SII-179",
    title: "Build the issue quick-look",
    url: "https://linear.app/siig/issue/SII-179",
    priority: 2,
    priorityLabel: "High",
    sortOrder: 100,
    startedAt: "2026-10-20T09:00:00.000Z",
    completedAt: null,
    dueDate: "2026-11-01",
    description: "A useful description",
    updatedAt: "2026-10-29T12:00:00.000Z",
    createdAt: "2026-10-01T08:00:00.000Z",
    state: { id: "state-started", name: "In Progress", type: "started", color: "#f2994a", position: 2 },
    team: { id: "team-1" },
    assignee: { id: "user-1", name: "Kasper", avatarUrl: "https://example.test/kasper.png" },
    projectMilestone: { id: "milestone-1", name: "M3", sortOrder: 1 },
    project: { id: "project-1", name: "Linear Planner" },
    labels: { nodes: [{ name: "frontend", color: "#5e6ad2" }] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

describe("toIssueQuickLookData", () => {
  it("projects every canonical issue detail", () => {
    const data = toIssueQuickLookData(issue());

    expect(data).toMatchObject({
      id: "issue-1",
      identifier: "SII-179",
      title: "Build the issue quick-look",
      url: "https://linear.app/siig/issue/SII-179",
      state: { id: "state-started", name: "In Progress", type: "started", color: "#f2994a" },
      teamId: "team-1",
      priority: 2,
      priorityLabel: "High",
      assignee: { id: "user-1", name: "Kasper", avatarUrl: "https://example.test/kasper.png" },
      labels: [{ name: "frontend", color: "#5e6ad2" }],
      milestone: { id: "milestone-1", name: "M3" },
      project: { id: "project-1", name: "Linear Planner" },
      dueDate: "2026-11-01",
      createdAt: "2026-10-01T08:00:00.000Z",
      updatedAt: "2026-10-29T12:00:00.000Z",
      enteredStartedStatusAt: "2026-10-20T09:00:00.000Z",
      completedAt: null,
      description: "A useful description",
    });
  });

  it("keeps outgoing and incoming blocks relations in their own directions", () => {
    const blocker = issue({
      id: "blocker",
      identifier: "SII-1",
      title: "Blocker issue",
      relations: {
        nodes: [{
          id: "relation-1",
          type: "blocks",
          relatedIssue: { id: "blocked", identifier: "SII-2", title: "Blocked issue", state: { type: "unstarted" } },
        }],
      },
    });
    const blocked = issue({
      id: "blocked",
      identifier: "SII-2",
      title: "Blocked issue",
      inverseRelations: {
        nodes: [{
          id: "relation-1",
          type: "blocks",
          relatedIssue: { id: "blocker", identifier: "SII-1", title: "Blocker issue", state: { type: "started" } },
        }],
      },
    });

    expect(toIssueQuickLookData(blocker).blocks).toEqual([
      {
        relationId: "relation-1",
        issue: { id: "blocked", identifier: "SII-2", title: "Blocked issue", stateType: "unstarted", isOpen: true },
      },
    ]);
    expect(toIssueQuickLookData(blocked).blockedBy).toEqual([
      {
        relationId: "relation-1",
        issue: { id: "blocker", identifier: "SII-1", title: "Blocker issue", stateType: "started", isOpen: true },
      },
    ]);
  });

  it("keeps closed blockers visible and marks them closed", () => {
    const blocked = issue({
      inverseRelations: {
        nodes: [
          {
            id: "relation-completed",
            type: "blocks",
            relatedIssue: { id: "done", identifier: "SII-3", title: "Done blocker", state: { type: "completed" } },
          },
          {
            id: "relation-canceled",
            type: "blocks",
            relatedIssue: { id: "canceled", identifier: "SII-4", title: "Canceled blocker", state: { type: "canceled" } },
          },
        ],
      },
    });

    expect(toIssueQuickLookData(blocked).blockedBy.map((relation) => relation.issue.isOpen)).toEqual([false, false]);
  });

  it("ignores relations that are not blocking relations", () => {
    const data = toIssueQuickLookData(issue({
      relations: {
        nodes: [{
          id: "relation-duplicate",
          type: "duplicate",
          relatedIssue: { id: "other", identifier: "SII-9", title: "Duplicate", state: { type: "unstarted" } },
        }],
      },
      inverseRelations: {
        nodes: [{
          id: "relation-related",
          type: "related",
          relatedIssue: { id: "other", identifier: "SII-9", title: "Related", state: { type: "unstarted" } },
        }],
      },
    }));

    expect(data.blocks).toEqual([]);
    expect(data.blockedBy).toEqual([]);
  });
});

describe("toPlainText", () => {
  it("removes markup, unsafe element contents, and entities", () => {
    const source = '<p>Hello <strong>world</strong> &amp; team</p><script>alert("no")</script>';

    expect(toPlainText(source)).toBe("Hello world & team");
  });

  it("collapses whitespace and handles a missing body", () => {
    expect(toPlainText("  first\n\n second   third  ")).toBe("first second third");
    expect(toPlainText(null)).toBe("");
  });

  it("keeps a numeric entity that is above the highest code point as its own text", () => {
    expect(toPlainText("before &#999999999; after")).toBe("before &#999999999; after");
  });

  it("keeps a hexadecimal numeric entity that is above the highest code point as its own text", () => {
    expect(toPlainText("before &#x110000; after")).toBe("before &#x110000; after");
  });

  it("keeps a numeric entity that names a surrogate as its own text", () => {
    expect(toPlainText("before &#xD800; after")).toBe("before &#xD800; after");
  });

  it("decodes a numeric entity that names a character", () => {
    expect(toPlainText("a &#128512; b")).toBe("a \u{1F600} b");
    expect(toPlainText("a &#x1F600; b")).toBe("a \u{1F600} b");
  });
});
