import { describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import {
  DUE_SOON_WINDOW_DAYS,
  getIssueTimelineFacts,
  getMilestoneFactsSummary,
  getOpenBlockers,
  getProjectFactsSummary,
  isDoneIssue,
  isOpenIssue,
  isOverdueIssue,
} from "./issueFacts";

/** Terminal state ids the caller configures: the completed state and a custom "Merged" state. */
const DONE_STATE_IDS = new Set<string>(["state-done", "state-merged"]);

function state(id: string, name: string, type: string, position = 1): LinearIssue["state"] {
  return { id, name, type, color: "#ccc", position } as LinearIssue["state"];
}

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-1",
    identifier: "TEST-1",
    title: "Test issue",
    url: "https://linear.app/test/issue-1",
    estimate: null,
    priority: 0,
    priorityLabel: "No priority",
    sortOrder: 0,
    startedAt: null,
    completedAt: null,
    dueDate: null,
    description: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: state("state-todo", "Todo", "unstarted"),
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    ...overrides,
  } as LinearIssue;
}

function relation(id: string, type: string, relatedIssueId: string) {
  return { id, type, relatedIssue: { id: relatedIssueId, identifier: "TEST-2" } };
}

describe("isOpenIssue", () => {
  it("counts an unstarted issue as open", () => {
    expect(isOpenIssue(issue({ state: state("state-todo", "Todo", "unstarted") }))).toBe(true);
  });

  it("counts a started issue as open", () => {
    expect(isOpenIssue(issue({ state: state("state-started", "In Progress", "started") }))).toBe(true);
  });

  it("does not count a completed issue as open", () => {
    expect(isOpenIssue(issue({ state: state("state-done", "Done", "completed") }))).toBe(false);
  });

  it("does not count a canceled issue as open", () => {
    expect(isOpenIssue(issue({ state: state("state-canceled", "Canceled", "canceled") }))).toBe(false);
  });
});

describe("isDoneIssue", () => {
  it("is false for an unstarted issue when no state is configured as done", () => {
    expect(isDoneIssue(issue({ state: state("state-todo", "Todo", "unstarted") }), new Set<string>())).toBe(false);
  });

  it("is true for a completed state", () => {
    expect(isDoneIssue(issue({ state: state("state-done", "Done", "completed") }), new Set<string>())).toBe(true);
  });

  it("is true for a custom state whose id is configured as done", () => {
    const merged = issue({ state: state("state-merged", "Merged", "started") });
    expect(isDoneIssue(merged, DONE_STATE_IDS)).toBe(true);
  });

  it("is false for a custom state whose id is not configured as done", () => {
    const merged = issue({ state: state("state-other", "Merged", "started") });
    expect(isDoneIssue(merged, DONE_STATE_IDS)).toBe(false);
  });

  it("never decides by state name", () => {
    const namedDone = issue({ state: state("state-unrelated", "Done", "started") });
    expect(isDoneIssue(namedDone, DONE_STATE_IDS)).toBe(false);
  });
});

describe("isOverdueIssue", () => {
  const today = "2026-03-01";

  it("is false without a due date", () => {
    expect(isOverdueIssue(issue({ dueDate: null }), today)).toBe(false);
  });

  it("is false when the due date is today", () => {
    expect(isOverdueIssue(issue({ dueDate: today }), today)).toBe(false);
  });

  it("is false when the due date is in the future", () => {
    expect(isOverdueIssue(issue({ dueDate: "2026-03-02" }), today)).toBe(false);
  });

  it("is true when an open issue is due before today", () => {
    expect(isOverdueIssue(issue({ dueDate: "2026-02-28" }), today)).toBe(true);
  });

  it("is false for a completed issue that is past its due date", () => {
    const done = issue({ dueDate: "2026-02-28", state: state("state-done", "Done", "completed") });
    expect(isOverdueIssue(done, today)).toBe(false);
  });

  it("is false for a canceled issue that is past its due date", () => {
    const canceled = issue({ dueDate: "2026-02-28", state: state("state-canceled", "Canceled", "canceled") });
    expect(isOverdueIssue(canceled, today)).toBe(false);
  });
});

