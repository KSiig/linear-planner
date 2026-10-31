/**
 * The one due-window definition of the planner.
 *
 * The Due filter, the Overview cards, and the saved-view query all group
 * issues by the same windows, so the boundaries are written down once here.
 * A due date lands in the same window on every surface.
 */

/** The windows the planner groups issues into. */
export type DueWindow = "overdue" | "next" | "soon" | "later" | "none";

/**
 * The boundaries of the Next and Soon windows, counted in days from today.
 *
 * The boundaries are browser-global. One browser uses the same boundaries for
 * every project it opens.
 */
export interface DueWindowConfig {
  /** The last day the Next window covers, today included. */
  nextEndDays: number;
  /** The last day the Soon window covers. */
  soonEndDays: number;
}

/** The boundaries a browser uses until someone changes them. */
export const DEFAULT_DUE_WINDOW_CONFIG: DueWindowConfig = { nextEndDays: 14, soonEndDays: 45 };

/** The key the boundaries live under. The version marks the stored shape. */
export const DUE_WINDOW_CONFIG_STORAGE_KEY = "linear-planner:due-windows:v1";

/** The smallest Next boundary a browser accepts. */
export const NEXT_END_DAYS_MIN = 1;

/** The largest Next boundary a browser accepts. */
export const NEXT_END_DAYS_MAX = 90;

/** The largest Soon boundary a browser accepts. */
export const SOON_END_DAYS_MAX = 365;

/**
 * The boundaries in effect in this browser.
 *
 * They are read from storage the first time they are needed, so a browser
 * that stored boundaries keeps them across a reload.
 */
let currentConfig: DueWindowConfig | null = null;

/** The Due filter options, in the order the filter lists them. */
export const DUE_WINDOW_OPTIONS: ReadonlyArray<{ id: DueWindow; label: string }> = [
  { id: "overdue", label: "Overdue" },
  { id: "next", label: "Next" },
  { id: "soon", label: "Soon" },
  { id: "later", label: "Later" },
  { id: "none", label: "No date" },
];

/** The name of a window, as the filter and the chips show it. */
export function dueWindowLabel(window: DueWindow): string {
  return DUE_WINDOW_OPTIONS.find((option) => option.id === window)?.label ?? window;
}

/**
 * Why a pair of boundaries cannot be used, or null when the pair is usable.
 *
 * The Next boundary counts the days the Next window covers, and the Soon
 * boundary counts the days the Soon window ends on. Soon always starts after
 * Next ends, so the Soon boundary is never below the Next boundary.
 */
export function dueWindowConfigError(config: DueWindowConfig): string | null {
  if (!Number.isInteger(config.nextEndDays)) return "Next must be a whole number of days.";
  if (config.nextEndDays < NEXT_END_DAYS_MIN || config.nextEndDays > NEXT_END_DAYS_MAX) {
    return `Next must be between ${NEXT_END_DAYS_MIN} and ${NEXT_END_DAYS_MAX} days.`;
  }
  if (!Number.isInteger(config.soonEndDays)) return "Soon must be a whole number of days.";
  if (config.soonEndDays < config.nextEndDays) return `Soon must be at least ${config.nextEndDays} days.`;
  if (config.soonEndDays > SOON_END_DAYS_MAX) return `Soon must be at most ${SOON_END_DAYS_MAX} days.`;
  return null;
}

/** True when the value holds a pair of boundaries the planner can use. */
function isDueWindowConfig(value: unknown): value is DueWindowConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { nextEndDays?: unknown; soonEndDays?: unknown };
  if (typeof candidate.nextEndDays !== "number" || typeof candidate.soonEndDays !== "number") return false;
  const config: DueWindowConfig = { nextEndDays: candidate.nextEndDays, soonEndDays: candidate.soonEndDays };
  return dueWindowConfigError(config) === null;
}

/**
 * The boundaries stored in this browser.
 *
 * A browser that stored nothing, or stored something unreadable, uses the
 * standard boundaries.
 */
