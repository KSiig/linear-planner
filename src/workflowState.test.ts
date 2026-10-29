import { describe, it, expect } from "vitest";
import { computeEffectiveDoneStateIds, getStateProgress, sortStates } from "./workflowState";
import type { LinearWorkflowState } from "./linear";

function state(overrides: Partial<LinearWorkflowState> & { id: string }): LinearWorkflowState {
  return {
    name: overrides.id,
    type: "unstarted",
    position: 1,
    color: "#ccc",
    ...overrides,
  };
}

describe("sortStates", () => {
  it("orders the states by their workflow type", () => {
    const states = [
      state({ id: "done", type: "completed", position: 1 }),
      state({ id: "started", type: "started", position: 2 }),
      state({ id: "todo", type: "unstarted", position: 3 }),
      state({ id: "backlog", type: "backlog", position: 4 }),
    ];

    expect(sortStates(states).map((s) => s.id)).toEqual(["backlog", "todo", "started", "done"]);
  });

  it("orders the states of one type by their position", () => {
    const states = [
      state({ id: "second", type: "started", position: 2 }),
      state({ id: "first", type: "started", position: 1 }),
    ];

    expect(sortStates(states).map((s) => s.id)).toEqual(["first", "second"]);
  });

  it("does not mutate the states it is given", () => {
    const states = [
      state({ id: "second", type: "started", position: 2 }),
      state({ id: "first", type: "started", position: 1 }),
    ];

    const sorted = sortStates(states);

    expect(states.map((s) => s.id)).toEqual(["second", "first"]);
    expect(sorted).not.toBe(states);
  });

  it("puts a state of an unknown type last", () => {
    const states = [
      state({ id: "custom", type: "something-else", position: 1 }),
      state({ id: "todo", type: "unstarted", position: 2 }),
    ];

    expect(sortStates(states).map((s) => s.id)).toEqual(["todo", "custom"]);
  });
});

describe("computeEffectiveDoneStateIds", () => {
  const states = [state({ id: "state-done" }), state({ id: "state-merged" })];

  it("keeps the stored ids the workflow still knows", () => {
    expect(computeEffectiveDoneStateIds(["state-done", "state-merged"], states)).toEqual([
      "state-done",
      "state-merged",
    ]);
  });

  it("drops an id whose state no longer exists", () => {
    expect(computeEffectiveDoneStateIds(["state-done", "state-gone"], states)).toEqual(["state-done"]);
  });

  it("keeps the order of the stored ids", () => {
    expect(computeEffectiveDoneStateIds(["state-merged", "state-done"], states)).toEqual([
      "state-merged",
      "state-done",
    ]);
  });

  it("returns nothing when no id is stored", () => {
    expect(computeEffectiveDoneStateIds([], states)).toEqual([]);
  });
});

describe("getStateProgress", () => {
  const started = [
    state({ id: "first", type: "started" }),
    state({ id: "second", type: "started" }),
    state({ id: "third", type: "started" }),
  ];

  it("counts a completed state as done", () => {
    expect(getStateProgress(state({ id: "done", type: "completed" }), started)).toBe(1);
  });

  it("counts a canceled state as no progress", () => {
    expect(getStateProgress(state({ id: "canceled", type: "canceled" }), started)).toBe(0);
  });

  it("counts a state that has not started yet as no progress", () => {
    expect(getStateProgress(state({ id: "todo", type: "unstarted" }), started)).toBe(0);
  });

  it("counts a started state by its place among the started states", () => {
    expect(getStateProgress(started[0], started)).toBe(0.25);
    expect(getStateProgress(started[1], started)).toBe(0.5);
    expect(getStateProgress(started[2], started)).toBe(0.75);
  });

  it("counts a started state that is not among the started states as half", () => {
    expect(getStateProgress(state({ id: "other", type: "started" }), started)).toBe(0.5);
  });

  it("counts a started state as no progress when no state has started", () => {
    expect(getStateProgress(state({ id: "first", type: "started" }), [])).toBe(0);
  });
});
