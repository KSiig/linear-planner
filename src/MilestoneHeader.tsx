import { useMemo, type CSSProperties } from "react";
import type { LinearIssue } from "./linear";
import { getMilestoneFactsSummary, type MilestoneFactsSummary } from "./issueFacts";
import { localToday } from "./views/overview/calendar";

/**
 * The facts a milestone summary is built from.
 *
 * Every field is optional so a milestone renders before its issues are loaded:
 * an empty milestone then reads as zero counts and no date range.
 */
export interface MilestoneSummaryProps {
  /** The milestone's issues, exactly as Linear reports them. */
  issues?: readonly LinearIssue[];
  /** The workflow state ids the project treats as terminal. */
  doneStateIds?: ReadonlySet<string>;
  /** The current calendar day (`YYYY-MM-DD`). */
  today?: string;
}

/** No workflow state is configured as terminal. */
const NO_DONE_STATES: ReadonlySet<string> = new Set<string>();

/** `2026-03-01` → `1 Mar 2026`. */
function formatDueDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The issue counts of a milestone: total, open and completed. */
function countLine(summary: MilestoneFactsSummary): string {
  const total = `${summary.total} issue${summary.total !== 1 ? "s" : ""}`;
  return `${total} · ${summary.open} open · ${summary.completed} completed`;
}

/** The overdue count of a milestone. */
function overdueLine(summary: MilestoneFactsSummary): string {
  return `${summary.overdue} overdue`;
}

/**
 * The due-date window of a milestone, or null when no issue in it has a due
 * date. A milestone whose issues share one due date shows that date, not a
 * range.
 */
function dueRangeLine(summary: MilestoneFactsSummary): string | null {
  const { earliestDueDate, latestDueDate } = summary;
  if (!earliestDueDate || !latestDueDate) return null;
  if (earliestDueDate === latestDueDate) return formatDueDate(earliestDueDate);
  return `${formatDueDate(earliestDueDate)} – ${formatDueDate(latestDueDate)}`;
}

const nameStyle: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--iteration-line)" };
const lineStyle: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-muted)" };
const boldLineStyle: CSSProperties = { ...lineStyle, fontWeight: 600 };

const bandNameStyle: CSSProperties = { textTransform: "uppercase", letterSpacing: "0.06em" };
const bandCountStyle: CSSProperties = { color: "var(--text)", fontWeight: 600, letterSpacing: 0 };
const bandMutedStyle: CSSProperties = { color: "var(--text-muted)", fontWeight: 500, letterSpacing: 0 };

/**
 * The facts of one milestone: counts and due-date window, nothing else.
 *
 * The counts come from the shared fact helpers, so a milestone and the global
 * bar count the same things the same way.
 */
function useMilestoneSummary({ issues = [], doneStateIds = NO_DONE_STATES, today = localToday(new Date()) }: MilestoneSummaryProps) {
  return useMemo(
    () => getMilestoneFactsSummary(issues, doneStateIds, today),
    [issues, doneStateIds, today],
  );
}

/**
 * One line for a phone milestone band: name, counts and the due-date window.
 *
 * A milestone with no due date shows no date range.
 */
export function MilestoneBandLabel({ name, ...summaryProps }: { name: string } & MilestoneSummaryProps) {
  const summary = useMilestoneSummary(summaryProps);
  const dueRange = dueRangeLine(summary);
  return (
    <>
      <span style={bandNameStyle}>{name}</span>
      <span style={bandCountStyle}> · {countLine(summary)}</span>
      <span style={bandMutedStyle}> · {overdueLine(summary)}</span>
      {dueRange && <span style={bandMutedStyle}> · {dueRange}</span>}
    </>
  );
}

/**
 * The header of a milestone band on a wide layout.
 *
 * It shows what the milestone holds and when it is due: the total, open and
 * completed counts, the overdue count and the window its due dates span. No
 * estimate, worker count, workday count, remaining work or schedule verdict
 * takes part, and a started timestamp is never shown as work started.
 */
export function MilestoneHeader({ name, ...summaryProps }: { name: string } & MilestoneSummaryProps) {
  const summary = useMilestoneSummary(summaryProps);
  const dueRange = dueRangeLine(summary);
  return (
    <>
      <span style={nameStyle} title={name}>
        {name}
      </span>
      <span style={boldLineStyle}>{countLine(summary)}</span>
      <span style={lineStyle}>{overdueLine(summary)}</span>
      {dueRange && <span style={lineStyle}>{dueRange}</span>}
    </>
  );
}
