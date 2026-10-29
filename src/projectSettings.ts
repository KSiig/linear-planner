// Per-project user preferences persisted to localStorage.

const GLOBAL_STORAGE_KEY = "linear-planner";
export const DISPLAY_STORAGE_KEY = `${GLOBAL_STORAGE_KEY}:display`;

/** The views the planner can show. */
export type Mode = "dates" | "tree" | "overview";

export interface ProjectSettings {
  mode: Mode;
  /** When mode === "tree", whether to draw arrows for blockers across milestones. */
  drawCrossMilestoneDeps: boolean;
  /** Whether the per-milestone tree view includes done issues. */
  includeDoneIssuesTree: boolean;
  /** Whether the global tree view includes done issues. */
  includeDoneIssuesTreeGlobal: boolean;
  /** The workflow state ids the project treats as terminal. */
  doneStateIds: string[];
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  mode: "dates",
  drawCrossMilestoneDeps: false,
  includeDoneIssuesTree: true,
  includeDoneIssuesTreeGlobal: true,
  doneStateIds: [],
};

export function loadProjectSettings(urlProjectId?: string | null): ProjectSettings {
  try {
    const display = localStorage.getItem(DISPLAY_STORAGE_KEY);
    const raw = display ?? (urlProjectId ? localStorage.getItem(`${GLOBAL_STORAGE_KEY}:${urlProjectId}`) : null);
    if (!raw) return DEFAULT_PROJECT_SETTINGS;
    const data = JSON.parse(raw);
    // Migration: the old "workers" mode is the "dates" view now — it loads as "dates".
    // Old "treeIndividual" → "tree" with cross-milestone deps off.
    // A stored treeGlobal mode loads as tree. Do not write treeGlobal.
    let mode: Mode = "dates";
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
    return DEFAULT_PROJECT_SETTINGS;
  }
}

export function saveProjectSettings(s: ProjectSettings) {
  localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(s));
}

/** Legacy key — used pre-OAuth. Removed at startup to avoid stale state. */
export const LEGACY_STORAGE_KEY = GLOBAL_STORAGE_KEY;
