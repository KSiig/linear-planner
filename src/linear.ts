import { getAccessToken, isOAuthScopeError } from "./auth";

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
  /** Timestamp of the issue's creation, kept exactly as the API returned it. */
  createdAt: string;
  state: { id: string; name: string; type: string; color: string; position: number };
  /** The team that owns the issue. A project can span teams, so this is authoritative. */
  team: { id: string };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  projectMilestone: { id: string; name: string; sortOrder: number } | null;
  /** The project that owns the issue, or null when it has none. */
  project: { id: string; name: string } | null;
  labels: { nodes: Array<{ name: string; color: string }> };
  relations: {
    nodes: Array<{
      id: string;
      type: string;
      relatedIssue: { id: string; identifier: string; title: string; state: { type: string } };
    }>;
  };
  inverseRelations: {
    nodes: Array<{
      id: string;
      type: string;
      relatedIssue: { id: string; identifier: string; title: string; state: { type: string } };
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

/** A user who is a member of a team. */
export interface LinearTeamMember {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  /** False for a deactivated (suspended) account. */
  active: boolean;
}

export interface LinearCycle {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
}

/** How a Linear API failure is classified. */
export type LinearApiErrorKind =
  /** Linear refused the request because the token lacks the `write` scope. */
  | "oauth-scope"
  /** Linear rejected the input of the request. */
  | "validation"
  /** The request never reached Linear. */
  | "network"
  /** An ordinary GraphQL error. */
  | "graphql";

/**
 * A Linear API failure that carries its classification.
 *
 * The `kind` keeps an OAuth scope rejection apart from a rejected input, a
 * request that never arrived and an ordinary GraphQL error.
 */
export class LinearApiError extends Error {
  readonly kind: LinearApiErrorKind;

  constructor(kind: LinearApiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LinearApiError";
    this.kind = kind;
  }
}

/** Linear's own error taxonomy, as reported in `extensions.type`. */
const LINEAR_VALIDATION_ERROR_TYPES = new Set(["InvalidInput", "INVALID_INPUT", "BAD_USER_INPUT"]);
const LINEAR_NETWORK_ERROR_TYPES = new Set(["NetworkError", "NETWORK_ERROR"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The message of a failure, whether it was thrown or handed over as an object. */
function getErrorMessage(value: unknown): string | null {
  if (value instanceof Error) return value.message;
  if (isRecord(value) && typeof value.message === "string") return value.message;
  return null;
}

/**
 * The error types Linear reports for a failure.
 *
 * Linear tags its errors with `extensions.type` — its own error taxonomy —
 * and sometimes with `extensions.code`. Either can sit on the failure itself
 * or on one of its GraphQL error entries.
 */
function getLinearErrorTypes(value: unknown): string[] {
  const holders: unknown[] = [value];
  if (isRecord(value)) {
    if (Array.isArray(value.errors)) holders.push(...value.errors);
    if (isRecord(value.response)) {
      holders.push(value.response);
      if (Array.isArray(value.response.errors)) holders.push(...value.response.errors);
    }
  }

  const types: string[] = [];
  for (const holder of holders) {
    if (!isRecord(holder) || !isRecord(holder.extensions)) continue;
    for (const key of ["type", "code"]) {
      const code = holder.extensions[key];
      if (typeof code === "string") types.push(code);
    }
  }
  return types;
}

/**
 * Classify a Linear API failure.
 *
 * The scope check is the one from `src/auth.ts` and is used as it is: a
 * failure caused by an old read-only token is an `oauth-scope` failure and
 * never a validation failure. The remaining kinds are decided here: a request
 * that never reached Linear is a `network` failure, a rejected input is a
 * `validation` failure, and everything else is an ordinary `graphql` failure.
 */
export function classifyLinearError(error: unknown): LinearApiErrorKind {
  if (error instanceof LinearApiError) return error.kind;
  if (isOAuthScopeError(error)) return "oauth-scope";

  const types = getLinearErrorTypes(error);
  if (types.some((type) => LINEAR_NETWORK_ERROR_TYPES.has(type))) return "network";
  // A request that never left the browser fails with a `TypeError`.
  if (error instanceof TypeError) return "network";
  if (types.some((type) => LINEAR_VALIDATION_ERROR_TYPES.has(type))) return "validation";

  const message = getErrorMessage(error);
  if (message && /invalid input/i.test(message)) return "validation";
  return "graphql";
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

/**
 * The workflow states of one team.
 *
 * The states belong to the team, so they are the only valid choices for the
 * issues of that team. A project can span teams, and a state of another team
 * is not a valid state for an issue.
 */
export async function fetchTeamWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
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

/**
 * The users who are members of one team.
 *
 * The members of the issue's own team are the only valid assignees for an
 * issue of that team, so the choices are read from the team and not from the
 * whole workspace.
 */
export async function fetchTeamMembers(teamId: string): Promise<LinearTeamMember[]> {
  const data = await gql<{
    team: { members: { nodes: LinearTeamMember[] } } | null;
  }>(
    `
    query($teamId: String!) {
      team(id: $teamId) {
        members(first: 50) { nodes { id name displayName avatarUrl active } }
      }
    }
  `,
    { teamId },
  );

  if (!data.team) throw new Error("Team not found");
  return data.team.members.nodes;
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

/** The issue fields the planner reads. */
const ISSUE_FIELDS = `
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
  createdAt
  assignee { id name avatarUrl }
  state { id name type color position }
  team { id }
  projectMilestone { id name sortOrder }
  project { id name }
  labels { nodes { name color } }
  relations {
    nodes {
      id
      type
      relatedIssue { id identifier title state { type } }
    }
  }
  inverseRelations {
    nodes {
      id
      type
      relatedIssue { id identifier title state { type } }
    }
  }
`;

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
            nodes {${ISSUE_FIELDS}}
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
 * Read one issue again.
 *
 * A write that finishes an issue leaves facts the planner must not invent —
 * the completion time and the update time. Those come from Linear, so the one
 * issue is read again instead of being guessed.
 */
export async function fetchIssue(issueId: string): Promise<LinearIssue | null> {
  const data = await gql<{ issue: LinearIssue | null }>(
    `
    query($id: String!) {
      issue(id: $id) {${ISSUE_FIELDS}}
    }
  `,
    { id: issueId },
  );

  return data.issue ?? null;
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
  const blockedIssue = issues.find((i) => i.id === blockedId);
  const identifier = blockedIssue?.identifier ?? "";
  const title = blockedIssue?.title ?? "";
  const relatedStateType = blockedIssue?.state.type ?? "unknown";
  return issues.map((issue) => {
    if (issue.id !== blockerId) return issue;
    if (issue.relations.nodes.some((r) => r.type === "blocks" && r.relatedIssue.id === blockedId)) return issue;
    return {
      ...issue,
      relations: {
        ...issue.relations,
        nodes: [...issue.relations.nodes, { id: relationId, type: "blocks", relatedIssue: { id: blockedId, identifier, title, state: { type: relatedStateType } } }],
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
 * Move an issue to a workflow state.
 *
 * `stateId` has to be a workflow state of the issue's own team. A project can
 * span teams, so the merged states of a project are not a valid source: the
 * states of the issue team are.
 *
 * The mutation reports the outcome through its `success` flag. A response
 * without that flag is not a success, so the failure is reported as an error
 * instead. Requires the `write` OAuth scope.
 */
export async function issueUpdate(issueId: string, stateId: string): Promise<void> {
  const data = await gql<{ issueUpdate?: { success?: boolean } | null }>(
    `
    mutation IssueUpdate($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }
  `,
    { id: issueId, stateId },
  );

  const result = data?.issueUpdate;
  if (result?.success === true) return;
  if (!result) {
    throw new LinearApiError("graphql", `Linear returned no state change result for issue ${issueId}.`);
  }
  throw new LinearApiError("graphql", `Linear did not move issue ${issueId} to state ${stateId}.`);
}

/**
 * The fields one issue mutation can change.
 *
 * Only the fields that are set are sent, so a change never clears a field it
 * does not mention. A field that is sent as null is cleared by Linear.
 */
export interface IssueUpdateFields {
  /** The workflow state the issue moves to. */
  stateId?: string;
  /** The priority of the issue: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low. */
  priority?: number;
  /** The id of the user to assign the issue to, or null to unassign the issue. */
  assigneeId?: string | null;
  /** The due date as `YYYY-MM-DD`, or null to clear the due date. */
  dueDate?: string | null;
}

/**
 * Change the fields of one issue.
 *
 * This is the same `issueUpdate` mutation the status change uses, with the
 * changed fields as one input object. Linear clears the assignee and the due
 * date when they are sent as null.
 *
 * The mutation reports the outcome through its `success` flag. A response
 * without that flag is not a success, so the failure is reported as an error
 * instead. Requires the `write` OAuth scope.
 */
export async function issueUpdateFields(issueId: string, fields: IssueUpdateFields): Promise<void> {
  const data = await gql<{ issueUpdate?: { success?: boolean } | null }>(
    `
    mutation IssueUpdateFields($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
      }
    }
  `,
    { id: issueId, input: fields },
  );

  const result = data?.issueUpdate;
  if (result?.success === true) return;
  if (!result) {
    throw new LinearApiError("graphql", `Linear returned no update result for issue ${issueId}.`);
  }
  throw new LinearApiError("graphql", `Linear did not update issue ${issueId}.`);
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
