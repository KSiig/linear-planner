import type { LinearIssue, LinearWorkflowState } from "./linear";
import { isDoneIssue } from "./issueFacts";
import { getStateProgress } from "./workflowState";

/**
 * An issue as the tree draws it: facts only.
 *
 * Every field is read off the issue Linear reported — its workflow state, its
 * milestone, its dates, its relations. No estimate, worker count, duration,
 * workday count or capacity forecast takes part.
 */
export interface TreeIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  /** The milestone the issue belongs to, or null when it has none. */
  milestone: { id: string; name: string; sortOrder: number } | null;
  stateName: string;
  stateType: string;
  stateColor: string;
  /** How far the issue sits in the started states of the workflow, between 0 and 1. */
  stateProgress: number;
  priority: number;
  priorityLabel: string;
  assigneeAvatarUrl: string | null;
  assigneeName: string | null;
  labels: Array<{ name: string; color: string }>;
  /** True when the issue sits in a terminal state. */
  done: boolean;
  /** The issues that block this one, with the relation id that removes each relation. */
  blockedBy: Array<{ id: string; identifier: string; title: string; done: boolean; relationId: string }>;
  /** The Linear due date (`YYYY-MM-DD`), or null when the issue has none. */
  dueDate: string | null;
  /** The moment the issue entered a started status. */
  startedAt: string | null;
  /** The moment the issue was completed. */
  completedAt: string | null;
}

/**
 * The blockers of every issue, with the relation id that removes each relation.
 *
 * A `blocks` relation lives on the blocker and points at the blocked issue
 * through `relatedIssue`, so the blockers of an issue are the issues that hold
 * a `blocks` node naming it.
 */
function indexBlockers(
  issues: readonly LinearIssue[],
  doneStateIds: ReadonlySet<string>,
): Map<string, TreeIssue["blockedBy"]> {
  const known = new Set(issues.map((issue) => issue.id));
  const blockedBy = new Map<string, TreeIssue["blockedBy"]>();
  for (const issue of issues) blockedBy.set(issue.id, []);
  for (const blocker of issues) {
    for (const relation of blocker.relations.nodes) {
      if (relation.type !== "blocks") continue;
      if (!known.has(relation.relatedIssue.id)) continue;
      blockedBy.get(relation.relatedIssue.id)!.push({
        id: blocker.id,
        identifier: blocker.identifier,
        title: blocker.title,
        done: isDoneIssue(blocker, doneStateIds),
        relationId: relation.id,
      });
    }
  }
  return blockedBy;
}

/**
 * The issues the tree draws, with the facts the tree reads off them.
 *
 * `doneStateIds` holds the workflow state ids the project treats as terminal,
 * and `startedStates` the started states of the workflow — together they say
 * which issues are done and how far each one sits in the workflow.
 */
export function buildTreeIssues(
  issues: readonly LinearIssue[],
  doneStateIds: ReadonlySet<string>,
  startedStates: readonly LinearWorkflowState[] = [],
): TreeIssue[] {
  const blockedBy = indexBlockers(issues, doneStateIds);
  return issues.map((issue) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    milestone: issue.projectMilestone,
    stateName: issue.state.name,
    stateType: issue.state.type,
    stateColor: issue.state.color,
    stateProgress: getStateProgress(issue.state, startedStates),
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    assigneeAvatarUrl: issue.assignee?.avatarUrl ?? null,
    assigneeName: issue.assignee?.name ?? null,
    labels: issue.labels.nodes,
    done: isDoneIssue(issue, doneStateIds),
    blockedBy: blockedBy.get(issue.id) ?? [],
    dueDate: issue.dueDate,
    startedAt: issue.startedAt,
    completedAt: issue.completedAt,
  }));
}
