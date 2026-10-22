import { describe, expect, it } from "vitest";
import type { OverviewIssue } from "../shell/contract";
import { nextCard } from "./index";
import { overviewCardOrder, overviewCards } from "../../registry";

const TODAY = "2026-10-22";

function issue(partial: Partial<OverviewIssue> & Pick<OverviewIssue, "id" | "identifier" | "dueDate">): OverviewIssue {
  return {
    title: partial.identifier,
    url: `https://linear.test/${partial.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    updatedAt: "2026-10-01T00:00:00.000Z",
    state: { name: "Todo", type: "unstarted" },
    project: { id: "project-1", name: "Planner" },
    ...partial,
  };
}

describe("next card", () => {
  it("includes open issues due from today through day 14 and excludes day 15 and null dates", async () => {
    const model = await nextCard.load({
      today: TODAY,
      issues: [
        issue({ id: "later", identifier: "SII-15", dueDate: "2026-11-06" }),
        issue({ id: "end", identifier: "SII-14", dueDate: "2026-11-05" }),
        issue({ id: "none", identifier: "SII-0", dueDate: null }),
        issue({ id: "today", identifier: "SII-1", dueDate: "2026-10-22", project: null }),
        issue({ id: "done", identifier: "SII-9", dueDate: "2026-10-23", state: { name: "Done", type: "completed" } }),
        issue({ id: "mid-b", identifier: "SII-3", dueDate: "2026-10-23" }),
        issue({ id: "mid-a", identifier: "SII-2", dueDate: "2026-10-23" }),
      ],
    });

    expect(model).toEqual({
      title: "Next",
      subtitle: "through 5 Nov",
      sections: [
        {
          rows: [
            {
              id: "today",
              identifier: "SII-1",
              title: "SII-1",
              url: "https://linear.test/SII-1",
              trailing: "22 Oct",
              projectName: "",
            },
            {
              id: "mid-a",
              identifier: "SII-2",
              title: "SII-2",
              url: "https://linear.test/SII-2",
              trailing: "23 Oct",
              projectName: "Planner",
            },
            {
              id: "mid-b",
              identifier: "SII-3",
              title: "SII-3",
              url: "https://linear.test/SII-3",
              trailing: "23 Oct",
              projectName: "Planner",
            },
            {
              id: "end",
              identifier: "SII-14",
              title: "SII-14",
              url: "https://linear.test/SII-14",
              trailing: "5 Nov",
              projectName: "Planner",
            },
          ],
        },
      ],
    });
    expect(model?.sections[0].title).toBeUndefined();
  });

  it("returns null when the section has no rows", async () => {
    const model = await nextCard.load({
      today: TODAY,
      issues: [issue({ id: "none", identifier: "SII-0", dueDate: null })],
    });
    expect(model).toBeNull();
  });

  it("sorts after overdue and before soon when those modules are present", () => {
    expect(overviewCards.map((card) => card.id)).toContain("next");
    const order = overviewCardOrder as readonly string[];
    const present = [
      { id: "soon" },
      { id: "overdue" },
      ...overviewCards.filter((card) => card.id === "next"),
    ].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
    expect(present.map((card) => card.id)).toEqual(["overdue", "next", "soon"]);
  });
});
