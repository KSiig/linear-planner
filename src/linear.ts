import { getAccessToken } from "./auth";

const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  /** Linear's manual (drag-and-drop) order within a list. Lower = higher in the list. */
  sortOrder: number;
  startedAt: string | null;
  completedAt: string | null;
  /** Linear due date as `YYYY-MM-DD`, or null when the issue has none. */
  dueDate: string | null;
  /** The issue body as written in Linear. Null when the issue has no description. */
  description: string | null;
  /** Timestamp of the issue's last update, kept exactly as the API returned it. */
  updatedAt: string;
  state: { id: string; name: string; type: string; color: string; position: number };
  /** The team that owns the issue. A project can span teams, so this is authoritative. */
  team: { id: string };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  projectMilestone: { id: string; name: string; sortOrder: number } | null;
  labels: { nodes: Array<{ name: string; color: string }> };
  relations: {
    nodes: Array<{
      id: string;
      type: string;
      relatedIssue: { id: string; identifier: string };
    }>;
  };
}

export interface LinearProject {
  id: string;
  name: string;
  /** Teams the project belongs to. A project can span several teams. */
  teams: { nodes: Array<{ id: string; name: string; key: string }> };
  /** False when the project holds no issue at all. Such projects are hidden from the picker
   *  (nothing to plan) but stay in the list so a bookmarked URL still resolves. */
  hasIssues: boolean;
}

export interface LinearMilestone {
  id: string;
  name: string;
  sortOrder: number;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
  position: number;
  color: string;
}

export interface LinearCycle {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Linear API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e: { message: string }) => e.message).join(", "));
  return json.data;
}

