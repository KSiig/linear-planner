import type { CyclePeriod } from "./scheduler";

export const ROW_HEIGHT = 36;
export const ROW_GAP = 4;
export const CYCLE_ROW_HEIGHT = 22;
export const DATE_ROW_HEIGHT = 50;
export const HEADER_HEIGHT = CYCLE_ROW_HEIGHT + DATE_ROW_HEIGHT;
export const DAY_WIDTH = 40;
export const LABEL_WIDTH = 220;

export interface DayInfo {
  day: number; // calendar day offset
  col: number; // visual column index
  date: Date;
  isGrayed: boolean; // non-working or outside cycle
  isMonday: boolean;
  isCycleEnd: boolean;
  isCycleStart: boolean;
}

/**
 * How many calendar columns the timeline should allocate.
 * With the capacity forecast off, unstarted issues that have no due date must not stretch
 * the chart. The span still covers today, every bar that stays on the axis, and any cycle
 * that holds one of those.
 */
export function timelineSpanDays(
  issues: Array<{ startDay: number; endDay: number; isCapacityForecast: boolean }>,
  cycles: Array<{ startDay: number; endDay: number }>,
  todayOffset: number,
  showCapacityForecast: boolean,
  scheduleTotalDays: number,
): number {
  if (showCapacityForecast) return Math.max(Math.ceil(scheduleTotalDays), 1);
  const axis = issues.filter((issue) => !issue.isCapacityForecast);
  let end = Math.max(Math.ceil(todayOffset) + 1, 1);
  for (const issue of axis) end = Math.max(end, Math.ceil(issue.endDay));
  for (const cycle of cycles) {
    const holdsAxis = axis.some((issue) => issue.startDay < cycle.endDay && issue.endDay > cycle.startDay);
    const holdsToday = todayOffset >= cycle.startDay && todayOffset < cycle.endDay;
    if (holdsAxis || holdsToday) end = Math.max(end, Math.ceil(cycle.endDay));
  }
  return Math.max(end, 1);
}

export function isOutsideCycles(day: number, cycles: CyclePeriod[]): boolean {
  if (cycles.length === 0) return false;
  return !cycles.some((c) => day >= c.startDay && day < c.endDay);
}

/**
 * Maximal runs of non-working days a bar spans *through* — weekends, bank holidays and
 * cooldowns alike: the work stopped before the run and resumed after it. A run touching the
 * bar's first or last day is left out; the issue started or finished in there, which isn't a
 * pause in the work.
 *
 * `startDay`/`endDay` are the bar's fractional calendar bounds (endDay exclusive); the returned
 * pairs are inclusive whole-day ranges.
 */
export function crossedNonWorkingRuns(
  startDay: number,
  endDay: number,
  isNonWorkingDay: (day: number) => boolean,
): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  const firstDay = Math.floor(startDay);
  const lastDay = Math.ceil(endDay) - 1;
  let runStart = -1;
  for (let d = firstDay; d <= lastDay; d++) {
    if (isNonWorkingDay(d)) {
      if (runStart < 0) runStart = d;
    } else if (runStart >= 0) {
      if (runStart > firstDay) runs.push([runStart, d - 1]);
      runStart = -1;
    }
  }
  // A run still open on the last day means the bar ends inside it — not a crossing.
  return runs;
}
