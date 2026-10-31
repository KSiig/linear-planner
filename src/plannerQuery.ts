import { DUE_WINDOW_OPTIONS, matchesDueWindow, type DueWindow } from "./dueWindows";

// The due windows live in the due-window module. The type is re-exported here
// because the query keeps the window in its filters.
export type { DueWindow };

export interface PlannerQuery {
  projectIds: string[];
  /**
   * The legacy state-type filter.
   *
   * Saved views and stored queries from before the Status filter moved to
   * concrete states still carry it. It keeps filtering by Linear's internal
   * state type, so an old filter still shows the same issues.
   */
  stateTypes: string[];
  /**
   * The workflow state ids the Status filter selects.
   *
   * Optional because a stored query from before the Status filter moved to
   * concrete states has no state ids. `normalizePlannerQuery` fills them in.
   */
  stateIds?: string[];
  assigneeIds: string[];
  priorities: number[];
  labelNames: string[];
  milestoneIds: string[];
  dueWindow: DueWindow | null;
}

export function emptyPlannerQuery(): PlannerQuery {
  return {
    projectIds: [],
    stateTypes: [],
    stateIds: [],
    assigneeIds: [],
    priorities: [],
    labelNames: [],
    milestoneIds: [],
    dueWindow: null,
  };
}

/**
 * A query in the shape the planner stores it.
 *
 * The keys keep one order, so two queries with the same filters read as the
 * same query.
 */
export function normalizePlannerQuery(query: PlannerQuery): PlannerQuery {
  return {
    projectIds: query.projectIds,
    stateTypes: query.stateTypes,
    stateIds: query.stateIds ?? [],
    assigneeIds: query.assigneeIds,
    priorities: query.priorities,
    labelNames: query.labelNames,
    milestoneIds: query.milestoneIds,
    dueWindow: query.dueWindow,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isPlannerQuery(value: unknown): value is PlannerQuery {
  if (!value || typeof value !== "object") return false;
  const query = value as Record<string, unknown>;
  return (
    isStringArray(query.projectIds) &&
    isStringArray(query.stateTypes) &&
    (query.stateIds === undefined || isStringArray(query.stateIds)) &&
    isStringArray(query.assigneeIds) &&
    Array.isArray(query.priorities) &&
    query.priorities.every((item) => typeof item === "number" && Number.isFinite(item)) &&
    isStringArray(query.labelNames) &&
    isStringArray(query.milestoneIds) &&
    (query.dueWindow === null || (typeof query.dueWindow === "string" && isDueWindow(query.dueWindow)))
  );
}

function isDueWindow(value: string): value is DueWindow {
  return DUE_WINDOW_OPTIONS.some((option) => option.id === value);
}

export function scopeProjectIds(query: PlannerQuery, selectableProjectIds: readonly string[]): string[] {
  if (query.projectIds.length > 0) return query.projectIds;
  return [...selectableProjectIds];
}

export interface QueryIssue {
  project?: { id?: string } | null;
  state?: { id?: string; type?: string } | null;
  assignee?: { id?: string } | null;
  priority?: number;
  labels?: { nodes?: Array<{ name?: string } | null> | null } | null;
  projectMilestone?: { id?: string } | null;
  dueDate?: string | null;
}

export function matchesQuery(
  issue: QueryIssue,
  query: PlannerQuery,
  today: string,
): boolean {
  const projectId = issue.project?.id ?? "";
  if (projectId === "") return false;
  if (query.projectIds.length > 0 && !query.projectIds.includes(projectId)) return false;

  const stateIds = query.stateIds ?? [];
  if (stateIds.length > 0 && !stateIds.includes(issue.state?.id ?? "")) return false;

  if (query.stateTypes.length > 0 && !query.stateTypes.includes(issue.state?.type ?? "")) return false;

  if (query.assigneeIds.length > 0) {
    const assigneeId = issue.assignee?.id;
    const unassigned = assigneeId == null || assigneeId === "";
    const matchesAssignee = query.assigneeIds.some((id) => (id === "unassigned" ? unassigned : id === assigneeId));
    if (!matchesAssignee) return false;
  }

  if (query.priorities.length > 0 && !query.priorities.includes(issue.priority as number)) return false;

  if (query.labelNames.length > 0) {
    const names = (issue.labels?.nodes ?? []).map((label) => label?.name).filter((name): name is string => typeof name === "string");
    if (!names.some((name) => query.labelNames.includes(name))) return false;
  }

  if (query.milestoneIds.length > 0 && !query.milestoneIds.includes(issue.projectMilestone?.id ?? "")) return false;

  if (query.dueWindow !== null && !matchesDueWindow(issue.dueDate, query.dueWindow, today)) return false;

  return true;
}
