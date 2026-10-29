// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MilestoneBandLabel, MilestoneHeader } from "./MilestoneHeader";
import type { LinearIssue } from "./linear";

const TODAY = "2026-03-01";

/** The terminal state ids the project configures: the completed state and a custom "Merged" state. */
const DONE_STATE_IDS = new Set<string>(["state-done"]);

function state(id: string, name: string, type: string, position = 1): LinearIssue["state"] {
  return { id, name, type, color: "#ccc", position };
}

function issue(overrides: Partial<LinearIssue> & { id: string }): LinearIssue {
  return {
    identifier: `TEST-${overrides.id}`,
    title: "Test issue",
    url: "https://linear.app/test/issue",
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

const ISSUES: LinearIssue[] = [
  issue({ id: "todo", state: state("state-todo", "Todo", "unstarted"), dueDate: "2026-03-05" }),
  issue({ id: "running", state: state("state-started", "In Progress", "started"), dueDate: "2026-02-20" }),
  issue({ id: "undated", state: state("state-todo", "Todo", "unstarted") }),
  issue({ id: "done", state: state("state-done", "Done", "completed") }),
];

function renderHeader(props: { issues?: readonly LinearIssue[]; doneStateIds?: ReadonlySet<string>; today?: string } = {}) {
  return render(createElement(MilestoneHeader, { name: "Deadline timeline", issues: ISSUES, doneStateIds: DONE_STATE_IDS, today: TODAY, ...props }));
}

function renderBand(props: { issues?: readonly LinearIssue[]; doneStateIds?: ReadonlySet<string>; today?: string } = {}) {
  return render(createElement(MilestoneBandLabel, { name: "Deadline timeline", issues: ISSUES, doneStateIds: DONE_STATE_IDS, today: TODAY, ...props }));
}

afterEach(cleanup);

describe("MilestoneHeader", () => {
  it("shows the total, open, completed and overdue counts", () => {
    const { container } = renderHeader();
    const text = container.textContent ?? "";

    expect(text).toContain("4 issues");
    expect(text).toContain("3 open");
    expect(text).toContain("1 completed");
    expect(text).toContain("1 overdue");
  });

  it("shows the earliest and the latest due date of the milestone", () => {
    const { container } = renderHeader();
    const text = container.textContent ?? "";

    expect(text).toContain("20 Feb 2026");
    expect(text).toContain("5 Mar 2026");
  });

  it("shows no date range when no issue in the milestone has a due date", () => {
    const undated = ISSUES.filter((issue) => issue.dueDate === null);
    const { container } = renderHeader({ issues: undated });
    const text = container.textContent ?? "";

    expect(text).toContain("2 issues");
    expect(text).not.toMatch(/\d{4}/);
  });

  it("counts a configured terminal state as completed", () => {
    const merged = issue({ id: "merged", state: state("state-merged", "Merged", "started") });

    const configured = renderHeader({ issues: [merged], doneStateIds: new Set<string>(["state-merged"]) });
    expect(configured.container.textContent).toContain("1 completed");
    configured.unmount();

    // The state name alone never decides: the same issue without its id configured is not completed.
    const unconfigured = renderHeader({ issues: [merged], doneStateIds: DONE_STATE_IDS });
    expect(unconfigured.container.textContent).toContain("0 completed");
  });

  it("shows no working days, estimate, worker count or schedule verdict", () => {
    const { container } = renderHeader();
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/working days/i);
    expect(text).not.toMatch(/ahead|behind|on time/i);
    expect(text).not.toMatch(/estimate/i);
    expect(text).not.toMatch(/worker/i);
    expect(text).not.toMatch(/remaining|started/i);
  });
});

describe("MilestoneBandLabel", () => {
  it("shows the same counts as the wide header", () => {
    const { container } = renderBand();
    const text = container.textContent ?? "";

    expect(text).toContain("4 issues");
    expect(text).toContain("3 open");
    expect(text).toContain("1 completed");
    expect(text).toContain("1 overdue");
  });

  it("shows the due-date window of the milestone", () => {
    const { container } = renderBand();
    const text = container.textContent ?? "";

    expect(text).toContain("20 Feb 2026");
    expect(text).toContain("5 Mar 2026");
  });

  it("shows no date range when no issue in the milestone has a due date", () => {
    const undated = ISSUES.filter((issue) => issue.dueDate === null);
    const { container } = renderBand({ issues: undated });

    expect(container.textContent).not.toMatch(/\d{4}/);
  });
});
