import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardShell } from "../shell";
import type { OverviewIssue } from "../shell/contract";
import { overviewCardOrder, overviewCards } from "../../registry";
import { laterCard } from "./index";

const today = "2026-10-22";

function issue(overrides: Partial<OverviewIssue> & Pick<OverviewIssue, "id" | "identifier" | "dueDate">): OverviewIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/issue/${overrides.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    updatedAt: "2026-10-01T00:00:00.000Z",
    state: { name: "Todo", type: "unstarted" },
    project: { id: "proj", name: "Planner" },
    ...overrides,
  };
}

describe("later card", () => {
  it("includes open issues due on day 46 or later and excludes day 45 and null dates", async () => {
    const model = await laterCard.load({
      today,
      issues: [
        issue({ id: "a", identifier: "SII-1", dueDate: "2026-12-07" }),
        issue({ id: "b", identifier: "SII-2", dueDate: "2026-12-06" }),
        issue({ id: "c", identifier: "SII-3", dueDate: null }),
        issue({ id: "d", identifier: "SII-4", dueDate: "2026-12-08", state: { name: "Done", type: "completed" } }),
        issue({ id: "e", identifier: "SII-5", dueDate: "2026-12-08", state: { name: "Canceled", type: "canceled" } }),
      ],
    });

    expect(model?.sections.flatMap((section) => section.rows.map((row) => row.identifier))).toEqual(["SII-1"]);
  });

  it("groups 1 Mar issues into one section titled with the row count", async () => {
    const model = await laterCard.load({
      today,
      issues: [
        issue({ id: "b", identifier: "SII-9", dueDate: "2027-03-01", project: null }),
        issue({ id: "a", identifier: "SII-8", dueDate: "2027-03-01" }),
      ],
    });

    expect(model?.sections).toHaveLength(1);
    expect(model?.sections[0]?.title).toBe("1 Mar · 2");
    expect(model?.sections[0]?.rows.map((row) => row.identifier)).toEqual(["SII-8", "SII-9"]);
    expect(model?.sections[0]?.rows[1]?.projectName).toBe("");
    expect(model?.sections[0]?.rows[0]?.trailing).toBe("");
    expect(model?.subtitle).toBe("Mar 2027");
    expect(model?.title).toBe("Later");
  });

  it("spans the subtitle from the earliest month-year to the latest", async () => {
    const model = await laterCard.load({
      today,
      issues: [
        issue({ id: "late", identifier: "SII-20", dueDate: "2027-06-02" }),
        issue({ id: "early", identifier: "SII-10", dueDate: "2027-02-15" }),
      ],
    });

    expect(model?.subtitle).toBe("Feb 2027 – Jun 2027");
    expect(model?.sections.map((section) => section.title)).toEqual(["15 Feb · 1", "2 Jun · 1"]);
  });

  it("returns null when there are no rows", async () => {
    expect(await laterCard.load({ today, issues: [] })).toBeNull();
  });

  it("shows one row and a more button while collapsed when the row count is greater than 1", async () => {
    const model = await laterCard.load({
      today,
      issues: [
        issue({ id: "a", identifier: "SII-8", dueDate: "2027-03-01", title: "First later" }),
        issue({ id: "b", identifier: "SII-9", dueDate: "2027-03-01", title: "Second later" }),
      ],
    });
    const html = renderToStaticMarkup(createElement(CardShell, { card: laterCard, model }));
    expect(html).toContain("First later");
    expect(html).not.toContain("Second later");
    expect(html).toContain("1 more");
    expect(laterCard.appearance?.collapseAfter).toBe(1);
    expect(laterCard.appearance?.muted).toBe(true);
    expect(laterCard.appearance?.scroll).toBe("body");
  });

  it("sorts after no-date when those modules are present", () => {
    // The due-date cards keep their order. Cards registered after them — the
    // fact-based activity cards and the summaries — follow, so `later` is no
    // longer the last id in the registry. The test reads the order of the two
    // modules it names instead of a snapshot of the whole registry.
    expect(overviewCards.map((card) => card.id)).toContain("later");
    const order = overviewCardOrder as readonly string[];
    const present = [
      { id: "no-date" },
      ...overviewCards.filter((card) => card.id === "later"),
    ].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
    expect(present.map((card) => card.id)).toEqual(["no-date", "later"]);
  });
});
