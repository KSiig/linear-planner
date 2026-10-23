import { emptyPlannerQuery, type PlannerQuery } from "../../plannerQuery";
import type { SavedView, SavedViewMode } from "../../savedViews";

export function queriesEqual(left: PlannerQuery, right: PlannerQuery): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isEmptyQuery(query: PlannerQuery): boolean {
  return queriesEqual(query, emptyPlannerQuery());
}

export function showSaveView(active: SavedView | null, query: PlannerQuery, mode: SavedViewMode): boolean {
  if (active == null) return true;
  return active.mode !== mode || !queriesEqual(active.query, query);
}

export function savedViewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("401") || message === "Not authenticated") return "Sign in to save views.";
  if (message.includes("403")) return "This account is outside the siig workspace.";
  return message || "Saved views request failed.";
}
