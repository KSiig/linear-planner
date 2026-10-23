import { emptyPlannerQuery, isPlannerQuery, type PlannerQuery } from "./plannerQuery";

export type SavedViewMode = "workers" | "tree" | "overview";

export interface SavedView {
  id: string;
  name: string;
  query: PlannerQuery;
  mode: SavedViewMode;
}

const QUERY_KEY = "linear-planner:query";
const ACTIVE_VIEW_KEY = "linear-planner:active-view";

const MODES = new Set<SavedViewMode>(["workers", "tree", "overview"]);

export function isSavedViewMode(value: unknown): value is SavedViewMode {
  return typeof value === "string" && MODES.has(value as SavedViewMode);
}

/** Stored rows may still say treeGlobal. Readers select tree and do not delete the row. */
export function readSavedViewMode(value: unknown): SavedViewMode | null {
  if (value === "treeGlobal") return "tree";
  return isSavedViewMode(value) ? value : null;
}

export function loadPlannerQuery(): PlannerQuery {
  const raw = localStorage.getItem(QUERY_KEY);
  if (raw == null) return emptyPlannerQuery();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlannerQuery(parsed)) return emptyPlannerQuery();
    return parsed;
  } catch {
    return emptyPlannerQuery();
  }
}

export function savePlannerQuery(query: PlannerQuery): void {
  localStorage.setItem(QUERY_KEY, JSON.stringify(query));
}

export function loadActiveViewId(): string | null {
  return localStorage.getItem(ACTIVE_VIEW_KEY);
}

export function saveActiveViewId(id: string | null): void {
  if (id == null) localStorage.removeItem(ACTIVE_VIEW_KEY);
  else localStorage.setItem(ACTIVE_VIEW_KEY, id);
}

type FetchLike = typeof fetch;

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Saved views request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function loadSavedViews(fetchImpl: FetchLike, token: string): Promise<SavedView[]> {
  const response = await fetchImpl("/api/views", { headers: authHeaders(token) });
  return readJson<SavedView[]>(response);
}

export async function createSavedView(
  fetchImpl: FetchLike,
  token: string,
  input: { name: string; query: PlannerQuery; mode: SavedViewMode },
): Promise<SavedView> {
  const response = await fetchImpl("/api/views", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return readJson<SavedView>(response);
}

export async function renameSavedView(
  fetchImpl: FetchLike,
  token: string,
  id: string,
  name: string,
): Promise<SavedView> {
  return updateSavedView(fetchImpl, token, id, { name });
}

export async function updateSavedView(
  fetchImpl: FetchLike,
  token: string,
  id: string,
  patch: { name?: string; query?: PlannerQuery; mode?: SavedViewMode },
): Promise<SavedView> {
  const response = await fetchImpl(`/api/views/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  });
  return readJson<SavedView>(response);
}

export async function deleteSavedView(fetchImpl: FetchLike, token: string, id: string): Promise<void> {
  const response = await fetchImpl(`/api/views/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(`Saved views request failed: ${response.status}`);
}
