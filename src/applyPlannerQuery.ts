import type { LinearIssue } from "./linear";
import { fetchProjectIssues } from "./linear";
import { matchesQuery, scopeProjectIds, type PlannerQuery } from "./plannerQuery";
import type { OverviewIssue } from "./views/overview/cards/shell/contract";

export type StampedIssue = LinearIssue & { project: { id: string; name: string } };

export async function fetchScopedIssues(
  projectIds: string[],
  projects: ReadonlyArray<{ id: string; name: string }>,
  fetchIssues: (projectId: string) => Promise<LinearIssue[]> = fetchProjectIssues,
): Promise<StampedIssue[]> {
  if (projectIds.length === 0) return [];

  const seen = new Set<string>();
  const stamped: StampedIssue[] = [];
  for (const id of projectIds) {
    const name = projects.find((project) => project.id === id)?.name ?? "";
    const issues = await fetchIssues(id);
    for (const issue of issues) {
      if (seen.has(issue.id)) continue;
      seen.add(issue.id);
      stamped.push({ ...issue, project: { id, name } });
    }
  }
  return stamped;
}

export function filterMatchingIssues(
  issues: readonly StampedIssue[],
  query: PlannerQuery,
  today: string,
): StampedIssue[] {
  return issues.filter((issue) => matchesQuery(issue, query, today));
}

export function toOverviewIssue(issue: StampedIssue): OverviewIssue {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    dueDate: issue.dueDate,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    updatedAt: "",
    state: { name: issue.state.name, type: issue.state.type },
    project: issue.project,
  };
}

export function overviewIssuesForQuery(
  issues: readonly StampedIssue[],
  query: PlannerQuery,
  today: string,
): OverviewIssue[] {
  return filterMatchingIssues(issues, query, today).map(toOverviewIssue);
}

export function projectIdsToLoad(query: PlannerQuery, selectableProjectIds: readonly string[]): string[] {
  return scopeProjectIds(query, selectableProjectIds);
}

export async function fetchScopedById<T extends { id: string }>(
  projectIds: readonly string[],
  fetchRows: (projectId: string) => Promise<T[]>,
): Promise<T[]> {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const id of projectIds) {
    for (const row of await fetchRows(id)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}
