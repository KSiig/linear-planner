import { describe, expect, it } from "vitest";
import type { LinearIssue } from "./linear";
import {
  buildDeadlineTimelineLayout,
  type DeadlineTimelineLayout,
  type DeadlineTimelineMarker,
} from "./deadlineTimelineLayout";

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

function markerOf(
  layout: DeadlineTimelineLayout,
  fact: DeadlineTimelineMarker["fact"],
  identifier: string,
): DeadlineTimelineMarker | undefined {
  return layout.markers.find((marker) => marker.fact === fact && marker.identifier === identifier);
}

describe("buildDeadlineTimelineLayout", () => {
  it("puts a due marker on the exact Linear due date", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1", dueDate: "2026-04-08" }),
    ]);

    const due = markerOf(layout, "due", "SII-1");
    expect(due?.startDate).toBe("2026-04-08");
    expect(due?.endDate).toBe("2026-04-08");
    expect(due?.startDay).toBe(0);
    expect(due?.endDay).toBe(1);
    expect(layout.axis.startDate).toBe("2026-04-08");
    expect(layout.axis.dayCount).toBe(1);
  });

  it("gives a due marker one day and never a duration", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1", dueDate: "2026-04-08" }),
    ]);

    const due = markerOf(layout, "due", "SII-1");
    expect(due).toBeDefined();
    expect(due!.endDay - due!.startDay).toBe(1);
  });

  it("puts a due marker on the day it falls in the axis", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1", dueDate: "2026-04-08" }),
      issue({ id: "b", identifier: "SII-2", dueDate: "2026-04-10" }),
    ]);

    expect(markerOf(layout, "due", "SII-1")?.startDay).toBe(0);
    expect(markerOf(layout, "due", "SII-2")?.startDay).toBe(2);
    expect(layout.axis.days).toEqual(["2026-04-08", "2026-04-09", "2026-04-10"]);
  });

  it("puts the workflow events on the day of the API timestamps", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({
        id: "a",
        identifier: "SII-1",
        startedAt: "2026-03-02T09:15:00.000Z",
        completedAt: "2026-03-20T17:45:00.000Z",
        state: { id: "state-done", name: "Done", type: "completed", color: "#888888", position: 2 },
      }),
    ]);

    expect(markerOf(layout, "enteredStartedStatus", "SII-1")?.startDate).toBe("2026-03-02");
    expect(markerOf(layout, "completed", "SII-1")?.startDate).toBe("2026-03-20");
  });

  it("spans the started status over both days when both timestamps exist", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({
        id: "a",
        identifier: "SII-1",
        startedAt: "2026-03-02T09:15:00.000Z",
        completedAt: "2026-03-20T17:45:00.000Z",
      }),
    ]);

    const span = markerOf(layout, "statusHistory", "SII-1");
    expect(span?.kind).toBe("span");
    expect(span?.startDate).toBe("2026-03-02");
    expect(span?.endDate).toBe("2026-03-20");
    expect(span!.endDay - span!.startDay).toBe(19);
  });

  it("leaves out the started status span when one of the two timestamps is missing", () => {
    const startedOnly = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1", startedAt: "2026-03-02T09:15:00.000Z" }),
    ]);
    const completedOnly = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1", completedAt: "2026-03-20T17:45:00.000Z" }),
    ]);

    expect(markerOf(startedOnly, "statusHistory", "SII-1")).toBeUndefined();
    expect(markerOf(completedOnly, "statusHistory", "SII-1")).toBeUndefined();
  });

  it("leaves out a due marker for an issue that is no longer open", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({
        id: "a",
        identifier: "SII-1",
        dueDate: "2026-04-08",
        state: { id: "state-done", name: "Done", type: "completed", color: "#888888", position: 2 },
      }),
    ]);

    expect(markerOf(layout, "due", "SII-1")).toBeUndefined();
  });

  it("marks nothing but the due date when the issue reports no other date", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1", dueDate: "2026-04-08" }),
    ]);

    expect(layout.markers).toHaveLength(1);
    expect(layout.markers[0].fact).toBe("due");
  });

  it("stacks markers that share a date into separate lanes", () => {
    const layout = buildDeadlineTimelineLayout([
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
      issue({
        id: "c",
        identifier: "SII-3",
        dueDate: "2026-04-08",
        projectMilestone: milestone("m1", "M1", 1),
      }),
    ]);

    const lanes = layout.groups[0].markers.map((marker) => marker.lane);
    expect(lanes).toEqual([0, 1, 2]);
    expect(layout.groups[0].markers.map((marker) => marker.identifier)).toEqual([
      "SII-1",
      "SII-2",
      "SII-3",
    ]);
  });

  it("gives the same lanes whatever order the issues come in", () => {
    const first = issue({
      id: "a",
      identifier: "SII-1",
      dueDate: "2026-04-08",
      projectMilestone: milestone("m1", "M1", 1),
    });
    const second = issue({
      id: "b",
      identifier: "SII-2",
      dueDate: "2026-04-08",
      projectMilestone: milestone("m1", "M1", 1),
    });
    const third = issue({
      id: "c",
      identifier: "SII-3",
      dueDate: "2026-04-08",
      projectMilestone: milestone("m1", "M1", 1),
    });

    const straight = buildDeadlineTimelineLayout([first, second, third]);
    const shuffled = buildDeadlineTimelineLayout([third, first, second]);

    expect(shuffled.groups.map((group) => group.id)).toEqual(
      straight.groups.map((group) => group.id),
    );
    expect(shuffled.markers.map((marker) => [marker.key, marker.lane, marker.startDay])).toEqual(
      straight.markers.map((marker) => [marker.key, marker.lane, marker.startDay]),
    );
  });

  it("puts markers on different days in the same lane", () => {
    const layout = buildDeadlineTimelineLayout([
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
        projectMilestone: milestone("m1", "M1", 1),
      }),
    ]);

    expect(layout.groups[0].markers.map((marker) => marker.lane)).toEqual([0, 0]);
  });

  it("keeps the lanes of every milestone on their own", () => {
    const layout = buildDeadlineTimelineLayout([
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
        projectMilestone: milestone("m2", "M2", 2),
      }),
    ]);

    expect(layout.groups.map((group) => group.id)).toEqual(["m1", "m2"]);
    expect(layout.groups.map((group) => group.markers.map((marker) => marker.lane))).toEqual([[0], [0]]);
  });

  it("orders the groups by milestone order and puts the issues without a milestone last", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({
        id: "a",
        identifier: "SII-1",
        dueDate: "2026-04-08",
        projectMilestone: milestone("m2", "M2", 2),
      }),
      issue({
        id: "b",
        identifier: "SII-2",
        dueDate: "2026-04-08",
        projectMilestone: milestone("m1", "M1", 1),
      }),
      issue({ id: "c", identifier: "SII-3", dueDate: "2026-04-08" }),
    ]);

    expect(layout.groups.map((group) => group.id)).toEqual(["m1", "m2", null]);
    expect(layout.groups[2].name).toBe("No milestone");
  });

  it("does not move a date because of the milestone the issue sits in", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({
        id: "a",
        identifier: "SII-1",
        dueDate: "2026-04-08",
        projectMilestone: milestone("m2", "M2", 2),
      }),
      issue({
        id: "b",
        identifier: "SII-2",
        dueDate: "2026-04-08",
        projectMilestone: milestone("m1", "M1", 1),
      }),
    ]);

    expect(markerOf(layout, "due", "SII-1")?.startDate).toBe("2026-04-08");
    expect(markerOf(layout, "due", "SII-1")?.startDay).toBe(0);
    expect(markerOf(layout, "due", "SII-2")?.startDay).toBe(0);
  });

  it("lists only the open issues without a due date", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({ id: "a", identifier: "SII-1" }),
      issue({
        id: "b",
        identifier: "SII-2",
        state: { id: "state-done", name: "Done", type: "completed", color: "#888888", position: 2 },
      }),
      issue({ id: "c", identifier: "SII-3", dueDate: "2026-04-08" }),
    ]);

    expect(layout.undated.map((entry) => entry.issue.identifier)).toEqual(["SII-1"]);
  });

  it("counts every calendar day between the first and the last fact", () => {
    const layout = buildDeadlineTimelineLayout([
      issue({
        id: "a",
        identifier: "SII-1",
        startedAt: "2026-04-08T09:00:00.000Z",
        completedAt: "2026-04-10T09:00:00.000Z",
      }),
    ]);

    expect(layout.axis.days).toEqual(["2026-04-08", "2026-04-09", "2026-04-10"]);
    expect(layout.axis.dayCount).toBe(3);
  });

  it("has no axis and no marker when no issue reports a date", () => {
    const layout = buildDeadlineTimelineLayout([issue({ id: "a", identifier: "SII-1" })]);

    expect(layout.axis.dayCount).toBe(0);
    expect(layout.axis.days).toEqual([]);
    expect(layout.markers).toEqual([]);
  });
});
