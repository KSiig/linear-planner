import { describe, expect, it } from "vitest";
import { addCalendarDays, localToday, shortDay, shortMonthYear } from "./calendar";

describe("calendar", () => {
  it("reads the calendar days from the due-window module", () => {
    expect(addCalendarDays("2026-10-22", 14)).toBe("2026-11-05");
    expect(localToday(new Date(2026, 9, 22))).toBe("2026-10-22");
  });

  it("formats short day and month labels", () => {
    expect(shortDay("2026-10-12")).toBe("12 Oct");
    expect(shortDay("2026-11-05")).toBe("5 Nov");
    expect(shortMonthYear("2027-03-01")).toBe("Mar 2027");
  });
});
