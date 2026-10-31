import { describe, it, expect } from "vitest";
import {
  PRIORITY_CHOICES,
  applyQuickLookAction,
  applyQuickLookActionToIssue,
  priorityLabel,
  toAssigneeChoices,
  toIssueUpdateFields,
} from "./issueQuickLookActions";
import { toIssueQuickLookData } from "./issueQuickLookModel";
import type { LinearIssue, LinearTeamMember } from "./linear";

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-1",
    identifier: "SII-182",
    title: "Add the quick actions",
    url: "https://linear.app/siig/issue/SII-182",
    priority: 2,
    priorityLabel: "High",
    sortOrder: 100,
    startedAt: null,
    completedAt: null,
    dueDate: "2026-11-01",
    description: null,
    updatedAt: "2026-10-29T12:00:00.000Z",
    createdAt: "2026-10-01T08:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
    team: { id: "team-1" },
    assignee: { id: "user-1", name: "Kasper", avatarUrl: null },
    projectMilestone: null,
    project: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

function member(overrides: Partial<LinearTeamMember> = {}): LinearTeamMember {
  return {
    id: "user-1",
    name: "Kasper",
    displayName: "Kasper",
    avatarUrl: null,
    active: true,
    ...overrides,
  };
}

describe("PRIORITY_CHOICES", () => {
  it("offers the five priority values Linear knows", () => {
    expect(PRIORITY_CHOICES.map((choice) => choice.value)).toEqual([0, 1, 2, 3, 4]);
    expect(PRIORITY_CHOICES.map((choice) => choice.label)).toEqual([
      "None",
      "Urgent",
      "High",
      "Medium",
      "Low",
    ]);
  });

  it("names a priority number", () => {
    expect(priorityLabel(1)).toBe("Urgent");
    expect(priorityLabel(0)).toBe("None");
  });
});

describe("toIssueUpdateFields", () => {
  it("sends the priority as the number Linear expects", () => {
    expect(toIssueUpdateFields({ kind: "priority", priority: 2 })).toEqual({ priority: 2 });
  });

  it("sends the id of the chosen assignee", () => {
    expect(toIssueUpdateFields({
      kind: "assignee",
      assignee: { id: "user-2", name: "Robin", avatarUrl: null },
    })).toEqual({ assigneeId: "user-2" });
  });

  it("clears the assignee with null, not with an empty string", () => {
    expect(toIssueUpdateFields({ kind: "assignee", assignee: null })).toEqual({ assigneeId: null });
  });

  it("sends the due date and clears it with null", () => {
    expect(toIssueUpdateFields({ kind: "dueDate", dueDate: "2026-12-01" })).toEqual({ dueDate: "2026-12-01" });
    expect(toIssueUpdateFields({ kind: "dueDate", dueDate: null })).toEqual({ dueDate: null });
  });

  it("mentions only the field the action changes", () => {
    expect(Object.keys(toIssueUpdateFields({ kind: "priority", priority: 1 }))).toEqual(["priority"]);
    expect(Object.keys(toIssueUpdateFields({ kind: "dueDate", dueDate: null }))).toEqual(["dueDate"]);
  });
});

describe("applyQuickLookAction", () => {
  it("sets the priority and its label", () => {
    const next = applyQuickLookAction(toIssueQuickLookData(issue()), { kind: "priority", priority: 1 });

    expect(next.priority).toBe(1);
    expect(next.priorityLabel).toBe("Urgent");
  });

  it("sets and clears the assignee", () => {
    const data = toIssueQuickLookData(issue());

    const assigned = applyQuickLookAction(data, {
      kind: "assignee",
      assignee: { id: "user-2", name: "Robin", avatarUrl: null },
    });
    expect(assigned.assignee).toEqual({ id: "user-2", name: "Robin", avatarUrl: null });

    const cleared = applyQuickLookAction(data, { kind: "assignee", assignee: null });
    expect(cleared.assignee).toBeNull();
  });

  it("sets and clears the due date", () => {
    const data = toIssueQuickLookData(issue());

    expect(applyQuickLookAction(data, { kind: "dueDate", dueDate: "2026-12-24" }).dueDate).toBe("2026-12-24");
    expect(applyQuickLookAction(data, { kind: "dueDate", dueDate: null }).dueDate).toBeNull();
  });

  it("does not invent a completion time or an update time", () => {
    const data = toIssueQuickLookData(issue({ completedAt: null, updatedAt: "2026-10-29T12:00:00.000Z" }));

    const next = applyQuickLookAction(data, { kind: "priority", priority: 1 });

    expect(next.completedAt).toBeNull();
    expect(next.updatedAt).toBe("2026-10-29T12:00:00.000Z");
  });

  it("does not change the data it is given", () => {
    const data = toIssueQuickLookData(issue());

    applyQuickLookAction(data, { kind: "priority", priority: 4 });

    expect(data.priority).toBe(2);
    expect(data.priorityLabel).toBe("High");
  });
});