describe("getIssueTimelineFacts", () => {
  it("returns a due point event for an open issue with a due date", () => {
    const facts = getIssueTimelineFacts(issue({ dueDate: "2026-03-10" }));
    expect(facts).toEqual([{ kind: "point", fact: "due", date: "2026-03-10", label: "Due" }]);
  });

  it("returns no due event for a closed issue", () => {
    const facts = getIssueTimelineFacts(
      issue({ dueDate: "2026-03-10", state: state("state-done", "Done", "completed") }),
    );
    expect(facts).toEqual([]);
  });

  it("keeps the entered-started and completed events for a closed issue", () => {
    const facts = getIssueTimelineFacts(
      issue({
        dueDate: "2026-03-10",
        startedAt: "2026-03-02T09:00:00.000Z",
        completedAt: "2026-03-08T17:00:00.000Z",
        state: state("state-done", "Done", "completed"),
      }),
    );
    expect(facts.map((e) => e.fact)).toEqual(["enteredStartedStatus", "statusHistory", "completed"]);
    expect(facts.some((e) => e.fact === "due")).toBe(false);
  });

  it("returns an entered-started-status event from startedAt", () => {
    const facts = getIssueTimelineFacts(issue({ startedAt: "2026-03-02T09:00:00.000Z" }));
    expect(facts).toEqual([
      { kind: "point", fact: "enteredStartedStatus", date: "2026-03-02", label: "Entered started status" },
    ]);
  });

  it("never claims that work started", () => {
    const facts = getIssueTimelineFacts(issue({ startedAt: "2026-03-02T09:00:00.000Z" }));
    const label = facts[0].label.toLowerCase();
    expect(label).not.toContain("work started");
    expect(label).not.toContain("started work");
  });

  it("returns a completed event from completedAt", () => {
    const facts = getIssueTimelineFacts(issue({ completedAt: "2026-03-08T17:00:00.000Z" }));
    expect(facts).toEqual([
      { kind: "point", fact: "completed", date: "2026-03-08", label: "Completed" },
    ]);
  });

  it("returns the events in a deterministic chronological order", () => {
    const facts = getIssueTimelineFacts(
      issue({
        dueDate: "2026-03-10",
        startedAt: "2026-03-02T09:00:00.000Z",
        completedAt: "2026-03-08T17:00:00.000Z",
      }),
    );
    expect(facts).toEqual([
      { kind: "point", fact: "enteredStartedStatus", date: "2026-03-02", label: "Entered started status" },
      { kind: "span", fact: "statusHistory", startDate: "2026-03-02", endDate: "2026-03-08", label: "In started status" },
      { kind: "point", fact: "completed", date: "2026-03-08", label: "Completed" },
      { kind: "point", fact: "due", date: "2026-03-10", label: "Due" },
    ]);
  });

  it("has no status-history span without a startedAt", () => {
    const facts = getIssueTimelineFacts(issue({ completedAt: "2026-03-08T17:00:00.000Z" }));
    expect(facts.filter((fact) => fact.kind === "span")).toEqual([]);
  });

  it("has no status-history span without a completedAt", () => {
    const facts = getIssueTimelineFacts(issue({ startedAt: "2026-03-02T09:00:00.000Z" }));
    expect(facts.filter((fact) => fact.kind === "span")).toEqual([]);
  });

  it("labels the status-history span exactly", () => {
    const facts = getIssueTimelineFacts(
      issue({ startedAt: "2026-03-02T09:00:00.000Z", completedAt: "2026-03-08T17:00:00.000Z" }),
    );
    const spans = facts.filter((fact) => fact.kind === "span");
    expect(spans).toHaveLength(1);
    expect(spans[0].label).toBe("In started status");
  });

  it("does not infer a start from a due date", () => {
    const facts = getIssueTimelineFacts(issue({ dueDate: "2026-03-10" }));
    expect(facts.filter((fact) => fact.fact === "enteredStartedStatus")).toEqual([]);
  });
});

describe("getOpenBlockers", () => {
  const blocked = issue({ id: "blocked", identifier: "TEST-3" });
  const blocker = issue({
    id: "blocker",
    identifier: "TEST-2",
    state: state("state-started", "In Progress", "started"),
    relations: { nodes: [relation("relation-1", "blocks", "blocked")] },
  });

  it("finds the blocker through the blocks node on the blocking issue", () => {
    expect(getOpenBlockers(blocked, [blocker, blocked])).toEqual([
      { blockerId: "blocker", blockerIdentifier: "TEST-2", relationId: "relation-1" },
    ]);
  });

  it("reports the relation id that removes the blocking relation", () => {
    const [blockerFact] = getOpenBlockers(blocked, [blocker, blocked]);
    expect(blockerFact.relationId).toBe("relation-1");
  });

  it("ignores a blocker that is not open", () => {
    const closedBlocker = {
      ...blocker,
      state: state("state-done", "Done", "completed"),
    };
    expect(getOpenBlockers(blocked, [closedBlocker, blocked])).toEqual([]);
  });

  it("ignores relations of other types", () => {
    const related = { ...blocker, relations: { nodes: [relation("relation-2", "related", "blocked")] } };
    expect(getOpenBlockers(blocked, [related, blocked])).toEqual([]);
  });

  it("returns nothing when no issue blocks the issue", () => {
    expect(getOpenBlockers(blocked, [blocker, blocked].filter((row) => row.id !== "blocker"))).toEqual([]);
  });
});

