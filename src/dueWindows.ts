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
 * The window boundaries as day offsets from today, both ends inclusive.
 *
 * `null` means the window has no bound on that side. These offsets are the
 * only place the day counts are written down.
 */
const DUE_WINDOW_OFFSETS: Record<DueWindow, { start: number | null; end: number | null }> = {
  overdue: { start: null, end: -1 },
  next: { start: 0, end: 14 },
  soon: { start: 15, end: 45 },
  later: { start: 46, end: null },
  none: { start: null, end: null },
};

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

/** The days a window covers, counted from today. */
export function dueWindowRange(window: DueWindow, today: string): DueWindowRange {
  const offsets = DUE_WINDOW_OFFSETS[window];
  return {
    start: offsets.start === null ? null : addCalendarDays(today, offsets.start),
    end: offsets.end === null ? null : addCalendarDays(today, offsets.end),
  };
}

/** Whether a due date falls in the window, counted from today. */
export function matchesDueWindow(dueDate: string | null | undefined, window: DueWindow, today: string): boolean {
  const day = dueDay(dueDate);
  if (window === "none") return day === null;
  if (day === null) return false;
  const range = dueWindowRange(window, today);
  if (range.start !== null && day < range.start) return false;
  if (range.end !== null && day > range.end) return false;
  return true;
}
