import type { LinearIssue } from "./linear";
import { addCalendarDays } from "./views/overview/calendar";

/** Workflow state type Linear reports for a finished issue. */
const COMPLETED_STATE_TYPE = "completed";

/** Workflow state type Linear reports for an abandoned issue. */
const CANCELED_STATE_TYPE = "canceled";

/** How many calendar days ahead of today a due date still counts as "due soon". */
export const DUE_SOON_WINDOW_DAYS = 14;

/** The calendar day (`YYYY-MM-DD`) of an ISO timestamp or a `YYYY-MM-DD` date. */
function calendarDate(value: string): string {
  return value.slice(0, 10);
}

/**
 * True while the issue still needs work: its workflow state type is neither
 * `completed` nor `canceled`.
 *
 * This is a statement about the workflow state type only. It never looks at
 * estimates, workers, durations or dates.
 */
export function isOpenIssue(issue: LinearIssue): boolean {
  return issue.state.type !== COMPLETED_STATE_TYPE && issue.state.type !== CANCELED_STATE_TYPE;
}

/**
 * True when the issue sits in a terminal state.
 *
 * A `completed`-type state is always terminal. Custom terminal states — for
 * example "Merged", which Linear reports as a started-type state — are terminal
 * when their workflow state id is part of `doneStateIds`. The comparison is on
 * ids, never on state names, so no name heuristic takes part in it.
 */
export function isDoneIssue(issue: LinearIssue, doneStateIds: ReadonlySet<string>): boolean {
  if (issue.state.type === COMPLETED_STATE_TYPE) return true;
  return doneStateIds.has(issue.state.id);
}

/**
 * True when an open issue has a due date that already passed.
 *
 * `today` is a local calendar date (`YYYY-MM-DD`). The comparison is on calendar
 * days, so a due date later on the same day is not overdue.
 */
export function isOverdueIssue(issue: LinearIssue, today: string): boolean {
  if (!isOpenIssue(issue)) return false;
  if (!issue.dueDate) return false;
  return calendarDate(issue.dueDate) < today;
}

/** Labels the timeline puts on the facts it projects. */
export const TIMELINE_LABELS = {
  due: "Due",
  enteredStartedStatus: "Entered started status",
  completed: "Completed",
  statusHistory: "In started status",
} as const;

/** Every label a timeline event can carry. */
export type TimelineLabel = (typeof TIMELINE_LABELS)[keyof typeof TIMELINE_LABELS];

/** A fact that happens on one day. */
export interface TimelinePointEvent {
  kind: "point";
  fact: "due" | "enteredStartedStatus" | "completed";
  /** Calendar day (`YYYY-MM-DD`) the fact happened on. */
  date: string;
  label: TimelineLabel;
}

/** A fact that holds from one day until another. */
export interface TimelineSpanEvent {
  kind: "span";
  fact: "statusHistory";
  /** Calendar day (`YYYY-MM-DD`) the span starts on. */
  startDate: string;
  /** Calendar day (`YYYY-MM-DD`) the span ends on. */
  endDate: string;
  label: TimelineLabel;
}

export type TimelineEvent = TimelinePointEvent | TimelineSpanEvent;

/** Order the facts of one kind are laid out in when they share a day. */
const EVENT_ORDER: Record<TimelineEvent["fact"], number> = {
  enteredStartedStatus: 0,
  due: 1,
  completed: 2,
  statusHistory: 3,
};

function eventDate(event: TimelineEvent): string {
  return event.kind === "span" ? event.startDate : event.date;
}

/** Chronological order, with a fixed order for facts that share a day. */
function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((left, right) => {
    const byDate = eventDate(left).localeCompare(eventDate(right));
    if (byDate !== 0) return byDate;
    return EVENT_ORDER[left.fact] - EVENT_ORDER[right.fact];
  });
}

/**
 * The facts an issue's own dates support, as timeline events.
 *
 * The events are the issue's own dates and nothing else: a due date, the moment
 * the issue entered a started status, and the moment it was completed. A start
 * is never inferred from a due date, and a dependency never moves an event.
 *
 * Point events are the default representation. The only span is the status
 * history, and it exists only when the issue both entered a started status and
 * was completed.
 */
export function getIssueTimelineFacts(issue: LinearIssue): TimelineEvent[] {
  const started = issue.startedAt ? calendarDate(issue.startedAt) : null;
  const completed = issue.completedAt ? calendarDate(issue.completedAt) : null;
  const due = issue.dueDate ? calendarDate(issue.dueDate) : null;

  const events: TimelineEvent[] = [];

  if (started !== null) {
    events.push({
      kind: "point",
      fact: "enteredStartedStatus",
      date: started,
      label: TIMELINE_LABELS.enteredStartedStatus,
    });
  }
  if (due !== null) {
    events.push({ kind: "point", fact: "due", date: due, label: TIMELINE_LABELS.due });
  }
  if (completed !== null) {
    events.push({ kind: "point", fact: "completed", date: completed, label: TIMELINE_LABELS.completed });
  }
  if (started !== null && completed !== null) {
    events.push({
      kind: "span",
      fact: "statusHistory",
      startDate: started,
      endDate: completed,
      label: TIMELINE_LABELS.statusHistory,
    });
  }

  return sortTimelineEvents(events);
}

/** An issue that still blocks another issue. */
export interface OpenBlocker {
  /** Id of the blocking issue. */
  blockerId: string;
  /** Identifier of the blocking issue (for example `ABC-12`). */
  blockerIdentifier: string;
  /** Id of the `blocks` relation node — the id used to remove the relation. */
  relationId: string;
}

