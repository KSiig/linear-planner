// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import { DAY_WIDTH, POINT_MARKER_SIZE } from "./deadlineTimelineLayout";
import { DeadlineTimeline } from "./DeadlineTimeline";

afterEach(() => {
  cleanup();
});

function issue(
  overrides: Partial<LinearIssue> & Pick<LinearIssue, "id" | "identifier">,
): LinearIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/issue/${overrides.identifier}`,
    estimate: null,
    priority: 0,
    priorityLabel: "No priority",
    sortOrder: 0,
    startedAt: null,
    completedAt: null,
    dueDate: null,
    description: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    ...overrides,
  };
}

function milestone(id: string, name: string, sortOrder: number) {
  return { id, name, sortOrder };
}

describe("DeadlineTimeline", () => {
  it("puts a due marker on the exact Linear due date", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            title: "Fix login",
            dueDate: "2026-04-08",
            projectMilestone: milestone("m1", "M1", 1),
          }),
        ]}
      />,
    );

    const due = screen.getByRole("listitem", { name: "Due 2026-04-08 — SII-1 Fix login (M1)" });
    expect(due.getAttribute("data-fact")).toBe("due");
    expect(due.getAttribute("data-date")).toBe("2026-04-08");
  });

  it("places a due marker in the column of its own day", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({ id: "a", identifier: "SII-1", dueDate: "2026-04-08" }),
          issue({ id: "b", identifier: "SII-2", dueDate: "2026-04-10" }),
        ]}
      />,
    );

    const first = screen.getByRole("listitem", { name: /^Due 2026-04-08/ });
    const second = screen.getByRole("listitem", { name: /^Due 2026-04-10/ });
    expect(first.style.left).toBe(`${(DAY_WIDTH - POINT_MARKER_SIZE) / 2}px`);
    expect(second.style.left).toBe(`${2 * DAY_WIDTH + (DAY_WIDTH - POINT_MARKER_SIZE) / 2}px`);
  });

  it("labels the started and completed events as workflow events", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            title: "Fix login",
            startedAt: "2026-03-02T09:15:00.000Z",
            completedAt: "2026-03-20T17:45:00.000Z",
            projectMilestone: milestone("m1", "M1", 1),
          }),
        ]}
      />,
    );

    const started = screen.getByRole("listitem", {
      name: "Entered started status 2026-03-02 — SII-1 Fix login (M1)",
    });
    const completed = screen.getByRole("listitem", {
      name: "Completed 2026-03-20 — SII-1 Fix login (M1)",
    });
    expect(started.getAttribute("data-date")).toBe("2026-03-02");
    expect(completed.getAttribute("data-date")).toBe("2026-03-20");
  });

  it("gives every marker an accessible name", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            title: "Fix login",
            dueDate: "2026-04-08",
            startedAt: "2026-03-02T09:15:00.000Z",
            completedAt: "2026-03-20T17:45:00.000Z",
          }),
        ]}
      />,
    );

    const markers = screen.getAllByRole("listitem");
    expect(markers.length).toBe(4);
    for (const marker of markers) {
      expect(marker.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("keeps a point marker the same size on every date", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({ id: "a", identifier: "SII-1", dueDate: "2026-04-08" }),
          issue({ id: "b", identifier: "SII-2", dueDate: "2026-05-30" }),
        ]}
      />,
    );

    for (const marker of screen.getAllByRole("listitem")) {
      expect(marker.style.width).toBe(`${POINT_MARKER_SIZE}px`);
      expect(marker.style.height).toBe(`${POINT_MARKER_SIZE}px`);
    }
  });

  it("draws the started status span over both of its days", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            title: "Fix login",
            startedAt: "2026-03-02T09:15:00.000Z",
            completedAt: "2026-03-20T17:45:00.000Z",
          }),
        ]}
      />,
    );

    const span = screen.getByRole("listitem", {
      name: "In started status 2026-03-02 to 2026-03-20 — SII-1 Fix login",
    });
    expect(span.getAttribute("data-fact")).toBe("statusHistory");
    expect(span.style.height).toBe("4px");
    expect(span.style.width).toBe(`${19 * DAY_WIDTH}px`);
  });

  it("leaves out the started status span when one of the two timestamps is missing", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({ id: "a", identifier: "SII-1", startedAt: "2026-03-02T09:15:00.000Z" }),
        ]}
      />,
    );

    expect(screen.queryByRole("listitem", { name: /^In started status/ })).toBeNull();
  });

  it("gives a closed issue its completed event but no due marker", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            dueDate: "2026-04-08",
            completedAt: "2026-03-20T17:45:00.000Z",
            state: { id: "state-done", name: "Done", type: "completed", color: "#888888", position: 2 },
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("listitem", { name: /^Due/ })).toBeNull();
    expect(screen.getByRole("listitem", { name: /^Completed 2026-03-20/ })).toBeTruthy();
  });

  it("groups the issues by milestone", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            dueDate: "2026-04-08",
            projectMilestone: milestone("m1", "M1", 1),
          }),
          issue({
            id: "b",
            identifier: "SII-2",
            dueDate: "2026-04-09",
            projectMilestone: milestone("m2", "M2", 2),
          }),
        ]}
      />,
    );

    const first = screen.getByRole("region", { name: "Milestone M1" });
    const second = screen.getByRole("region", { name: "Milestone M2" });
    expect(first.getAttribute("aria-label")).toBe("Milestone M1");
    expect(second.getAttribute("aria-label")).toBe("Milestone M2");
  });

  it("stacks markers that share a date into separate lanes", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-1",
            dueDate: "2026-04-08",
            projectMilestone: milestone("m1", "M1", 1),
          }),
          issue({
            id: "b",
            identifier: "SII-2",
            dueDate: "2026-04-08",
            projectMilestone: milestone("m1", "M1", 1),
          }),
        ]}
      />,
    );

    const lanes = screen
      .getAllByRole("listitem")
      .map((marker) => marker.getAttribute("data-lane"))
      .sort();
    expect(lanes).toEqual(["0", "1"]);
  });

  it("lists the open issues without a due date", () => {
    render(
      <DeadlineTimeline
        issues={[
          issue({
            id: "a",
            identifier: "SII-9",
            title: "No deadline",
            projectMilestone: milestone("m1", "M1", 1),
          }),
          issue({
            id: "b",
            identifier: "SII-10",
            title: "Closed issue",
            state: { id: "state-done", name: "Done", type: "completed", color: "#888888", position: 2 },
          }),
          issue({ id: "c", identifier: "SII-11", dueDate: "2026-04-08" }),
        ]}
      />,
    );

    const undated = screen.getByRole("region", { name: "Open issues without a due date" });
    expect(undated.textContent).toContain("SII-9");
    expect(undated.textContent).not.toContain("SII-10");
    expect(undated.textContent).not.toContain("SII-11");
  });

  it("names every issue of the undated list", () => {
    render(
      <DeadlineTimeline
        issues={[issue({ id: "a", identifier: "SII-9", title: "No deadline" })]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "SII-9 No deadline — no due date" }),
    ).toBeTruthy();
  });

  it("renders nothing when no issue is given", () => {
    const { container } = render(<DeadlineTimeline issues={[]} />);
    expect(container.textContent).toBe("");
  });
});
