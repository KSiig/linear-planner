import { isPlannerQuery, normalizePlannerQuery, type PlannerQuery } from "../src/plannerQuery";
import { readSavedViewMode, type SavedView, type SavedViewMode } from "../src/savedViews";

export interface ViewRow {
  id: string;
  name: string;
  query_json: string;
  mode: string;
  updated_at: string;
}

export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface ViewsDb {
  prepare(query: string): D1Prepared;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function rowToView(row: ViewRow): SavedView | null {
  let query: unknown;
  try {
    query = JSON.parse(row.query_json);
  } catch {
    return null;
  }
  // A stored row from before the mode rename keeps the old mode name and
  // reads as the current one. The query is normalized, so a stored legacy
  // state-type filter comes back with the state ids the app filters on.
  const mode = readSavedViewMode(row.mode);
  if (!isPlannerQuery(query) || !mode) return null;
  return { id: row.id, name: row.name, query: normalizePlannerQuery(query), mode };
}

export function rejectName(name: unknown): Response | null {
  if (typeof name !== "string" || name.trim() === "") return json({ error: "Name is required" }, 400);
  return null;
}

export function rejectQuery(query: unknown): Response | PlannerQuery {
  if (!isPlannerQuery(query)) return json({ error: "Query is not a PlannerQuery" }, 400);
  // A stored row keeps the legacy state types it was written with, and gets
  // the state ids the app filters on.
  return normalizePlannerQuery(query);
}

export function rejectMode(mode: unknown): Response | SavedViewMode {
  // The server accepts the legacy mode names during the migration and stores
  // the current one, so an old client keeps working and the row is renamed.
  const current = readSavedViewMode(mode);
  if (!current) return json({ error: "Mode is not a saved view mode" }, 400);
  return current;
}
