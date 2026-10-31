import { describe, expect, it } from "vitest";
import { emptyPlannerQuery } from "../src/plannerQuery";
import { rejectMode, rejectQuery, rowToView, type ViewRow } from "./viewRows";

function row(overrides: Partial<ViewRow> = {}): ViewRow {
  return {
    id: "v1",
    name: "Mine",
    query_json: JSON.stringify(emptyPlannerQuery()),
    mode: "dates",
    updated_at: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

function legacyQuery(): string {
  // A stored query from before the Status filter moved to concrete states.
  return JSON.stringify({
    projectIds: ["p1"],
    stateTypes: ["started"],
    assigneeIds: [],
    priorities: [],
    labelNames: [],
    milestoneIds: [],
    dueWindow: null,
  });
}

describe("rowToView", () => {
  it("reads a stored workers row as the dates mode", () => {
    const view = rowToView(row({ mode: "workers" }));
    expect(view?.mode).toBe("dates");
  });

  it("reads a stored dates row as the dates mode", () => {
    const view = rowToView(row({ mode: "dates" }));
    expect(view?.mode).toBe("dates");
  });

  it("returns a stored legacy query with the state ids the app filters on", () => {
    const view = rowToView(row({ query_json: legacyQuery() }));
    expect(view?.query.stateIds).toEqual([]);
    expect(view?.query.stateTypes).toEqual(["started"]);
  });

  it("returns null for a row whose query is not valid JSON", () => {
    expect(rowToView(row({ query_json: "{not-json" }))).toBeNull();
  });

  it("returns null for a row with an unknown mode", () => {
    expect(rowToView(row({ mode: "gantt" }))).toBeNull();
  });
});

describe("rejectQuery", () => {
  it("gives a legacy query the state ids and keeps the legacy state types", () => {
    const query = rejectQuery(JSON.parse(legacyQuery()));
    expect(query).not.toBeInstanceOf(Response);
    expect((query as { stateIds?: string[] }).stateIds).toEqual([]);
    expect((query as { stateTypes?: string[] }).stateTypes).toEqual(["started"]);
  });

  it("rejects a query that is not a planner query", () => {
    const rejected = rejectQuery({ projectIds: "p1" });
    expect(rejected).toBeInstanceOf(Response);
    expect((rejected as Response).status).toBe(400);
  });
});

describe("rejectMode", () => {
  it("accepts the legacy workers mode and returns the dates mode", () => {
    expect(rejectMode("workers")).toBe("dates");
  });

  it("accepts the dates mode", () => {
    expect(rejectMode("dates")).toBe("dates");
  });

  it("rejects an unknown mode", () => {
    const rejected = rejectMode("gantt");
    expect(rejected).toBeInstanceOf(Response);
    expect((rejected as Response).status).toBe(400);
  });
});
