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

/**
 * The calendar day of an ISO timestamp.
 *
 * An issue without a completion time has no completion day, so it is not in
 * the window.
 */
function calendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/** Most recently completed first, then identifier. */
function compareIssues(left: OverviewIssue, right: OverviewIssue): number {
  if ((left.completedAt ?? "") !== (right.completedAt ?? "")) {
    return (left.completedAt ?? "") < (right.completedAt ?? "") ? 1 : -1;
  }
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

export const recentlyCompletedCard = defineCard({
  id: "recently-completed",
  async load(ctx) {
    const start = addCalendarDays(ctx.today, -(RECENCY_WINDOW_DAYS - 1));
    const rows = ctx.issues
      .map((issue) => ({ issue, day: calendarDay(issue.completedAt) }))
      .filter((entry) => entry.day !== null && entry.day >= start && entry.day <= ctx.today)
      .sort((left, right) => compareIssues(left.issue, right.issue))
      .map((entry) => toRow(entry.issue, entry.day as string));

    if (rows.length === 0) return null;

    return {
      title: "Recently Completed",
      subtitle: "last 14 days",
      sections: [{ rows }],
    };
  },
});
