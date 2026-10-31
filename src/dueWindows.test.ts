import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DUE_WINDOW_CONFIG_STORAGE_KEY,
  DUE_WINDOW_OPTIONS,
  DEFAULT_DUE_WINDOW_CONFIG,
  addCalendarDays,
  dueWindowConfigError,
  dueWindowLabel,
  dueWindowRange,
  getDueWindowConfig,
  loadDueWindowConfig,
  localToday,
  matchesDueWindow,
  parseDueWindowDraft,
  saveDueWindowConfig,
} from "./dueWindows";

const TODAY = "2026-10-22";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  });
  // Read the boundaries back, so the boundaries in effect are the ones the
  // stubbed storage holds.
  loadDueWindowConfig();
});

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

describe("the due-window boundaries", () => {
  it("starts at fourteen days for Next and forty-five for Soon", () => {
    expect(DEFAULT_DUE_WINDOW_CONFIG).toEqual({ nextEndDays: 14, soonEndDays: 45 });
  });

  it("reads the boundaries that are in effect", () => {
    expect(loadDueWindowConfig()).toEqual(DEFAULT_DUE_WINDOW_CONFIG);
  });

  it("stores the boundaries under one versioned key", () => {
    saveDueWindowConfig({ nextEndDays: 30, soonEndDays: 60 });
    expect(localStorage.getItem(DUE_WINDOW_CONFIG_STORAGE_KEY)).toBe('{"nextEndDays":30,"soonEndDays":60}');
    expect(loadDueWindowConfig()).toEqual({ nextEndDays: 30, soonEndDays: 60 });
  });

  it("keeps the boundaries in effect after a change", () => {
    saveDueWindowConfig({ nextEndDays: 21, soonEndDays: 50 });
    expect(getDueWindowConfig()).toEqual({ nextEndDays: 21, soonEndDays: 50 });
  });

  it("refuses an out-of-range pair and keeps the previous boundaries", () => {
    saveDueWindowConfig({ nextEndDays: 30, soonEndDays: 60 });
    expect(saveDueWindowConfig({ nextEndDays: 0, soonEndDays: 60 })).toBe(false);
    expect(saveDueWindowConfig({ nextEndDays: 30, soonEndDays: 400 })).toBe(false);
    expect(saveDueWindowConfig({ nextEndDays: 30, soonEndDays: 10 })).toBe(false);
    expect(getDueWindowConfig()).toEqual({ nextEndDays: 30, soonEndDays: 60 });
  });

  it("reads a stored value that cannot be used as the standard boundaries", () => {
    localStorage.setItem(DUE_WINDOW_CONFIG_STORAGE_KEY, '{"nextEndDays":0,"soonEndDays":0}');
    expect(loadDueWindowConfig()).toEqual(DEFAULT_DUE_WINDOW_CONFIG);
    localStorage.setItem(DUE_WINDOW_CONFIG_STORAGE_KEY, "not-json");
    expect(loadDueWindowConfig()).toEqual(DEFAULT_DUE_WINDOW_CONFIG);
  });

  it("names the boundary that cannot be used", () => {
    expect(dueWindowConfigError({ nextEndDays: 14, soonEndDays: 45 })).toBeNull();
    expect(dueWindowConfigError({ nextEndDays: 0, soonEndDays: 45 })).toContain("between 1 and 90");
    expect(dueWindowConfigError({ nextEndDays: 14, soonEndDays: 10 })).toContain("at least 14");
    expect(dueWindowConfigError({ nextEndDays: 14, soonEndDays: 400 })).toContain("at most 365");
  });

  it("reads a pair of settings fields, or the reason they cannot be used", () => {
    expect(parseDueWindowDraft("30", "60")).toEqual({ ok: true, config: { nextEndDays: 30, soonEndDays: 60 } });
    expect(parseDueWindowDraft("", "60").ok).toBe(false);
    expect(parseDueWindowDraft("abc", "60").ok).toBe(false);
    const conflict = parseDueWindowDraft("30", "10");
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.field).toBe("soon");
  });

  it("puts a Next boundary outside its range back into the field", () => {
    const result = parseDueWindowDraft("200", "60");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.revert).toBe(true);
  });
});

describe("the windows with configured boundaries", () => {
  const config = { nextEndDays: 30, soonEndDays: 60 };

  it("counts Next through the configured Next boundary", () => {
    expect(dueWindowRange("next", TODAY, config)).toEqual({ start: "2026-10-22", end: "2026-11-21" });
    expect(matchesDueWindow("2026-11-21", "next", TODAY, config)).toBe(true);
    expect(matchesDueWindow("2026-11-22", "next", TODAY, config)).toBe(false);
  });

  it("counts Soon from the day after Next through the configured Soon boundary", () => {
    expect(dueWindowRange("soon", TODAY, config)).toEqual({ start: "2026-11-22", end: "2026-12-21" });
    expect(matchesDueWindow("2026-11-22", "soon", TODAY, config)).toBe(true);
    expect(matchesDueWindow("2026-11-21", "soon", TODAY, config)).toBe(false);
    expect(matchesDueWindow("2026-12-21", "soon", TODAY, config)).toBe(true);
    expect(matchesDueWindow("2026-12-22", "soon", TODAY, config)).toBe(false);
  });

  it("counts Later from the day after the configured Soon boundary", () => {
    expect(dueWindowRange("later", TODAY, config)).toEqual({ start: "2026-12-22", end: null });
    expect(matchesDueWindow("2026-12-22", "later", TODAY, config)).toBe(true);
    expect(matchesDueWindow("2026-12-21", "later", TODAY, config)).toBe(false);
  });

  it("keeps Overdue before today and No date without a due date", () => {
    expect(dueWindowRange("overdue", TODAY, config)).toEqual({ start: null, end: "2026-10-21" });
    expect(matchesDueWindow("2026-10-21", "overdue", TODAY, config)).toBe(true);
    expect(matchesDueWindow("2026-10-22", "overdue", TODAY, config)).toBe(false);
    expect(dueWindowRange("none", TODAY, config)).toEqual({ start: null, end: null });
    expect(matchesDueWindow(null, "none", TODAY, config)).toBe(true);
    expect(matchesDueWindow("2026-10-22", "none", TODAY, config)).toBe(false);
  });

  it("puts every date in exactly one window with the configured boundaries", () => {
    const days = ["2026-10-01", "2026-10-22", "2026-11-21", "2026-11-22", "2026-12-21", "2026-12-22"];
    for (const day of days) {
      const windows = DUE_WINDOW_OPTIONS.map((option) => option.id).filter((window) => matchesDueWindow(day, window, TODAY, config));
      expect(windows).toHaveLength(1);
    }
  });
});
