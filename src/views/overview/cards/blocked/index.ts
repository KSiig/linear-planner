import "./index.css";
import { shortDay } from "../../calendar";
import { defineCard, type CardRow, type OverviewIssue } from "../shell/contract";

/**
 * The workflow state types of an issue that has not entered a started state.
 *
 * A configured terminal state is always a started-type state, so an issue in
 * one of these two types is never done. The state type is the fact here, not
 * the moment the issue was started.
 */
const NOT_STARTED_STATE_TYPES = new Set(["unstarted", "backlog"]);

/** Linear's priority values, ordered from the most urgent to the least. */
const PRIORITY_RANK: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  0: 4,
};

/**
 * True when the issue has not entered a started state.
 *
 * The workflow state type is the fact. The moment the issue was started is
 * not used, because a start time alone does not say whether the issue is
 * still waiting to begin.
 */
function hasNotStarted(issue: OverviewIssue): boolean {
  return NOT_STARTED_STATE_TYPES.has(issue.state.type);
}

/**
 * True when another open issue blocks this one.
 *
 * A `blocks` relation node lives on the blocker and names the blocked issue.
 * The canonical projection reads that inverse direction as `blockedBy`, and
 * every entry keeps the relation node id used to remove the relation. An
 * issue without a blocking relation is not blocked.
 */
function hasOpenBlocker(issue: OverviewIssue): boolean {
  const blockers = issue.blockedBy ?? [];
  return blockers.some((relation) => relation.issue.isOpen);
}

/**
 * Oldest due date first, then priority, then identifier.
 *
 * Issues without a due date follow the dated ones.
 */
function compareIssues(left: OverviewIssue, right: OverviewIssue): number {
  if (left.dueDate !== null && right.dueDate === null) return -1;
  if (left.dueDate === null && right.dueDate !== null) return 1;
  if (left.dueDate !== null && right.dueDate !== null) {
    const byDate = left.dueDate.localeCompare(right.dueDate);
    if (byDate !== 0) return byDate;
  }
  const byPriority = (PRIORITY_RANK[left.priority] ?? 4) - (PRIORITY_RANK[right.priority] ?? 4);
  if (byPriority !== 0) return byPriority;
  return left.identifier.localeCompare(right.identifier);
}

function toRow(issue: OverviewIssue): CardRow {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    trailing: issue.dueDate === null ? "" : shortDay(issue.dueDate),
    projectName: issue.project?.name ?? "",
  };
}

export const blockedCard = defineCard({
  id: "blocked",
  async load(ctx) {
    const rows = ctx.issues
      .filter((issue) => hasNotStarted(issue) && hasOpenBlocker(issue))
      .sort(compareIssues)
      .map(toRow);

    if (rows.length === 0) return null;

    return {
      title: "Blocked",
      sections: [{ rows }],
    };
  },
});
