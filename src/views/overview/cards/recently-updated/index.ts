import "./index.css";
import { addCalendarDays, shortDay } from "../../calendar";
import { defineCard, type CardRow, type OverviewIssue } from "../shell/contract";

/**
 * How many calendar days the recency window covers, today included.
 *
 * This window is fixed. It is not the configurable Next, Soon, or Later due
 * window, so it is computed from the calendar helper instead of the due-window
 * module.
 */
const RECENCY_WINDOW_DAYS = 14;

/** Linear's priority values, ordered from the most urgent to the least. */
const PRIORITY_RANK: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  0: 4,
};

function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

/**
 * The calendar day of an ISO timestamp.
 *
 * An issue without an update time has no update day, so it is not in the
 * window.
 */
function calendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/** Most recently updated first, then priority, then identifier. */
function compareIssues(left: OverviewIssue, right: OverviewIssue): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt < right.updatedAt ? 1 : -1;
  const byPriority = (PRIORITY_RANK[left.priority] ?? 4) - (PRIORITY_RANK[right.priority] ?? 4);
  if (byPriority !== 0) return byPriority;
  return left.identifier.localeCompare(right.identifier);
}

function toRow(issue: OverviewIssue, day: string): CardRow {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    trailing: shortDay(day),
    projectName: issue.project?.name ?? "",
  };
}

export const recentlyUpdatedCard = defineCard({
  id: "recently-updated",
  async load(ctx) {
    const start = addCalendarDays(ctx.today, -(RECENCY_WINDOW_DAYS - 1));
    const rows = ctx.issues
      .filter((issue) => isOpen(issue))
      .map((issue) => ({ issue, day: calendarDay(issue.updatedAt) }))
      .filter((entry) => entry.day !== null && entry.day >= start && entry.day <= ctx.today)
      .sort((left, right) => compareIssues(left.issue, right.issue))
      .map((entry) => toRow(entry.issue, entry.day as string));

    if (rows.length === 0) return null;

    return {
      title: "Recently Updated",
      subtitle: "last 14 days",
      sections: [{ rows }],
    };
  },
});
