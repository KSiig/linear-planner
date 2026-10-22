import { describe, expect, it } from "vitest";
import type { OverviewIssue } from "../shell/contract";
import { overviewCardOrder, overviewCards } from "../../registry";
import { overdueCard } from "./index";

const today = "2026-10-22";

function issue(overrides: Partial<OverviewIssue> & Pick<OverviewIssue, "id" | "identifier" | "dueDate">): OverviewIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/issue/${overrides.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    updatedAt: "2026-10-01T00:00:00.000Z",
    state: { name: "Todo", type: "unstarted" },
    project: { id: "p1", name: "Planner" },
    ...overrides,
  };
}

describe("overdue card", () => {
  it("includes open issues due before today and excludes today, completed, and null dates", async () => {
    const model = await overdueCard.load({
      today,
      issues: [
        issue({ id: "late", identifier: "SII-12", dueDate: "2026-10-12" }),
        issue({ id: "today", identifier: "SII-22", dueDate: "2026-10-22" }),
        issue({ id: "done", identifier: "SII-9", dueDate: "2026-10-12", state: { name: "Done", type: "completed" } }),
        issue({ id: "backlog", identifier: "SII-3", dueDate: "2026-10-12", state: { name: "Backlog", type: "backlog" } }),
        issue({ id: "none", identifier: "SII-1", dueDate: null }),
        issue({ id: "older", identifier: "SII-20", dueDate: "2026-10-01" }),
        issue({ id: "same-day-later-id", identifier: "SII-30", dueDate: "2026-10-12" }),
      ],
    });

    expect(model).toEqual({
      title: "Overdue",
      sections: [
        {
          rows: [
            expect.objectContaining({ identifier: "SII-20", trailing: "1 Oct", projectName: "Planner" }),
            expect.objectContaining({ identifier: "SII-12", trailing: "12 Oct", projectName: "Planner" }),
            expect.objectContaining({ identifier: "SII-3", trailing: "12 Oct", projectName: "Planner" }),
            expect.objectContaining({ identifier: "SII-30", trailing: "12 Oct", projectName: "Planner" }),
          ],
        },
      ],
    });
    expect(model?.subtitle).toBeUndefined();
    expect(model?.sections[0].title).toBeUndefined();
    expect(overdueCard.appearance?.accent).toBeUndefined();
  });

  it("returns null when no open issue is overdue", async () => {
    const model = await overdueCard.load({
      today,
      issues: [issue({ id: "today", identifier: "SII-22", dueDate: "2026-10-22" })],
    });
    expect(model).toBeNull();
  });

  it("keeps every registered module and places overdue first among present order ids", () => {
    const ids = overviewCards.map((card) => card.id);
    expect(ids).toContain("overdue");
    expect(new Set(ids).size).toBe(ids.length);
    const present = ids.filter((id) => (overviewCardOrder as readonly string[]).includes(id));
    const sorted = [...present].sort(
      (a, b) => overviewCardOrder.indexOf(a as (typeof overviewCardOrder)[number]) - overviewCardOrder.indexOf(b as (typeof overviewCardOrder)[number]),
    );
    expect(present).toEqual(sorted);
    expect(present[0]).toBe("overdue");
  });
});
