import type { ScheduledIssue, MilestoneInfo } from "./scheduler";

export interface UndatedGroup {
  id: string | null;
  name: string;
  issues: ScheduledIssue[];
}

function rankPriority(priority: number): number {
  return priority === 0 ? Number.MAX_SAFE_INTEGER : priority;
}

function sortUndated(issues: ScheduledIssue[]): ScheduledIssue[] {
  return [...issues].sort((a, b) => rankPriority(a.priority) - rankPriority(b.priority) || a.identifier.localeCompare(b.identifier));
}

/**
 * Issues the scheduler could not place on the date axis — no due date and not started —
 * grouped by milestone, then ordered by priority and identifier. The scheduler flags them
 * with `isCapacityForecast`; the list itself shows no forecast bar and no date.
 */
export function groupUndatedIssues(
  issues: ScheduledIssue[],
  milestones: Array<Pick<MilestoneInfo, "id" | "name" | "sortOrder">>,
): UndatedGroup[] {
  const byId = new Map<string | null, ScheduledIssue[]>();
  for (const issue of issues) {
    if (!issue.isCapacityForecast) continue;
    const id = issue.milestone?.id ?? null;
    const list = byId.get(id);
    if (list) list.push(issue);
    else byId.set(id, [issue]);
  }

  const groups: UndatedGroup[] = [];
  const seen = new Set<string | null>();
  for (const ms of milestones) {
    const list = byId.get(ms.id);
    if (!list?.length) continue;
    seen.add(ms.id);
    groups.push({ id: ms.id, name: ms.name, issues: sortUndated(list) });
  }
  const none = byId.get(null);
  if (none?.length) {
    seen.add(null);
    groups.push({ id: null, name: "No milestone", issues: sortUndated(none) });
  }
  const rest = [...byId.entries()]
    .filter(([id]) => !seen.has(id))
    .sort((a, b) => (a[1][0].milestone?.sortOrder ?? 0) - (b[1][0].milestone?.sortOrder ?? 0));
  for (const [id, list] of rest) {
    groups.push({ id, name: list[0].milestone?.name ?? "Milestone", issues: sortUndated(list) });
  }
  return groups;
}
