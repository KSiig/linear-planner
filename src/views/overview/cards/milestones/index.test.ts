import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAY_STORAGE_KEY } from "../../../../savedViews";
import type { OverviewIssue } from "../shell/contract";
import { overviewCardOrder, overviewCards } from "../../registry";
import { milestonesCard } from "./index";

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

describe("milestones card", () => {
  it("shows one section per milestone with its counts and its due-date range", async () => {
    const model = await milestonesCard.load({
      today,
      issues: [
        issue({ id: "1", identifier: "SII-1", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-01" }),
        issue({ id: "2", identifier: "SII-2", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-28" }),
        issue({
          id: "3",
          identifier: "SII-3",
          milestone: { id: "ms-1", name: "M1" },
          state: { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2" },
        }),
        issue({ id: "4", identifier: "SII-4", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-10" }),
        issue({ id: "5", identifier: "SII-5", milestone: { id: "ms-2", name: "M2" } }),
      ],
    });

    expect(model?.title).toBe("Milestones");
    expect(model?.sections).toHaveLength(2);
    expect(model?.sections[0]?.title).toBe(
      "M1 · 4 issues · 3 open · 1 completed · 2 overdue · 1 Oct 2026 – 28 Oct 2026",
    );
    expect(model?.sections[1]?.title).toBe("M2 · 1 issue · 1 open · 0 completed · 0 overdue");
  });

  it("shows one due date instead of a range when the issues share it", async () => {
    const model = await milestonesCard.load({
      today,
      issues: [
        issue({ id: "1", identifier: "SII-1", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-28" }),
        issue({ id: "2", identifier: "SII-2", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-28" }),
      ],
    });

    expect(model?.sections[0]?.title).toBe(
      "M1 · 2 issues · 2 open · 0 completed · 0 overdue · 28 Oct 2026",
    );
  });

  it("shows the No milestone section only when an issue has no milestone", async () => {
    const withoutMilestone = await milestonesCard.load({
      today,
      issues: [
        issue({ id: "1", identifier: "SII-1", milestone: { id: "ms-1", name: "M1" } }),
        issue({ id: "2", identifier: "SII-2" }),
      ],
    });

    expect(withoutMilestone?.sections.map((section) => section.title)).toEqual([
      "M1 · 1 issue · 1 open · 0 completed · 0 overdue",
      "No milestone · 1 issue · 1 open · 0 completed · 0 overdue",
    ]);

    const withMilestone = await milestonesCard.load({
      today,
      issues: [issue({ id: "1", identifier: "SII-1", milestone: { id: "ms-1", name: "M1" } })],
    });

    expect(withMilestone?.sections.map((section) => section.title)).toEqual([
      "M1 · 1 issue · 1 open · 0 completed · 0 overdue",
    ]);
  });

  it("counts an issue a configured terminal state marks as done as completed", async () => {
    configureDoneStateIds(["state-merged"]);

    const model = await milestonesCard.load({
      today,
      issues: [
        issue({
          id: "merged",
          identifier: "SII-1",
          milestone: { id: "ms-1", name: "M1" },
          state: { id: "state-merged", name: "Merged", type: "started", color: "#f2c94c" },
        }),
        issue({ id: "open", identifier: "SII-2", milestone: { id: "ms-1", name: "M1" } }),
      ],
    });

    // The open count follows the workflow state type, the completed count the
    // terminal state. A configured terminal state is a started-type state, so
    // it counts as open and as completed, the way the shared facts count it.
    expect(model?.sections[0]?.title).toBe("M1 · 2 issues · 2 open · 1 completed · 0 overdue");
  });

  it("counts an overdue issue only when it is open and not done", async () => {
    const model = await milestonesCard.load({
      today,
      issues: [
        issue({ id: "past", identifier: "SII-1", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-21" }),
        issue({
          id: "past-done",
          identifier: "SII-2",
          milestone: { id: "ms-1", name: "M1" },
          dueDate: "2026-10-21",
          state: { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2" },
        }),
        issue({ id: "today", identifier: "SII-3", milestone: { id: "ms-1", name: "M1" }, dueDate: "2026-10-22" }),
      ],
    });

    expect(model?.sections[0]?.title).toBe(
      "M1 · 3 issues · 2 open · 1 completed · 1 overdue · 21 Oct 2026 – 22 Oct 2026",
    );
  });

  it("holds no issue rows", async () => {
    const model = await milestonesCard.load({
      today,
      issues: [issue({ id: "1", identifier: "SII-1", milestone: { id: "ms-1", name: "M1" } })],
    });

    expect(model?.sections.flatMap((section) => section.rows)).toEqual([]);
  });

  it("returns null when there is no issue", async () => {
    expect(await milestonesCard.load({ today, issues: [] })).toBeNull();
  });

  it("registers the card in the overview order", () => {
    const ids = overviewCards.map((card) => card.id);
    expect(ids).toContain("milestones");
    expect(new Set(ids).size).toBe(ids.length);

    const order = overviewCardOrder as readonly string[];
    expect(order).toContain("milestones");
    // Every registered card needs an id in the order tuple. A card without one
    // sorts to the front of the stack.
    for (const card of overviewCards) expect(order).toContain(card.id);
  });
});
