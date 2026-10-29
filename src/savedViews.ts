import { emptyPlannerQuery, isPlannerQuery, type PlannerQuery } from "./plannerQuery";

export type SavedViewMode = "dates" | "tree" | "overview";

export interface SavedView {
  id: string;
  name: string;
  query: PlannerQuery;
  mode: SavedViewMode;
}

const QUERY_KEY = "linear-planner:query";
const ACTIVE_VIEW_KEY = "linear-planner:active-view";

const MODES = new Set<SavedViewMode>(["dates", "tree", "overview"]);

export function isSavedViewMode(value: unknown): value is SavedViewMode {
  return typeof value === "string" && MODES.has(value as SavedViewMode);
}

/**
 * The mode a stored saved-view row stands for.
 *
 * A stored "workers" mode is the old name of the "dates" view: it reads as
 * "dates". A stored "treeGlobal" mode reads as "tree". An unknown mode reads as
 * null, so the caller falls back safely.
 */
export function readSavedViewMode(value: unknown): SavedViewMode | null {
  if (value === "treeGlobal") return "tree";
  if (value === "workers") return "dates";
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

/** The display settings the app keeps between sessions. */
export interface DisplaySettings {
  /** The view the app opens in. */
  mode: SavedViewMode;
  /** When the mode is "tree", whether to draw arrows for blockers across milestones. */
  drawCrossMilestoneDeps: boolean;
  /** Whether the per-milestone tree view includes done issues. */
  includeDoneIssuesTree: boolean;
  /** Whether the global tree view includes done issues. */
  includeDoneIssuesTreeGlobal: boolean;
  /** The workflow state ids the project treats as terminal. */
  doneStateIds: string[];
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mode: "dates",
  drawCrossMilestoneDeps: false,
  includeDoneIssuesTree: true,
  includeDoneIssuesTreeGlobal: true,
  doneStateIds: [],
};

/** The key the display settings live under. */
export const DISPLAY_STORAGE_KEY = "linear-planner:display";

/** Legacy key — used pre-OAuth. Removed at startup to avoid stale state. */
export const LEGACY_STORAGE_KEY = "linear-planner";

/**
 * The display settings of the last session.
 *
 * The settings live under one key. An older per-project key is still read when
 * the shared key is missing, so a browser that never wrote the shared key
 * keeps its settings.
 */
export function loadDisplaySettings(urlProjectId?: string | null): DisplaySettings {
  try {
    const display = localStorage.getItem(DISPLAY_STORAGE_KEY);
    const raw = display ?? (urlProjectId ? localStorage.getItem(`${LEGACY_STORAGE_KEY}:${urlProjectId}`) : null);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const data = JSON.parse(raw);
    // Migration: the old "workers" mode is the "dates" view now — it loads as "dates".
    // Old "treeIndividual" → "tree" with cross-milestone deps off.
    // A stored treeGlobal mode loads as tree. Do not write treeGlobal.
    let mode: SavedViewMode = "dates";
    let drawCrossMilestoneDeps = false;
    if (data.mode === "tree" || data.mode === "treeGlobal") { mode = "tree"; drawCrossMilestoneDeps = data.mode === "tree" ? (data.drawCrossMilestoneDeps ?? true) : false; }
    else if (data.mode === "treeIndividual") { mode = "tree"; drawCrossMilestoneDeps = false; }
    else if (data.mode === "overview") { mode = "overview"; }
    // Migration: a single `includeDoneIssues` value (older shape) is copied to both per-view flags.
    const legacyIncludeDone = data.includeDoneIssues;
    return {
      mode,
      drawCrossMilestoneDeps,
      includeDoneIssuesTree: data.includeDoneIssuesTree ?? legacyIncludeDone ?? true,
      includeDoneIssuesTreeGlobal: data.includeDoneIssuesTreeGlobal ?? legacyIncludeDone ?? true,
      doneStateIds: Array.isArray(data.doneStateIds)
        ? data.doneStateIds.filter((id: unknown): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

/** Write the display settings of this session. */
export function saveDisplaySettings(settings: DisplaySettings): void {
  localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(settings));
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