export function loadDueWindowConfig(): DueWindowConfig {
  try {
    const raw = localStorage.getItem(DUE_WINDOW_CONFIG_STORAGE_KEY);
    if (raw === null) return DEFAULT_DUE_WINDOW_CONFIG;
    const parsed: unknown = JSON.parse(raw);
    if (!isDueWindowConfig(parsed)) return DEFAULT_DUE_WINDOW_CONFIG;
    return parsed;
  } catch {
    return DEFAULT_DUE_WINDOW_CONFIG;
  }
}

/**
 * The boundaries in effect right now.
 *
 * They come from storage the first time they are asked for, and from the last
 * change after that.
 */
export function getDueWindowConfig(): DueWindowConfig {
  if (currentConfig === null) currentConfig = loadDueWindowConfig();
  return currentConfig;
}

/**
 * Store the boundaries and make them the ones in effect.
 *
 * The boundaries are browser-global: they apply to every project. An invalid
 * pair is rejected, and the boundaries in effect stay the previous ones.
 */
export function saveDueWindowConfig(config: DueWindowConfig): boolean {
  if (dueWindowConfigError(config) !== null) return false;
  currentConfig = { nextEndDays: config.nextEndDays, soonEndDays: config.soonEndDays };
  try {
    localStorage.setItem(DUE_WINDOW_CONFIG_STORAGE_KEY, JSON.stringify(currentConfig));
  } catch {
    // A browser that refuses storage still uses the boundaries for this session.
  }
  return true;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day an ISO date names, read in the local time zone. */
export function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The current calendar day as `YYYY-MM-DD`, in the local time zone. */
export function localToday(now: Date): string {
  return formatLocal(now);
}

/** The day `days` calendar days after `isoDate`, without a time zone. */
export function addCalendarDays(isoDate: string, days: number): string {
  const date = parseLocalDate(isoDate);
  return formatLocal(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** The due day of an issue, or null when the issue has no due date. */
function dueDay(dueDate: string | null | undefined): string | null {
  if (dueDate == null || dueDate === "") return null;
  return dueDate.slice(0, 10);
}

/** The days a window covers. A null bound means the window is open on that side. */
export interface DueWindowRange {
  /** The first day of the window, inclusive. */
  start: string | null;
  /** The last day of the window, inclusive. */
  end: string | null;
}

/**
 * The window boundaries as day offsets from today, both ends inclusive.
 *
 * `null` means the window has no bound on that side. The offsets follow the
 * boundaries, so they are computed rather than written down.
 */
function dueWindowOffsets(window: DueWindow, config: DueWindowConfig): { start: number | null; end: number | null } {
  switch (window) {
    case "overdue":
      return { start: null, end: -1 };
    case "next":
      return { start: 0, end: config.nextEndDays };
    case "soon":
      return { start: config.nextEndDays + 1, end: config.soonEndDays };
    case "later":
      return { start: config.soonEndDays + 1, end: null };
    case "none":
      return { start: null, end: null };
  }
}

/**
 * The days a window covers, counted from today.
 *
 * The boundaries decide how far Next and Soon reach. Overdue is every day
 * before today and No date is every day without a due date, so neither one
 * depends on the boundaries.
 *
 * Without a configuration the window uses the standard boundaries. The cards
 * that follow the configured boundaries pass the current configuration.
 */
export function dueWindowRange(
  window: DueWindow,
  today: string,
  config: DueWindowConfig = DEFAULT_DUE_WINDOW_CONFIG,
): DueWindowRange {
  const offsets = dueWindowOffsets(window, config);
  return {
    start: offsets.start === null ? null : addCalendarDays(today, offsets.start),
    end: offsets.end === null ? null : addCalendarDays(today, offsets.end),
  };
}

/** Whether a due date falls in the window, counted from today. */
export function matchesDueWindow(
  dueDate: string | null | undefined,
  window: DueWindow,
  today: string,
  config: DueWindowConfig = DEFAULT_DUE_WINDOW_CONFIG,
): boolean {
  const day = dueDay(dueDate);
  if (window === "none") return day === null;
  if (day === null) return false;
  const range = dueWindowRange(window, today, config);
  if (range.start !== null && day < range.start) return false;
  if (range.end !== null && day > range.end) return false;
  return true;
}