/**
 * Index the open blockers by the issue they block.
 *
 * A `blocks` relation node lives on the *blocker* and points at the blocked
 * issue through `relatedIssue`, so the blockers of an issue are the issues that
 * hold a `blocks` node naming it.
 */
function indexOpenBlockers(issues: readonly LinearIssue[]): Map<string, OpenBlocker[]> {
  const blockersByBlockedId = new Map<string, OpenBlocker[]>();
  for (const candidate of issues) {
    if (!isOpenIssue(candidate)) continue;
    for (const node of candidate.relations.nodes) {
      if (node.type !== "blocks") continue;
      const blockedId = node.relatedIssue.id;
      if (blockedId === candidate.id) continue;
      const blocker: OpenBlocker = {
        blockerId: candidate.id,
        blockerIdentifier: candidate.identifier,
        relationId: node.id,
      };
      const list = blockersByBlockedId.get(blockedId);
      if (list) list.push(blocker);
      else blockersByBlockedId.set(blockedId, [blocker]);
    }
  }
  return blockersByBlockedId;
}

/**
 * The open issues that block `issue`, with the relation id that removes each
 * blocking relation.
 */
export function getOpenBlockers(issue: LinearIssue, issues: readonly LinearIssue[]): OpenBlocker[] {
  return indexOpenBlockers(issues).get(issue.id) ?? [];
}

/** The counts every issue collection is summarised by. */
interface CoreCounts {
  open: number;
  completed: number;
  overdue: number;
}

function countCoreFacts(
  issues: readonly LinearIssue[],
  doneStateIds: ReadonlySet<string>,
  today: string,
): CoreCounts {
  let open = 0;
  let completed = 0;
  let overdue = 0;
  for (const issue of issues) {
    if (isDoneIssue(issue, doneStateIds)) completed += 1;
    if (!isOpenIssue(issue)) continue;
    open += 1;
    if (isOverdueIssue(issue, today)) overdue += 1;
  }
  return { open, completed, overdue };
}

/** Factual counts of a project's issues. */
export interface ProjectFactsSummary {
  /** Issues whose workflow state type is neither completed nor canceled. */
  open: number;
  /** Issues in a terminal state: a completed-type state or a configured terminal state id. */
  completed: number;
  /** Open issues whose due date already passed. */
  overdue: number;
  /** Open issues due within the next 14 calendar days, today included. */
  dueSoon: number;
  /** Issues that are unstarted or backlog, are not done, and have an open blocker. */
  blocked: number;
  /** Open issues without a due date. */
  noDueDate: number;
}

/**
 * Factual counts of a project's issues.
 *
 * Every count is read off the issues themselves: no estimate, worker count,
 * duration, workday count, capacity or theoretical completion date is involved.
 */
export function getProjectFactsSummary(
  issues: readonly LinearIssue[],
  doneStateIds: ReadonlySet<string>,
  today: string,
): ProjectFactsSummary {
  const core = countCoreFacts(issues, doneStateIds, today);
  const dueSoonEnd = addCalendarDays(today, DUE_SOON_WINDOW_DAYS);
  const blockersByBlockedId = indexOpenBlockers(issues);

  let dueSoon = 0;
  let blocked = 0;
  let noDueDate = 0;

  for (const issue of issues) {
    if (isOpenIssue(issue)) {
      if (!issue.dueDate) {
        noDueDate += 1;
      } else {
        const due = calendarDate(issue.dueDate);
        if (due >= today && due <= dueSoonEnd) dueSoon += 1;
      }
    }

    const unstarted = issue.state.type === "unstarted" || issue.state.type === "backlog";
    if (!unstarted) continue;
    if (isDoneIssue(issue, doneStateIds)) continue;
    if ((blockersByBlockedId.get(issue.id)?.length ?? 0) > 0) blocked += 1;
  }

  return { ...core, dueSoon, blocked, noDueDate };
}

/** Factual values of a milestone's issues. */
export interface MilestoneFactsSummary {
  /** Issues in the milestone. */
  total: number;
  /** Issues whose workflow state type is neither completed nor canceled. */
  open: number;
  /** Issues in a terminal state: a completed-type state or a configured terminal state id. */
  completed: number;
  /** Open issues whose due date already passed. */
  overdue: number;
  /** Earliest due date among the milestone's issues, or null when none has one. */
  earliestDueDate: string | null;
  /** Latest due date among the milestone's issues, or null when none has one. */
  latestDueDate: string | null;
}

/**
 * Factual values of a milestone's issues.
 *
 * `issues` holds the issues of the milestone. Nothing is derived from estimates,
 * durations or dependencies.
 */
export function getMilestoneFactsSummary(
  issues: readonly LinearIssue[],
  doneStateIds: ReadonlySet<string>,
  today: string,
): MilestoneFactsSummary {
  const core = countCoreFacts(issues, doneStateIds, today);

  let earliestDueDate: string | null = null;
  let latestDueDate: string | null = null;
  for (const issue of issues) {
    if (!issue.dueDate) continue;
    const due = calendarDate(issue.dueDate);
    if (earliestDueDate === null || due < earliestDueDate) earliestDueDate = due;
    if (latestDueDate === null || due > latestDueDate) latestDueDate = due;
  }

  return { total: issues.length, ...core, earliestDueDate, latestDueDate };
}
