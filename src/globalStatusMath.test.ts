// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalStatus } from "./GlobalStatus";
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

/** A blocker relation: the issue holds a `blocks` node pointing at the blocked issue. */
function blocks(blockerId: string, blockedId: string): LinearIssue["relations"] {
  return { nodes: [{ id: `rel-${blockerId}-${blockedId}`, type: "blocks", relatedIssue: { id: blockedId, identifier: `TEST-${blockedId}` } }] };
}

const ISSUES: LinearIssue[] = [
  issue({ id: "todo", state: state("state-todo", "Todo", "unstarted"), dueDate: "2026-03-05" }),
  issue({ id: "running", state: state("state-started", "In Progress", "started"), dueDate: "2026-02-20" }),
  issue({ id: "undated", state: state("state-todo", "Todo", "unstarted") }),
  issue({ id: "blocked", state: state("state-todo", "Todo", "unstarted") }),
  issue({ id: "blocker", state: state("state-started", "In Progress", "started"), dueDate: "2026-03-20", relations: blocks("blocker", "blocked") }),
  issue({ id: "done", state: state("state-done", "Done", "completed") }),
];

/** The number rendered under a count label. */
function countUnder(label: string): string {
  const heading = screen.getByText(label);
  const spans = heading.parentElement?.querySelectorAll("span") ?? [];
  return spans[1]?.textContent ?? "";
}

/** Force the phone layout: `useNarrowLayout` reads `window.matchMedia`. */
function useNarrowLayout(narrow: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: narrow,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function renderStatus(props: { issues?: readonly LinearIssue[]; doneStateIds?: ReadonlySet<string>; today?: string } = {}) {
  return render(createElement(GlobalStatus, { issues: ISSUES, doneStateIds: DONE_STATE_IDS, today: TODAY, ...props }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GlobalStatus counts", () => {
  it("shows the six factual counts of the project's issues", () => {
    renderStatus();

    expect(countUnder("Open")).toBe("5");
    expect(countUnder("Completed")).toBe("1");
    expect(countUnder("Overdue")).toBe("1");
    expect(countUnder("Due in 14 days")).toBe("1");
    expect(countUnder("Blocked")).toBe("1");
    expect(countUnder("No due date")).toBe("2");
  });

  it("counts a configured terminal state as completed", () => {
    const merged = issue({ id: "merged", state: state("state-merged", "Merged", "started") });

    const configured = renderStatus({ issues: [merged], doneStateIds: new Set<string>(["state-merged"]) });
    expect(countUnder("Completed")).toBe("1");
    configured.unmount();

    // The state name alone never decides: the same issue without its id configured stays open.
    renderStatus({ issues: [merged], doneStateIds: DONE_STATE_IDS });
    expect(countUnder("Completed")).toBe("0");
  });

  it("counts the next 14 calendar days, today included", () => {
    const onTheEdge = issue({ id: "edge", dueDate: "2026-03-15" });
    const beyond = issue({ id: "beyond", dueDate: "2026-03-16" });
    const dueToday = issue({ id: "today", dueDate: TODAY });

    renderStatus({ issues: [onTheEdge, beyond, dueToday] });
    expect(countUnder("Due in 14 days")).toBe("2");
  });

  it("counts only unstarted issues with an open blocker as blocked", () => {
    const blocker = issue({ id: "blocker", state: state("state-started", "In Progress", "started"), relations: blocks("blocker", "todo") });
    const todo = issue({ id: "todo", state: state("state-todo", "Todo", "unstarted") });
    const started = issue({ id: "started", state: state("state-started", "In Progress", "started"), relations: blocks("started", "todo") });

    renderStatus({ issues: [blocker, todo, started] });
    expect(countUnder("Blocked")).toBe("1");
  });

  it("shows no working days, estimate, worker count or schedule verdict", () => {
    const { container } = renderStatus();
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/working days/i);
    expect(text).not.toMatch(/ahead|behind|on time/i);
    expect(text).not.toMatch(/estimate/i);
    expect(text).not.toMatch(/worker/i);
    expect(text).not.toMatch(/remaining|started/i);
  });
});

describe("GlobalStatus layouts", () => {
  it("lays the counts out side by side on a wide layout", () => {
    useNarrowLayout(false);
    renderStatus();

    // Every count is on screen without any interaction.
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("No due date")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the counts behind a toggle on a narrow layout and shows them all when expanded", () => {
    useNarrowLayout(true);
    renderStatus();

    const toggle = screen.getByRole("button");
    expect(toggle.textContent).toContain("5 open");
    expect(toggle.textContent).toContain("1 overdue");
    expect(screen.queryByText("Open")).toBeNull();

    fireEvent.click(toggle);

    expect(countUnder("Open")).toBe("5");
    expect(countUnder("Completed")).toBe("1");
    expect(countUnder("Overdue")).toBe("1");
    expect(countUnder("Due in 14 days")).toBe("1");
    expect(countUnder("Blocked")).toBe("1");
    expect(countUnder("No due date")).toBe("2");
  });
});
