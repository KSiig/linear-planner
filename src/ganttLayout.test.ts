import { describe, it, expect } from "vitest";
import { crossedNonWorkingRuns, timelineSpanDays } from "./ganttLayout";

// Days 0–4 and 7–11 are worked; 5–6 is a weekend, 12–15 a cooldown, 16–20 worked.
const NON_WORKING = new Set([5, 6, 12, 13, 14, 15]);
const isNonWorking = (day: number) => NON_WORKING.has(day);

describe("crossedNonWorkingRuns", () => {
  it("reports a weekend the bar runs through", () => {
    expect(crossedNonWorkingRuns(3, 9, isNonWorking)).toEqual([[5, 6]]);
  });

  it("reports a cooldown the bar runs through", () => {
    expect(crossedNonWorkingRuns(10, 18, isNonWorking)).toEqual([[12, 15]]);
  });

  it("reports every run a long bar crosses", () => {
    expect(crossedNonWorkingRuns(2, 18, isNonWorking)).toEqual([[5, 6], [12, 15]]);
  });

  it("reports nothing for a bar that ends inside a run", () => {
    expect(crossedNonWorkingRuns(10, 13.5, isNonWorking)).toEqual([]);
  });

  it("reports nothing for a bar that starts inside a run", () => {
    expect(crossedNonWorkingRuns(13, 18, isNonWorking)).toEqual([]);
  });

  it("reports nothing for a bar wholly inside worked days", () => {
    expect(crossedNonWorkingRuns(1, 4, isNonWorking)).toEqual([]);
  });

  it("reports nothing when every day is worked", () => {
    expect(crossedNonWorkingRuns(0, 20, () => false)).toEqual([]);
  });
});

describe("timelineSpanDays", () => {
  const forecast = { startDay: 8, endDay: 40, isCapacityForecast: true };
  const placed = { startDay: 2, endDay: 10, isCapacityForecast: false };

  it("stops at the last on-axis bar when the forecast is hidden", () => {
    expect(timelineSpanDays([forecast, placed], [], 8, false, 40)).toBe(10);
  });

  it("uses the full schedule when the forecast is shown", () => {
    expect(timelineSpanDays([forecast, placed], [], 8, true, 40)).toBe(40);
  });

  it("keeps today and the cycle that contains it when nothing is on the axis", () => {
    expect(timelineSpanDays([forecast], [{ startDay: 0, endDay: 14 }], 8, false, 40)).toBe(14);
  });

  it("rounds a half-day end up to a whole column", () => {
    expect(timelineSpanDays([{ startDay: 1, endDay: 10.5, isCapacityForecast: false }], [], 0, false, 11)).toBe(11);
  });
});
