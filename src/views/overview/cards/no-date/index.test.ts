// @vitest-environment happy-dom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OverviewIssue } from "../shell/contract";
import { CardShell } from "../shell";
import { overviewCardOrder, overviewCards } from "../../registry";
import { noDateCard } from "./index";

afterEach(() => {
  cleanup();
});

function issue(overrides: Partial<OverviewIssue> & Pick<OverviewIssue, "id" | "identifier">): OverviewIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/issue/${overrides.identifier}`,
    dueDate: null,
    priority: 0,
    priorityLabel: "No priority",
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: { name: "Todo", type: "unstarted" },
    project: { id: "project-1", name: "Planner" },
    ...overrides,
  };
}

describe("no-date card", () => {
  it("leads with an open High undated issue when no Urgent issue is undated", async () => {
    const model = await noDateCard.load({
      today: "2026-04-08",
      issues: [
        issue({
          id: "low",
          identifier: "SII-1",
          priority: 4,
          priorityLabel: "Low",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        issue({
          id: "high",
          identifier: "SII-2",
          priority: 2,
          priorityLabel: "High",
          updatedAt: "2026-03-01T00:00:00.000Z",
        }),
        issue({
          id: "dated-urgent",
          identifier: "SII-3",
          priority: 1,
          priorityLabel: "Urgent",
          dueDate: "2026-04-01",
        }),
      ],
    });

    expect(model?.title).toBe("No date");
    expect(model?.subtitle).toBeUndefined();
    expect(model?.sections[0]?.title).toBeUndefined();
    expect(model?.sections[0]?.rows.map((row) => row.identifier)).toEqual(["SII-2", "SII-1"]);
    expect(model?.sections[0]?.rows[0]?.trailing).toBe("High");
    expect(model?.sections[0]?.rows[0]?.projectName).toBe("Planner");
  });

  it("puts an undated backlog issue in Ideas and excludes dated and closed issues", async () => {
    const model = await noDateCard.load({
      today: "2026-04-08",
      issues: [
        issue({ id: "lead", identifier: "SII-10", priority: 3, priorityLabel: "Medium" }),
        issue({
          id: "idea",
          identifier: "SII-11",
          state: { name: "Backlog", type: "backlog" },
          project: null,
        }),
        issue({ id: "dated", identifier: "SII-12", dueDate: "2026-04-09", priority: 2, priorityLabel: "High" }),
        issue({
          id: "done",
          identifier: "SII-13",
          state: { name: "Done", type: "completed" },
        }),
        issue({
          id: "canceled",
          identifier: "SII-14",
          state: { name: "Canceled", type: "canceled" },
        }),
      ],
    });

    expect(model?.sections).toHaveLength(2);
    expect(model?.sections[0]?.rows.map((row) => row.identifier)).toEqual(["SII-10"]);
    expect(model?.sections[1]?.title).toBe("Ideas");
    expect(model?.sections[1]?.rows.map((row) => row.identifier)).toEqual(["SII-11"]);
    expect(model?.sections[1]?.rows[0]?.projectName).toBe("");
    expect(model?.sections.flatMap((section) => section.rows).some((row) => row.identifier === "SII-12")).toBe(false);
  });

  it("returns null when every issue is dated or closed", async () => {
    const model = await noDateCard.load({
      today: "2026-04-08",
      issues: [issue({ id: "dated", identifier: "SII-20", dueDate: "2026-05-01" })],
    });
    expect(model).toBeNull();
  });

  it("shows one row and a 15 more button for sixteen undated open rows", async () => {
    const issues = Array.from({ length: 16 }, (_, index) =>
      issue({
        id: `row-${index}`,
        identifier: `SII-${String(index).padStart(2, "0")}`,
        priority: 2,
        priorityLabel: "High",
        updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const model = await noDateCard.load({ today: "2026-04-08", issues });
    expect(model).not.toBeNull();
    render(createElement(CardShell, { card: noDateCard, model }));
    expect(screen.getAllByText("SII-00").length).toBeGreaterThan(0);
    expect(screen.queryByText("SII-01")).toBeNull();
    expect(screen.getByRole("button", { name: "15 more" })).toBeTruthy();
    expect(noDateCard.appearance?.collapseAfter).toBe(1);
    expect(noDateCard.appearance?.scroll).toBe("body");
    expect(noDateCard.appearance?.accent).toBeUndefined();
  });

  it("sorts no-date after soon and before later when those modules are present", () => {
    const soon = overviewCardOrder.indexOf("soon");
    const noDate = overviewCardOrder.indexOf("no-date");
    const later = overviewCardOrder.indexOf("later");
    expect(soon).toBeGreaterThanOrEqual(0);
    expect(noDate).toBeGreaterThan(soon);
    expect(noDate).toBeLessThan(later);

    const ids = overviewCards.map((card) => card.id);
    expect(ids).toContain("no-date");
    if (ids.includes("soon") && ids.includes("later")) {
      expect(ids.indexOf("no-date")).toBeGreaterThan(ids.indexOf("soon"));
      expect(ids.indexOf("no-date")).toBeLessThan(ids.indexOf("later"));
    }
  });
});