describe("getProjectFactsSummary", () => {
  const today = "2026-03-01";

  const overdue = issue({ id: "overdue", dueDate: "2026-02-20" });
  const dueSoon = issue({ id: "due-soon", dueDate: "2026-03-10" });
  const dueOnWindowEdge = issue({ id: "due-edge", dueDate: "2026-03-15" });
  const dueLater = issue({ id: "due-later", dueDate: "2026-04-01" });
  const noDate = issue({ id: "no-date", dueDate: null });
  const done = issue({ id: "done", dueDate: "2026-03-05", state: state("state-done", "Done", "completed") });
  const blocked = issue({
    id: "blocked",
    dueDate: "2026-06-01",
    state: state("state-todo", "Todo", "unstarted"),
    relations: { nodes: [] },
  });
  const blocker = issue({
    id: "blocker",
    identifier: "TEST-9",
    dueDate: "2026-05-01",
    state: state("state-started", "In Progress", "started"),
    relations: { nodes: [relation("relation-9", "blocks", "blocked")] },
  });

  const issues = [overdue, dueSoon, dueOnWindowEdge, dueLater, noDate, done, blocked, blocker];

  it("counts open issues", () => {
    expect(getProjectFactsSummary(issues, DONE_STATE_IDS, today).open).toBe(7);
  });

  it("counts completed issues", () => {
    expect(getProjectFactsSummary(issues, DONE_STATE_IDS, today).completed).toBe(1);
  });

  it("counts overdue issues", () => {
    expect(getProjectFactsSummary(issues, DONE_STATE_IDS, today).overdue).toBe(1);
  });

  it("does not count a done-by-id issue as overdue", () => {
    // "Merged" is a started-type state, so the issue stays open by state type
    // while it is done by its configured state id.
    const merged = issue({
      id: "merged",
      dueDate: "2026-02-20",
      state: state("state-merged", "Merged", "started"),
    });
    const summary = getProjectFactsSummary([merged], DONE_STATE_IDS, today);
    expect(summary.completed).toBe(1);
    expect(summary.overdue).toBe(0);
    expect(summary.open).toBe(1);
    expect(isOpenIssue(merged)).toBe(true);
    expect(isDoneIssue(merged, DONE_STATE_IDS)).toBe(true);
  });

  it("counts issues due within the next 14 calendar days", () => {
    const summary = getProjectFactsSummary(issues, DONE_STATE_IDS, today);
    expect(summary.dueSoon).toBe(2);
    expect(DUE_SOON_WINDOW_DAYS).toBe(14);
  });

  it("leaves out issues due after the window", () => {
    const summary = getProjectFactsSummary([dueLater], DONE_STATE_IDS, today);
    expect(summary.dueSoon).toBe(0);
  });

  it("counts unstarted issues with an open blocker", () => {
    expect(getProjectFactsSummary(issues, DONE_STATE_IDS, today).blocked).toBe(1);
  });

  it("counts a backlog issue with an open blocker", () => {
    const backlog = issue({ id: "backlog", dueDate: "2026-06-01", state: state("state-ideas", "Ideas", "backlog") });
    const backlogBlocker = {
      ...blocker,
      relations: { nodes: [relation("relation-10", "blocks", "backlog")] },
    };
    const summary = getProjectFactsSummary([backlog, backlogBlocker], DONE_STATE_IDS, today);
    expect(summary.blocked).toBe(1);
  });

  it("does not count a blocked issue that is done", () => {
    const backlog = issue({ id: "backlog", dueDate: "2026-06-01", state: state("state-ideas", "Ideas", "backlog") });
    const backlogBlocker = {
      ...blocker,
      relations: { nodes: [relation("relation-10", "blocks", "backlog")] },
    };
    const summary = getProjectFactsSummary([backlog, backlogBlocker], new Set(["state-ideas"]), today);
    expect(summary.blocked).toBe(0);
  });

  it("counts open issues without a due date", () => {
    expect(getProjectFactsSummary(issues, DONE_STATE_IDS, today).noDueDate).toBe(1);
  });

  it("reports no counts for an empty project", () => {
    expect(getProjectFactsSummary([], DONE_STATE_IDS, today)).toEqual({
      open: 0,
      completed: 0,
      overdue: 0,
      dueSoon: 0,
      blocked: 0,
      noDueDate: 0,
    });
  });
});

describe("getMilestoneFactsSummary", () => {
  const today = "2026-03-01";

  const issues = [
    issue({ id: "m1", dueDate: "2026-03-10" }),
    issue({ id: "m2", dueDate: "2026-02-01", state: state("state-started", "In Progress", "started") }),
    issue({ id: "m3", dueDate: null, state: state("state-done", "Done", "completed") }),
  ];

  it("counts the milestone's issues", () => {
    expect(getMilestoneFactsSummary(issues, DONE_STATE_IDS, today).total).toBe(3);
  });

  it("counts open and completed issues", () => {
    const summary = getMilestoneFactsSummary(issues, DONE_STATE_IDS, today);
    expect(summary.open).toBe(2);
    expect(summary.completed).toBe(1);
  });

  it("counts overdue issues", () => {
    expect(getMilestoneFactsSummary(issues, DONE_STATE_IDS, today).overdue).toBe(1);
  });

  it("reports the earliest and latest due date", () => {
    const summary = getMilestoneFactsSummary(issues, DONE_STATE_IDS, today);
    expect(summary.earliestDueDate).toBe("2026-02-01");
    expect(summary.latestDueDate).toBe("2026-03-10");
  });

  it("reports no due dates for a milestone without any", () => {
    const summary = getMilestoneFactsSummary([issues[2]], DONE_STATE_IDS, today);
    expect(summary.earliestDueDate).toBeNull();
    expect(summary.latestDueDate).toBeNull();
  });
});
