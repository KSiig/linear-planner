import { describe, expect, it } from "vitest";
import { overviewCardOrder, overviewCards } from "../../registry";
import { soonCard } from "./index";
import type { OverviewIssue } from "../shell/contract";

const today = "2026-10-22";

function issue(partial: Partial<OverviewIssue> & Pick<OverviewIssue, "id" | "identifier" | "dueDate">): OverviewIssue {
  return {
    title: partial.identifier,
    url: `https://linear.app/issue/${partial.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    updatedAt: "2026-10-22T00:00:00.000Z",
    state: { name: "Todo", type: "unstarted" },
    project: { id: "project-1", name: "Planner" },
    ...partial,
  };
}

describe("soon card", () => {
  it("includes open issues due from day 15 through day 45", async () => {
    const model = await soonCard.load({
      today,
      issues: [
        issue({ id: "in-start", identifier: "SII-2", dueDate: "2026-11-06" }),
        issue({ id: "in-mid", identifier: "SII-3", dueDate: "2026-11-28" }),
        issue({ id: "in-end", identifier: "SII-1", dueDate: "2026-12-06" }),
        issue({ id: "before", identifier: "SII-14", dueDate: "2026-11-05" }),
        issue({ id: "after", identifier: "SII-46", dueDate: "2026-12-07" }),
        issue({ id: "none", identifier: "SII-0", dueDate: null }),
        issue({
          id: "done",
          identifier: "SII-9",
          dueDate: "2026-11-20",
          state: { name: "Done", type: "completed" },
        }),
        issue({
          id: "canceled",
          identifier: "SII-8",
          dueDate: "2026-11-20",
          state: { name: "Canceled", type: "canceled" },
        }),
      ],
    });

    expect(model).toEqual({
      title: "Soon",
      subtitle: "through 6 Dec",
      sections: [
        {
          rows: [
            {
              id: "in-start",
              identifier: "SII-2",
              title: "SII-2",
              url: "https://linear.app/issue/SII-2",
              trailing: "6 Nov",
              projectName: "Planner",
            },
            {
              id: "in-mid",
              identifier: "SII-3",
              title: "SII-3",
              url: "https://linear.app/issue/SII-3",
              trailing: "28 Nov",
              projectName: "Planner",
            },
            {
              id: "in-end",
              identifier: "SII-1",
              title: "SII-1",
              url: "https://linear.app/issue/SII-1",
              trailing: "6 Dec",
              projectName: "Planner",
            },
          ],
        },
      ],
    });
    expect(model?.sections[0]?.title).toBeUndefined();
    expect(soonCard.appearance?.accent).toBeUndefined();
  });

  it("returns null when no issues fall in the window", async () => {
    const model = await soonCard.load({
      today,
      issues: [issue({ id: "before", identifier: "SII-14", dueDate: "2026-11-05" })],
    });
    expect(model).toBeNull();
  });

  it("sorts after next and before no-date when those modules are present", () => {
    expect(overviewCardOrder.indexOf("soon")).toBeGreaterThan(overviewCardOrder.indexOf("next"));
    expect(overviewCardOrder.indexOf("soon")).toBeLessThan(overviewCardOrder.indexOf("no-date"));
    expect(overviewCards.map((card) => card.id)).toContain("soon");

    const ids = overviewCards.map((card) => card.id);
    if (ids.includes("next") && ids.includes("no-date")) {
      expect(ids.indexOf("soon")).toBeGreaterThan(ids.indexOf("next"));
      expect(ids.indexOf("soon")).toBeLessThan(ids.indexOf("no-date"));
    }
  });
});
