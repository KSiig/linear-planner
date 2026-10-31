import { describe, expect, it } from "vitest";
import {
  DUE_WINDOW_OPTIONS,
  addCalendarDays,
  dueWindowLabel,
  dueWindowRange,
  localToday,
  matchesDueWindow,
} from "./dueWindows";

const TODAY = "2026-10-22";

describe("the calendar days", () => {
  it("adds calendar days without parsing the date-only string", () => {
    expect(addCalendarDays("2026-10-22", 14)).toBe("2026-11-05");
    expect(addCalendarDays("2026-10-22", 45)).toBe("2026-12-06");
    expect(addCalendarDays("2026-10-05", 15)).toBe("2026-10-20");
    expect(addCalendarDays("2026-10-05", 45)).toBe("2026-11-19");
  });

  it("formats the local today", () => {
    expect(localToday(new Date(2026, 9, 22))).toBe("2026-10-22");
  });
});

describe("the due windows", () => {
  it("counts a date before today as overdue", () => {
    expect(matchesDueWindow("2026-10-21", "overdue", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-10-22", "overdue", TODAY)).toBe(false);
    expect(matchesDueWindow("2026-10-23", "overdue", TODAY)).toBe(false);
  });

  it("counts today and the next fourteen days as next", () => {
    expect(matchesDueWindow("2026-10-22", "next", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-11-05", "next", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-11-06", "next", TODAY)).toBe(false);
    expect(matchesDueWindow("2026-10-21", "next", TODAY)).toBe(false);
  });

  it("counts day fifteen through day forty-five as soon", () => {
    expect(matchesDueWindow("2026-11-06", "soon", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-12-06", "soon", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-11-05", "soon", TODAY)).toBe(false);
    expect(matchesDueWindow("2026-12-07", "soon", TODAY)).toBe(false);
  });

  it("counts day forty-six and later as later", () => {
    expect(matchesDueWindow("2026-12-07", "later", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-12-06", "later", TODAY)).toBe(false);
  });

  it("counts a missing due date as no date", () => {
    expect(matchesDueWindow(null, "none", TODAY)).toBe(true);
    expect(matchesDueWindow(undefined, "none", TODAY)).toBe(true);
    expect(matchesDueWindow("", "none", TODAY)).toBe(true);
    expect(matchesDueWindow("2026-10-22", "none", TODAY)).toBe(false);
    expect(matchesDueWindow(null, "next", TODAY)).toBe(false);
  });

  it("gives every window the range its boundaries name", () => {
    expect(dueWindowRange("overdue", TODAY)).toEqual({ start: null, end: "2026-10-21" });
    expect(dueWindowRange("next", TODAY)).toEqual({ start: "2026-10-22", end: "2026-11-05" });
    expect(dueWindowRange("soon", TODAY)).toEqual({ start: "2026-11-06", end: "2026-12-06" });
    expect(dueWindowRange("later", TODAY)).toEqual({ start: "2026-12-07", end: null });
  });

  it("puts every date in exactly one window", () => {
    const days = ["2026-10-01", "2026-10-22", "2026-11-05", "2026-11-06", "2026-12-06", "2026-12-07"];
    for (const day of days) {
      const windows = DUE_WINDOW_OPTIONS.map((option) => option.id).filter((window) => matchesDueWindow(day, window, TODAY));
      expect(windows).toHaveLength(1);
    }
  });

  it("names every window once", () => {
    expect(DUE_WINDOW_OPTIONS.map((option) => option.label)).toEqual(["Overdue", "Next", "Soon", "Later", "No date"]);
    expect(dueWindowLabel("none")).toBe("No date");
    expect(dueWindowLabel("soon")).toBe("Soon");
  });
});
