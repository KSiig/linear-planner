import type { IssueUpdateFields, LinearIssue, LinearTeamMember } from "./linear";
import type { IssueQuickLookAssignee, IssueQuickLookData } from "./issueQuickLookModel";

/**
 * One of the secondary quick-look actions.
 *
 * The action carries everything the quick-look needs to show the change: the
 * new values and the person behind an assignee.
 */
export type IssueQuickLookAction =
  | { kind: "priority"; priority: number }
  | { kind: "assignee"; assignee: IssueQuickLookAssignee | null }
  | { kind: "dueDate"; dueDate: string | null };

/**
 * The priority choices the quick-look offers.
 *
 * The number is the value Linear's API expects: 0 = No priority, 1 = Urgent,
 * 2 = High, 3 = Medium, 4 = Low.
 */
export const PRIORITY_CHOICES: readonly { value: number; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

/** The label of a priority number. */
export function priorityLabel(priority: number): string {
  return PRIORITY_CHOICES.find((choice) => choice.value === priority)?.label ?? "None";
}

/** One assignee choice of the quick-look. */
export interface AssigneeChoice {
  /** The id of the Linear user, or null for the Unassigned choice. */
  id: string | null;
  /** The name shown in the list. */
  label: string;
  /** The avatar of the user, when there is one. */
  avatarUrl: string | null;
}

/**
 * The assignee choices of one issue: the Unassigned option and the members of
 * the issue's team.
 *
 * The current assignee stays in the list even when they are no longer a member
 * of the team, so the selection of the issue never silently changes.
 */
export function toAssigneeChoices(
  members: readonly LinearTeamMember[],
  currentAssignee: IssueQuickLookAssignee | null,
): AssigneeChoice[] {
  const choices: AssigneeChoice[] = [{ id: null, label: "Unassigned", avatarUrl: null }];
  const seen = new Set<string>();

  for (const member of members) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    choices.push({
      id: member.id,
      label: member.name || member.displayName,
      avatarUrl: member.avatarUrl,
    });
  }

  if (currentAssignee && !seen.has(currentAssignee.id)) {
    choices.push({
      id: currentAssignee.id,
      label: currentAssignee.name,
      avatarUrl: currentAssignee.avatarUrl,
    });
  }

  return choices;
}

/**
 * The mutation input of one action.
 *
 * The assignee and the due date are sent as null when they are cleared, which
 * is how Linear unsets them.
 */
export function toIssueUpdateFields(action: IssueQuickLookAction): IssueUpdateFields {
  if (action.kind === "priority") return { priority: action.priority };
  if (action.kind === "assignee") return { assigneeId: action.assignee ? action.assignee.id : null };
  return { dueDate: action.dueDate };
}

/**
 * The optimistic change of the canonical quick-look data.
 *
 * Only the changed field moves. The timestamps stay exactly as they were, so
 * nothing is invented about when the issue changed.
 */
export function applyQuickLookAction(
  data: IssueQuickLookData,
  action: IssueQuickLookAction,
): IssueQuickLookData {
  if (action.kind === "priority") {
    return { ...data, priority: action.priority, priorityLabel: priorityLabel(action.priority) };
  }
  if (action.kind === "assignee") {
    return { ...data, assignee: action.assignee };
  }
  return { ...data, dueDate: action.dueDate };
}

/**
 * The optimistic change of the stored issue.
 *
 * Like the quick-look data, only the changed field moves: the completion time
 * and the update time stay as Linear reported them.
 */
export function applyQuickLookActionToIssue(
  issue: LinearIssue,
  action: IssueQuickLookAction,
): LinearIssue {
  if (action.kind === "priority") {
    return { ...issue, priority: action.priority, priorityLabel: priorityLabel(action.priority) };
  }
  if (action.kind === "assignee") {
    return {
      ...issue,
      assignee: action.assignee
        ? { id: action.assignee.id, name: action.assignee.name, avatarUrl: action.assignee.avatarUrl }
        : null,
    };
  }
  return { ...issue, dueDate: action.dueDate };
}
