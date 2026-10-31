import { describe, expect, it } from "vitest";
import type { OverviewIssue } from "../shell/contract";
import { overviewCardOrder, overviewCards } from "../../registry";
import { blockedCard } from "./index";

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

/** A blocker that is still open. */
function openBlocker(identifier: string) {
  return {
    relationId: `relation-${identifier}`,
    issue: {
      id: `blocker-${identifier}`,
      identifier,
      title: identifier,
      stateType: "started",
      isOpen: true,
    },
  };
}

/** A blocker that is already closed. */
function closedBlocker(identifier: string) {
  return {
    relationId: `relation-${identifier}`,
    issue: {
      id: `blocker-${identifier}`,
      identifier,
      title: identifier,
      stateType: "completed",
      isOpen: false,
    },
  };
}

describe("blocked card", () => {
  it("includes unstarted and backlog issues that have an open blocker", async () => {
    const model = await blockedCard.load({
      today,
      issues: [
        issue({ id: "todo", identifier: "SII-1", blockedBy: [openBlocker("SII-9")] }),
        issue({
          id: "backlog",
          identifier: "SII-2",
          state: { id: "state-backlog", name: "Backlog", type: "backlog", color: "#bec2c8" },
          blockedBy: [openBlocker("SII-8")],
        }),
      ],
    });

    expect(model?.sections[0].rows.map((row) => row.identifier)).toEqual(["SII-1", "SII-2"]);
    expect(model?.title).toBe("Blocked");
  });

  it("excludes started issues, closed issues, and issues whose blockers are closed", async () => {
    const model = await blockedCard.load({
      today,
      issues: [
        issue({
          id: "started",
          identifier: "SII-3",
          state: { id: "state-progress", name: "In Progress", type: "started", color: "#f2c94c" },
          blockedBy: [openBlocker("SII-7")],
        }),
        issue({
          id: "done",
          identifier: "SII-4",
          state: { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2" },
          blockedBy: [openBlocker("SII-6")],
        }),
        issue({ id: "closed-blocker", identifier: "SII-5", blockedBy: [closedBlocker("SII-5")] }),
        issue({ id: "not-blocked", identifier: "SII-6", blockedBy: [] }),
      ],
    });

    expect(model).toBeNull();
  });

  it("counts an issue as blocked when one of several blockers is open", async () => {
    const model = await blockedCard.load({
      today,
      issues: [
        issue({
          id: "mixed",
          identifier: "SII-7",
          blockedBy: [closedBlocker("SII-1"), openBlocker("SII-2")],
        }),
      ],
    });

    expect(model?.sections[0].rows.map((row) => row.identifier)).toEqual(["SII-7"]);
  });

  it("sorts by the oldest due date, then priority, then identifier, with undated issues last", async () => {
    const model = await blockedCard.load({
      today,
      issues: [
        issue({ id: "undated", identifier: "SII-30", blockedBy: [openBlocker("SII-1")] }),
        issue({
          id: "late",
          identifier: "SII-20",
          dueDate: "2026-11-01",
          blockedBy: [openBlocker("SII-2")],
        }),
        issue({
          id: "early-low",
          identifier: "SII-12",
          dueDate: "2026-10-25",
          priority: 4,
          priorityLabel: "Low",
          blockedBy: [openBlocker("SII-3")],
        }),
        issue({
          id: "early-high",
          identifier: "SII-13",
          dueDate: "2026-10-25",
          priority: 1,
          priorityLabel: "Urgent",
          blockedBy: [openBlocker("SII-4")],
        }),
        issue({
          id: "early-high-b",
          identifier: "SII-11",
          dueDate: "2026-10-25",
          priority: 1,
          priorityLabel: "Urgent",
          blockedBy: [openBlocker("SII-5")],
        }),
      ],
    });

    expect(model?.sections[0].rows.map((row) => row.identifier)).toEqual([
      "SII-11",
      "SII-13",
      "SII-12",
      "SII-20",
      "SII-30",
    ]);
    expect(model?.sections[0].rows[0].trailing).toBe("25 Oct");
    expect(model?.sections[0].rows[4].trailing).toBe("");
  });

  it("returns null when no issue is blocked", async () => {
    const model = await blockedCard.load({
      today,
      issues: [issue({ id: "free", identifier: "SII-40", blockedBy: [] })],
    });

    expect(model).toBeNull();
  });

  it("registers the card after the due-date cards", () => {
    const ids = overviewCards.map((card) => card.id);
    expect(ids).toContain("blocked");
    expect(new Set(ids).size).toBe(ids.length);
    const order = overviewCardOrder as readonly string[];
    expect(order.indexOf("blocked")).toBeGreaterThan(order.indexOf("later"));
  });
});
