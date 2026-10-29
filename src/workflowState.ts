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

/**
 * The state name the scheduler takes as the end of the work.
 *
 * The Done states setting stores state ids; the scheduler still takes one
 * state name. The first configured done state provides that name. Without a
 * configured state the scheduler keeps its own default: a "merged" state, else
 * any completed state.
 */
export function resolveEndStatusName(doneStateIds: readonly string[], states: LinearWorkflowState[]): string {
  const first = states.find((state) => state.id === doneStateIds[0]);
  if (first) return first.name;
  const candidates = states.filter((s) => s.type === "started" || s.type === "completed");
  const merged = candidates.find((s) => s.type === "started" && s.name.toLowerCase().includes("merged"));
  if (merged) return merged.name;
  const completed = candidates.find((s) => s.type === "completed");
  return completed ? completed.name : "";
}

export function sortStates(states: LinearWorkflowState[]): LinearWorkflowState[] {
  return [...states].sort((a, b) => {
    const ta = STATE_TYPE_ORDER[a.type] ?? 9;
    const tb = STATE_TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.position - b.position;
  });
}

export function getStateProgress(state: LinearWorkflowState, allStartedStates: LinearWorkflowState[]): number {
  if (state.type === "completed") return 1;
  if (state.type === "canceled") return 0;
  if (state.type !== "started" || allStartedStates.length === 0) return 0;
  const idx = allStartedStates.findIndex((s) => s.id === state.id);
  if (idx < 0) return 0.5;
  return (idx + 1) / (allStartedStates.length + 1);
}