describe("applyQuickLookActionToIssue", () => {
  it("sets the priority of the stored issue", () => {
    const next = applyQuickLookActionToIssue(issue(), { kind: "priority", priority: 0 });

    expect(next.priority).toBe(0);
    expect(next.priorityLabel).toBe("None");
  });

  it("sets and clears the assignee of the stored issue", () => {
    const assigned = applyQuickLookActionToIssue(issue(), {
      kind: "assignee",
      assignee: { id: "user-2", name: "Robin", avatarUrl: "https://linear.app/avatar.png" },
    });
    expect(assigned.assignee).toEqual({
      id: "user-2",
      name: "Robin",
      avatarUrl: "https://linear.app/avatar.png",
    });

    const cleared = applyQuickLookActionToIssue(issue(), { kind: "assignee", assignee: null });
    expect(cleared.assignee).toBeNull();
  });

  it("sets and clears the due date of the stored issue", () => {
    expect(applyQuickLookActionToIssue(issue(), { kind: "dueDate", dueDate: "2026-12-24" }).dueDate)
      .toBe("2026-12-24");
    expect(applyQuickLookActionToIssue(issue(), { kind: "dueDate", dueDate: null }).dueDate).toBeNull();
  });

  it("does not invent a completion time or an update time", () => {
    const next = applyQuickLookActionToIssue(
      issue({ completedAt: null, updatedAt: "2026-10-29T12:00:00.000Z" }),
      { kind: "dueDate", dueDate: null },
    );

    expect(next.completedAt).toBeNull();
    expect(next.updatedAt).toBe("2026-10-29T12:00:00.000Z");
  });

  it("does not change the issue it is given", () => {
    const stored = issue();

    applyQuickLookActionToIssue(stored, { kind: "priority", priority: 4 });

    expect(stored.priority).toBe(2);
    expect(stored.dueDate).toBe("2026-11-01");
  });
});

describe("toAssigneeChoices", () => {
  it("offers Unassigned and the members of the team", () => {
    const choices = toAssigneeChoices(
      [member(), member({ id: "user-2", name: "Robin", displayName: "Robin" })],
      null,
    );

    expect(choices.map((choice) => choice.label)).toEqual(["Unassigned", "Kasper", "Robin"]);
    expect(choices[0].id).toBeNull();
  });

  it("offers nobody who is not a member of the team", () => {
    const choices = toAssigneeChoices([member({ id: "user-2", name: "Robin" })], null);

    expect(choices.map((choice) => choice.id)).toEqual([null, "user-2"]);
  });

  it("keeps the current assignee in the list when they left the team", () => {
    const choices = toAssigneeChoices(
      [member({ id: "user-2", name: "Robin" })],
      { id: "user-1", name: "Kasper", avatarUrl: null },
    );

    expect(choices.map((choice) => choice.id)).toEqual([null, "user-2", "user-1"]);
  });

  it("lists a member only once", () => {
    const choices = toAssigneeChoices([member(), member()], null);

    expect(choices.map((choice) => choice.id)).toEqual([null, "user-1"]);
  });

  it("falls back to the display name when a member has no name", () => {
    const choices = toAssigneeChoices([member({ name: "", displayName: "Kasper S." })], null);

    expect(choices[1].label).toBe("Kasper S.");
  });
});
