import { describe, expect, it } from "vitest";
import { addCalendarDays, localToday, shortDay, shortMonthYear } from "./calendar";

describe("calendar", () => {
  it("adds calendar days without parsing the date-only string", () => {
    expect(addCalendarDays("2026-10-22", 14)).toBe("2026-11-05");
    expect(addCalendarDays("2026-10-22", 45)).toBe("2026-12-06");
    expect(addCalendarDays("2026-10-05", 15)).toBe("2026-10-20");
    expect(addCalendarDays("2026-10-05", 45)).toBe("2026-11-19");
  });

  it("formats a local today", () => {
    expect(localToday(new Date(2026, 9, 22))).toBe("2026-10-22");
  });

  it("formats short day and month labels", () => {
    expect(shortDay("2026-10-12")).toBe("12 Oct");
    expect(shortDay("2026-11-05")).toBe("5 Nov");
    expect(shortMonthYear("2027-03-01")).toBe("Mar 2027");
  });
});
