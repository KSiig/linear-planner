import { addCalendarDays } from "./views/overview/calendar";

export type DueWindow = "overdue" | "next" | "soon" | "later" | "none";

export interface PlannerQuery {
  projectIds: string[];
  stateTypes: string[];
  assigneeIds: string[];
  priorities: number[];
  labelNames: string[];
  milestoneIds: string[];
  dueWindow: DueWindow | null;
}

const DUE_WINDOWS = new Set<DueWindow>(["overdue", "next", "soon", "later", "none"]);

export function emptyPlannerQuery(): PlannerQuery {
  return {
    projectIds: [],
    stateTypes: [],
    assigneeIds: [],
    priorities: [],
    labelNames: [],
    milestoneIds: [],
    dueWindow: null,
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
    isStringArray(query.assigneeIds) &&
    Array.isArray(query.priorities) &&
    query.priorities.every((item) => typeof item === "number" && Number.isFinite(item)) &&
    isStringArray(query.labelNames) &&
    isStringArray(query.milestoneIds) &&
    (query.dueWindow === null || (typeof query.dueWindow === "string" && DUE_WINDOWS.has(query.dueWindow as DueWindow)))
  );
}

export function scopeProjectIds(query: PlannerQuery, selectableProjectIds: readonly string[]): string[] {
  if (query.projectIds.length > 0) return query.projectIds;
  return [...selectableProjectIds];
}

export interface QueryIssue {
  project?: { id?: string } | null;
  state?: { type?: string } | null;
  assignee?: { id?: string } | null;
  priority?: number;
  labels?: { nodes?: Array<{ name?: string } | null> | null } | null;
  projectMilestone?: { id?: string } | null;
  dueDate?: string | null;
}

function dueDay(dueDate: string): string {
  return dueDate.slice(0, 10);
}

function matchesDue(dueDate: string | null | undefined, window: DueWindow, today: string): boolean {
  if (window === "none") return dueDate == null;
  if (dueDate == null || dueDate === "") return false;
  const day = dueDay(dueDate);
  const nextEnd = addCalendarDays(today, 14);
  const soonStart = addCalendarDays(today, 15);
  const soonEnd = addCalendarDays(today, 45);
  const laterStart = addCalendarDays(today, 46);
  if (window === "overdue") return day < today;
  if (window === "next") return day >= today && day <= nextEnd;
  if (window === "soon") return day >= soonStart && day <= soonEnd;
  return day >= laterStart;
}

export function matchesQuery(
  issue: QueryIssue,
  query: PlannerQuery,
  today: string,
): boolean {
  const projectId = issue.project?.id ?? "";
  if (projectId === "") return false;
  if (query.projectIds.length > 0 && !query.projectIds.includes(projectId)) return false;

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

  if (query.dueWindow !== null && !matchesDue(issue.dueDate, query.dueWindow, today)) return false;

  return true;
}