export async function fetchProjects(): Promise<LinearProject[]> {
  // `issues(first: 1)` is a cheap emptiness probe — Linear's connections expose no
  // totalCount, so we just ask whether at least one issue comes back.
  type ProjectNode = Omit<LinearProject, "hasIssues"> & { issues: { nodes: Array<{ id: string }> } };

  const allProjects: LinearProject[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const data = await gql<{
      projects: {
        nodes: ProjectNode[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    }>(
      `
      query($after: String) {
        projects(first: 100, after: $after, orderBy: updatedAt) {
          nodes {
            id
            name
            teams(first: 10) { nodes { id name key } }
            issues(first: 1) { nodes { id } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
      { after: cursor }
    );

    for (const node of data.projects.nodes) {
      allProjects.push({
        id: node.id,
        name: node.name,
        teams: node.teams,
        hasIssues: node.issues.nodes.length > 0,
      });
    }
    hasMore = data.projects.pageInfo.hasNextPage;
    cursor = data.projects.pageInfo.endCursor;
  }

  return allProjects;
}

export async function fetchProjectMilestones(projectId: string): Promise<LinearMilestone[]> {
  const data = await gql<{
    project: { projectMilestones: { nodes: LinearMilestone[] } };
  }>(
    `
    query($projectId: String!) {
      project(id: $projectId) {
        projectMilestones { nodes { id name sortOrder } }
      }
    }
  `,
    { projectId }
  );
  return data.project.projectMilestones.nodes;
}

async function fetchTeamWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
  const data = await gql<{
    team: { states: { nodes: LinearWorkflowState[] } };
  }>(
    `
    query($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name type position color } }
      }
    }
  `,
    { teamId },
  );
  return data.team.states.nodes;
}

export async function fetchProjectWorkflowStates(projectId: string): Promise<LinearWorkflowState[]> {
  const teamIds = await fetchProjectTeamIds(projectId);
  const allStates: LinearWorkflowState[] = [];
  for (const teamId of teamIds) {
    allStates.push(...await fetchTeamWorkflowStates(teamId));
  }
  const seen = new Set<string>();
  return allStates
    .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
    .sort((a, b) => a.position - b.position);
}

export async function fetchProjectTeamIds(projectId: string): Promise<string[]> {
  const data = await gql<{
    project: { teams: { nodes: Array<{ id: string }> } };
  }>(
    `
    query($projectId: String!) {
      project(id: $projectId) {
        teams { nodes { id } }
      }
    }
  `,
    { projectId }
  );
  return data.project.teams.nodes.map((t) => t.id);
}

export async function fetchTeamCycles(teamId: string): Promise<LinearCycle[]> {
  const allCycles: LinearCycle[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const data = await gql<{
      team: {
        cycles: {
          nodes: LinearCycle[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }>(
      `
      query($teamId: String!, $after: String) {
        team(id: $teamId) {
          cycles(first: 50, after: $after) {
            nodes {
              id
              name
              number
              startsAt
              endsAt
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { teamId, after: cursor }
    );

    allCycles.push(...data.team.cycles.nodes);
    hasMore = data.team.cycles.pageInfo.hasNextPage;
    cursor = data.team.cycles.pageInfo.endCursor;
  }

  return allCycles;
}

export async function fetchProjectCycles(projectId: string): Promise<LinearCycle[]> {
  const teamIds = await fetchProjectTeamIds(projectId);
  const allCycles: LinearCycle[] = [];
  for (const teamId of teamIds) {
    const cycles = await fetchTeamCycles(teamId);
    allCycles.push(...cycles);
  }
  // Deduplicate by id and sort by start date
  const seen = new Set<string>();
  return allCycles
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export interface OverviewCardIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  dueDate: string | null;
  priority: number;
  priorityLabel: string;
  updatedAt: string;
  state: { name: string; type: string };
  labels: { nodes: Array<{ name: string }> };
  project: { id: string; name: string } | null;
}

export async function fetchTeamIssues(teamId: string): Promise<OverviewCardIssue[]> {
  const allIssues: OverviewCardIssue[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const data = await gql<{
      team: {
        issues: {
          nodes: OverviewCardIssue[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      } | null;
    }>(
      `
      query OverviewTeamIssues($teamId: String!, $after: String) {
        team(id: $teamId) {
          issues(first: 50, after: $after) {
            nodes {
              id
              identifier
              title
              url
              dueDate
              priority
              priorityLabel
              updatedAt
              state { name type }
              labels { nodes { name } }
              project { id name }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { teamId, after: cursor },
    );

    if (!data.team) throw new Error("Team not found");
    allIssues.push(...data.team.issues.nodes);
    hasMore = data.team.issues.pageInfo.hasNextPage;
    cursor = data.team.issues.pageInfo.endCursor;
  }

  return allIssues;
}

export async function fetchProjectIssues(projectId: string): Promise<LinearIssue[]> {
  // Use small page size to stay under Linear's query complexity limit (10000)
  // Nested relations + cycle multiplies complexity per issue
  const allIssues: LinearIssue[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const data = await gql<{
      project: {
        issues: {
          nodes: LinearIssue[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }>(
      `
      query($projectId: String!, $after: String) {
        project(id: $projectId) {
          issues(first: 20, after: $after) {
            nodes {
              id
              identifier
              title
              url
              priority
              priorityLabel
              sortOrder
              startedAt
              completedAt
              dueDate
              description
              updatedAt
              assignee { id name avatarUrl }
              state { id name type color position }
              team { id }
              projectMilestone { id name sortOrder }
              labels { nodes { name color } }
              relations {
                nodes {
                  id
                  type
                  relatedIssue { id identifier }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
      { projectId, after: cursor }
    );

    allIssues.push(...data.project.issues.nodes);
    hasMore = data.project.issues.pageInfo.hasNextPage;
    cursor = data.project.issues.pageInfo.endCursor;
  }

  return allIssues.filter(isPlannableIssue);
}

/**
 * Issues tagged `no-planner`, or sitting in a "Duplicate" workflow state, are
 * excluded from the planner entirely.
 */
export function isPlannableIssue(issue: {
  labels: { nodes: ReadonlyArray<{ name: string }> };
  state: { name: string };
}): boolean {
  if (issue.labels.nodes.some((l) => l.name === "no-planner")) return false;
  if (issue.state.name === "Duplicate") return false;
  return true;
}

/**
 * Optimistically add a "blocks" relation to local issue data, mirroring what a refetch would
 * produce. A "blocks" relation lives on the *blocker* issue with `relatedIssue` pointing at the
 * blocked one. Returns a new array; the blocker issue is duplicated with the
 * extra relation node, everything else is returned as-is. A duplicate relation is a no-op.
 */
export function addBlocksRelation(
  issues: LinearIssue[],
  blockerId: string,
  blockedId: string,
  relationId: string,
): LinearIssue[] {
  const identifier = issues.find((i) => i.id === blockedId)?.identifier ?? "";
  return issues.map((issue) => {
    if (issue.id !== blockerId) return issue;
    if (issue.relations.nodes.some((r) => r.type === "blocks" && r.relatedIssue.id === blockedId)) return issue;
    return {
      ...issue,
      relations: {
        ...issue.relations,
        nodes: [...issue.relations.nodes, { id: relationId, type: "blocks", relatedIssue: { id: blockedId, identifier } }],
      },
    };
  });
}

/**
 * Optimistically drop an IssueRelation from local issue data by id. The node lives on whichever
 * issue holds it, so it's filtered out everywhere. Only issues that actually held it are copied.
 */
export function removeRelation(issues: LinearIssue[], relationId: string): LinearIssue[] {
  return issues.map((issue) =>
    issue.relations.nodes.some((r) => r.id === relationId)
      ? { ...issue, relations: { ...issue.relations, nodes: issue.relations.nodes.filter((r) => r.id !== relationId) } }
      : issue,
  );
}

/**
 * Delete a single IssueRelation by id. Requires the `write` OAuth scope.
 */
export async function deleteIssueRelation(relationId: string): Promise<void> {
  await gql<{ issueRelationDelete: { success: boolean } }>(
    `
    mutation IssueRelationDelete($id: String!) {
      issueRelationDelete(id: $id) {
        success
      }
    }
  `,
    { id: relationId },
  );
}

/**
 * Create a "blocks" relation: `blockerId` blocks `blockedId`. Requires the `write` OAuth scope.
 * Returns the new IssueRelation id so callers can patch local state (and later delete it)
 * without refetching.
 */
export async function createBlockingRelation(blockerId: string, blockedId: string): Promise<string> {
  // `type` is an `IssueRelationType` enum — must be a bare identifier, not a quoted string.
  const data = await gql<{ issueRelationCreate: { success: boolean; issueRelation: { id: string } } }>(
    `
    mutation IssueRelationCreate($issueId: String!, $relatedIssueId: String!) {
      issueRelationCreate(input: { issueId: $issueId, relatedIssueId: $relatedIssueId, type: blocks }) {
        success
        issueRelation { id }
      }
    }
  `,
    { issueId: blockerId, relatedIssueId: blockedId },
  );
  return data.issueRelationCreate.issueRelation.id;
}
