import { useId, useMemo, useState } from "react";
import type { LinearTeamMember } from "./linear";
import type { IssueQuickLookData } from "./issueQuickLookModel";
import {
  PRIORITY_CHOICES,
  applyQuickLookAction,
  toAssigneeChoices,
  type IssueQuickLookAction,
} from "./issueQuickLookActions";
import { headerInputStyle } from "./appStyles";

export interface IssueQuickLookActionsProps {
  /** The canonical issue data the actions change. */
  data: IssueQuickLookData;
  /** The members of the issue's team, the only assignee choices. */
  teamMembers: readonly LinearTeamMember[];
  /** Called with the issue id and the action the user picked. */
  onAction: (issueId: string, action: IssueQuickLookAction) => void | Promise<void>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The optimistic copy of the issue data of one action. */
interface OptimisticChange {
  /** The issue the change belongs to. */
  issueId: string;
  /** The action that was made. */
  action: IssueQuickLookAction;
  /** The issue data before the change. */
  before: IssueQuickLookData;
  /** The issue data with the change. */
  after: IssueQuickLookData;
}

/**
 * True while the given data still holds the value the action replaced.
 *
 * As long as the data of the issue holds the old value, the change of the
 * action is the newer fact and is shown. Once the data holds another value,
 * that value is the newer fact and wins.
 */
function stillHoldsTheOldValue(data: IssueQuickLookData, change: OptimisticChange): boolean {
  if (change.action.kind === "priority") return data.priority === change.before.priority;
  if (change.action.kind === "assignee") {
    return (data.assignee?.id ?? null) === (change.before.assignee?.id ?? null);
  }
  return data.dueDate === change.before.dueDate;
}

/**
 * The secondary quick-look actions: priority, assignee, and due date.
 *
 * Every action shows a pending state while the mutation runs, shows the new
 * value right away, and rolls that value back when the write fails.
 */
export function IssueQuickLookActions({ data, teamMembers, onAction }: IssueQuickLookActionsProps) {
  const [optimistic, setOptimistic] = useState<OptimisticChange | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const priorityId = `${id}-priority`;
  const assigneeId = `${id}-assignee`;
  const dueDateId = `${id}-due-date`;

  // The change belongs to the issue it was made for, so another issue never
  // shows the values of the one before it.
  const shown = optimistic && optimistic.issueId === data.id && stillHoldsTheOldValue(data, optimistic)
    ? optimistic.after
    : data;
  const assigneeChoices = useMemo(
    () => toAssigneeChoices(teamMembers, data.assignee),
    [teamMembers, data.assignee],
  );

  async function run(action: IssueQuickLookAction) {
    if (pending) return;
    setPending(true);
    setError(null);
    setOptimistic({
      issueId: data.id,
      action,
      before: data,
      after: applyQuickLookAction(data, action),
    });
    try {
      await onAction(data.id, action);
    } catch (failure) {
      // The write did not reach Linear, so the issue keeps the values it had.
      setOptimistic(null);
      setError(errorMessage(failure, "Could not update the issue."));
    } finally {
      setPending(false);
    }
  }

  function handleAssigneeChange(userId: string) {
    if (userId === "") {
      void run({ kind: "assignee", assignee: null });
      return;
    }
    const choice = assigneeChoices.find((candidate) => candidate.id === userId);
    if (!choice) return;
    void run({
      kind: "assignee",
      assignee: { id: choice.id ?? "", name: choice.label, avatarUrl: choice.avatarUrl },
    });
  }

  const labelStyle = { fontSize: 11, color: "var(--text-muted)" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label htmlFor={priorityId} style={labelStyle}>Priority</label>
        <select
          id={priorityId}
          value={String(shown.priority)}
          disabled={pending}
          onChange={(event) => void run({ kind: "priority", priority: Number(event.target.value) })}
          style={headerInputStyle}
        >
          {PRIORITY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label htmlFor={assigneeId} style={labelStyle}>Assignee</label>
        <select
          id={assigneeId}
          value={shown.assignee?.id ?? ""}
          disabled={pending}
          onChange={(event) => handleAssigneeChange(event.target.value)}
          style={headerInputStyle}
        >
          {assigneeChoices.map((choice) => (
            <option key={choice.id ?? "unassigned"} value={choice.id ?? ""}>{choice.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label htmlFor={dueDateId} style={labelStyle}>Due date</label>
        <input
          id={dueDateId}
          type="date"
          value={shown.dueDate ?? ""}
          disabled={pending}
          onChange={(event) => void run({ kind: "dueDate", dueDate: event.target.value || null })}
          style={headerInputStyle}
        />
      </div>

      <button
        type="button"
        disabled={pending || !shown.dueDate}
        onClick={() => void run({ kind: "dueDate", dueDate: null })}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 13,
          cursor: pending || !shown.dueDate ? "not-allowed" : "pointer",
        }}
      >
        Clear due date
      </button>

      {pending && <span role="status" style={{ fontSize: 11 }}>Saving…</span>}
      {error && <span role="alert" style={{ fontSize: 11, color: "var(--danger, #d64545)" }}>{error}</span>}
    </div>
  );
}
