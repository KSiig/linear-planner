import { isPlannerQuery, type PlannerQuery } from "../src/plannerQuery";
import { isSavedViewMode, type SavedView, type SavedViewMode } from "../src/savedViews";

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
  if (!isPlannerQuery(query) || !isSavedViewMode(row.mode)) return null;
  return { id: row.id, name: row.name, query, mode: row.mode };
}

export function rejectName(name: unknown): Response | null {
  if (typeof name !== "string" || name.trim() === "") return json({ error: "Name is required" }, 400);
  return null;
}

export function rejectQuery(query: unknown): Response | PlannerQuery {
  if (!isPlannerQuery(query)) return json({ error: "Query is not a PlannerQuery" }, 400);
  return query;
}

export function rejectMode(mode: unknown): Response | SavedViewMode {
  if (!isSavedViewMode(mode)) return json({ error: "Mode is not a saved view mode" }, 400);
  return mode;
}
