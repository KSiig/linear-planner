import type { LinearWorkflowState } from "./linear";

const STATE_TYPE_ORDER: Record<string, number> = { backlog: 0, triage: 1, unstarted: 2, started: 3, completed: 4, canceled: 5 };

/**
 * The workflow state ids the project treats as terminal.
 *
 * Ids the workflow no longer knows are dropped, so a state deleted in Linear
 * stops counting as done. The completed-type states are terminal without being
 * configured: the shared done-state logic in `issueFacts` treats them as done.
 */
export function computeEffectiveDoneStateIds(storedIds: readonly string[], states: LinearWorkflowState[]): string[] {
  const known = new Set(states.map((state) => state.id));
  return storedIds.filter((id) => known.has(id));
}

export function sortStates(states: LinearWorkflowState[]): LinearWorkflowState[] {
  return [...states].sort((a, b) => {
    const ta = STATE_TYPE_ORDER[a.type] ?? 9;
    const tb = STATE_TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.position - b.position;
  });
}

export function getStateProgress(state: LinearWorkflowState, allStartedStates: readonly LinearWorkflowState[]): number {
  if (state.type === "completed") return 1;
  if (state.type === "canceled") return 0;
  if (state.type !== "started" || allStartedStates.length === 0) return 0;
  const idx = allStartedStates.findIndex((s) => s.id === state.id);
  if (idx < 0) return 0.5;
  return (idx + 1) / (allStartedStates.length + 1);
}
