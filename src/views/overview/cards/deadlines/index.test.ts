import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAY_STORAGE_KEY } from "../../../../savedViews";
import type { OverviewIssue } from "../shell/contract";
import { overviewCardOrder, overviewCards } from "../../registry";
import { deadlinesCard } from "./index";

const today = "2026-10-22";

function issue(
  overrides: Partial<OverviewIssue> & Pick<OverviewIssue, "id" | "identifier">,
): OverviewIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/issue/${overrides.identifier}`,
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#e2e2e2" },
    teamId: "team-siig",
    priority: 0,
    priorityLabel: "No priority",
    assignee: null,
    labels: [],
    milestone: null,
    project: { id: "p1", name: "Planner" },
    dueDate: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    enteredStartedStatusAt: null,
    completedAt: null,
    description: "",
    blockedBy: [],
    blocks: [],
    ...overrides,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Configure the workflow states the project treats as terminal. */
function configureDoneStateIds(ids: string[]): void {
  localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ doneStateIds: ids }));
}

describe("deadlines card", () => {
  it("groups the open issues of the next 14 days by due date, in date order", async () => {
    const model = await deadlinesCard.load({
      today,
      issues: [
        issue({ id: "today", identifier: "SII-1", dueDate: "2026-10-22" }),
        issue({ id: "second", identifier: "SII-2", dueDate: "2026-10-25" }),
        issue({ id: "first", identifier: "SII-3", dueDate: "2026-10-25" }),
        issue({ id: "third", identifier: "SII-4", dueDate: "2026-10-25" }),
        issue({ id: "last", identifier: "SII-5", dueDate: "2026-11-05" }),
      ],
    });

    expect(model?.title).toBe("Deadlines");
    expect(model?.subtitle).toBe("22 Oct – 5 Nov");
    expect(model?.sections.map((section) => section.title)).toEqual([
      "22 Oct · 1",
      "25 Oct · 3",
      "5 Nov · 1",
    ]);
    expect(model?.sections[1]?.rows.map((row) => row.identifier)).toEqual([
      "SII-2",
      "SII-3",
      "SII-4",
    ]);
  });

  it("leaves out the issues outside the window and the closed ones", async () => {
    const model = await deadlinesCard.load({
      today,
      issues: [
        issue({ id: "past", identifier: "SII-1", dueDate: "2026-10-21" }),
        issue({ id: "beyond", identifier: "SII-2", dueDate: "2026-11-06" }),
        issue({ id: "undated", identifier: "SII-3", dueDate: null }),
        issue({
          id: "done",
          identifier: "SII-4",
          dueDate: "2026-10-23",
          state: { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2" },
        }),
        issue({
          id: "canceled",
          identifier: "SII-5",
          dueDate: "2026-10-23",
          state: { id: "state-canceled", name: "Canceled", type: "canceled", color: "#9b9b9b" },
        }),
        issue({ id: "kept", identifier: "SII-6", dueDate: "2026-10-23" }),
      ],
    });

    expect(model?.sections.flatMap((section) => section.rows.map((row) => row.identifier))).toEqual([
      "SII-6",
    ]);
  });

  it("leaves out an issue a configured terminal state marks as done", async () => {
    configureDoneStateIds(["state-merged"]);

    const model = await deadlinesCard.load({
      today,
      issues: [
        issue({
          id: "merged",
          identifier: "SII-1",
          dueDate: "2026-10-23",
          state: { id: "state-merged", name: "Merged", type: "started", color: "#f2c94c" },
        }),
        issue({ id: "open", identifier: "SII-2", dueDate: "2026-10-23" }),
      ],
    });

    expect(model?.sections.flatMap((section) => section.rows.map((row) => row.identifier))).toEqual([
      "SII-2",
    ]);
  });

  it("carries the canonical issue facts in its rows", async () => {
    const model = await deadlinesCard.load({
      today,
      issues: [issue({ id: "a", identifier: "SII-1", title: "Ship it", dueDate: "2026-10-23", project: null })],
    });

    expect(model?.sections[0]?.rows[0]).toEqual({
      id: "a",
      identifier: "SII-1",
      title: "Ship it",
      url: "https://linear.app/issue/SII-1",
      trailing: "",
      projectName: "",
    });
  });

  it("returns null when no issue falls inside the window", async () => {
    expect(await deadlinesCard.load({ today, issues: [] })).toBeNull();
    expect(
      await deadlinesCard.load({
        today,
        issues: [issue({ id: "beyond", identifier: "SII-1", dueDate: "2026-11-06" })],
      }),
    ).toBeNull();
  });

  it("registers the card in the overview order", () => {
    const ids = overviewCards.map((card) => card.id);
    expect(ids).toContain("deadlines");
    expect(new Set(ids).size).toBe(ids.length);

    const order = overviewCardOrder as readonly string[];
    expect(order).toContain("deadlines");
    // Every registered card needs an id in the order tuple. A card without one
    // sorts to the front of the stack.
    for (const card of overviewCards) expect(order).toContain(card.id);
  });
});
