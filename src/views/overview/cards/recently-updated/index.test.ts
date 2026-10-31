import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OverviewIssue } from "../shell/contract";
import { overviewCardOrder, overviewCards } from "../../registry";
import { recentlyUpdatedCard } from "./index";

const today = "2026-10-22";

/**
 * The time zone the boundary test runs in.
 *
 * The card compares an issue's update day with `ctx.today`, and `ctx.today` is
 * a local date. The test needs a local day that differs from the UTC day, so
 * it pins the zone instead of relying on the machine's. Tokyo is nine hours
 * ahead of UTC and keeps that offset all year, so the test does not depend on
 * a daylight-saving rule.
 */
const TEST_TIME_ZONE = "Asia/Tokyo";

/** The local day of the boundary test, in the pinned zone. */
const BOUNDARY_TODAY = "2026-11-01";

const originalTimeZone = process.env.TZ;

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

describe("recently updated card", () => {
  beforeAll(() => {
    process.env.TZ = TEST_TIME_ZONE;
  });

  afterAll(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it("includes open issues updated in the last 14 calendar days, today included", async () => {
    const model = await recentlyUpdatedCard.load({
      today,
      issues: [
        issue({ id: "today", identifier: "SII-1", updatedAt: "2026-10-22T08:00:00.000Z" }),
        issue({ id: "first-day", identifier: "SII-2", updatedAt: "2026-10-09T08:00:00.000Z" }),
        issue({ id: "yesterday", identifier: "SII-3", updatedAt: "2026-10-21T08:00:00.000Z" }),
      ],
    });

    expect(model?.sections[0].rows.map((row) => row.identifier).sort()).toEqual([
      "SII-1",
      "SII-2",
      "SII-3",
    ]);
    expect(model?.title).toBe("Recently Updated");
  });

  it("excludes issues updated before the window and closed issues", async () => {
    const model = await recentlyUpdatedCard.load({
      today,
      issues: [
        issue({ id: "too-old", identifier: "SII-4", updatedAt: "2026-10-08T08:00:00.000Z" }),
        issue({
          id: "done",
          identifier: "SII-5",
          updatedAt: "2026-10-22T08:00:00.000Z",
          state: { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2" },
        }),
        issue({
          id: "canceled",
          identifier: "SII-6",
          updatedAt: "2026-10-22T08:00:00.000Z",
          state: { id: "state-canceled", name: "Canceled", type: "canceled", color: "#8f8f8f" },
        }),
      ],
    });

    expect(model).toBeNull();
  });

  it("sorts by the most recent update first, then priority, then identifier", async () => {
    const model = await recentlyUpdatedCard.load({
      today,
      issues: [
        issue({ id: "oldest", identifier: "SII-10", updatedAt: "2026-10-20T08:00:00.000Z" }),
        issue({
          id: "newest-low",
          identifier: "SII-12",
          updatedAt: "2026-10-21T08:00:00.000Z",
          priority: 4,
          priorityLabel: "Low",
        }),
        issue({
          id: "newest-high",
          identifier: "SII-13",
          updatedAt: "2026-10-21T08:00:00.000Z",
          priority: 1,
          priorityLabel: "Urgent",
        }),
        issue({
          id: "newest-high-b",
          identifier: "SII-11",
          updatedAt: "2026-10-21T08:00:00.000Z",
          priority: 1,
          priorityLabel: "Urgent",
        }),
      ],
    });

    expect(model?.sections[0].rows.map((row) => row.identifier)).toEqual([
      "SII-11",
      "SII-13",
      "SII-12",
      "SII-10",
    ]);
    expect(model?.sections[0].rows[0].trailing).toBe("21 Oct");
  });

  it("returns null when nothing was updated in the window", async () => {
    const model = await recentlyUpdatedCard.load({
      today,
      issues: [issue({ id: "old", identifier: "SII-20", updatedAt: "2026-09-01T08:00:00.000Z" })],
    });

    expect(model).toBeNull();
  });

  it("uses the local calendar day at the UTC midnight boundary", async () => {
    // In the pinned zone these three updates fall on three different local
    // days. The UTC days of the first two are one day earlier than the local
    // days, so taking the UTC day puts the first one outside the window.
    const model = await recentlyUpdatedCard.load({
      today: BOUNDARY_TODAY,
      issues: [
        issue({ id: "first-day", identifier: "SII-30", updatedAt: "2026-10-18T23:30:00.000Z" }),
        issue({ id: "last-day", identifier: "SII-31", updatedAt: "2026-10-31T23:30:00.000Z" }),
        issue({ id: "before", identifier: "SII-32", updatedAt: "2026-10-17T12:00:00.000Z" }),
      ],
    });

    // The window runs from 19 Oct to 1 Nov, both days included.
    expect(model?.sections[0].rows.map((row) => row.identifier)).toEqual(["SII-31", "SII-30"]);
    expect(model?.sections[0].rows.find((row) => row.identifier === "SII-30")?.trailing).toBe("19 Oct");
    expect(model?.sections[0].rows.find((row) => row.identifier === "SII-31")?.trailing).toBe("1 Nov");
  });

  it("excludes an issue whose update time is missing or invalid", async () => {
    const model = await recentlyUpdatedCard.load({
      today: BOUNDARY_TODAY,
      issues: [
        issue({ id: "missing", identifier: "SII-40", updatedAt: "" }),
        issue({ id: "invalid", identifier: "SII-41", updatedAt: "2026-10-25T99:99:99.000Z" }),
      ],
    });

    expect(model).toBeNull();
  });

  it("registers the card after the blocked card", () => {
    const ids = overviewCards.map((card) => card.id);
    expect(ids).toContain("recently-updated");
    expect(new Set(ids).size).toBe(ids.length);
    const order = overviewCardOrder as readonly string[];
    expect(order.indexOf("recently-updated")).toBeGreaterThan(order.indexOf("blocked"));
  });
});
