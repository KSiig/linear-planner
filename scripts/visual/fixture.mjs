// Visual harness mock-data fixture. Consumed by the route handler in
// run.mjs. The handler dispatches on substrings of body.query and reads
// body.variables to build each response — there is no static JSON file
// because the history query has a variable number of aliases (id0, id1,
// ...) and the GraphQL client expects a matching number of result keys
// (i0, i1, ...).
//
// Domain is the Acme Launch example project: 12 issues, 2 milestones, 4
// workflow states, 2 assignees, 3 blocks relations. The history covers
// a real Todo -> In Progress -> Done path so the scheduler exercises both
// code paths (state-only and state+assignee changes).

export const TEAM = Object.freeze({
  id: 'team-acme',
  name: 'Acme',
  key: 'ACME',
});

export const PROJECT = Object.freeze({
  id: 'proj-acme',
  name: 'Acme Launch',
});

export const MILESTONES = Object.freeze([
  Object.freeze({ id: 'ms-foundation', name: 'Foundation', sortOrder: 0 }),
  Object.freeze({ id: 'ms-launch', name: 'Launch', sortOrder: 1 }),
]);

export const STATES = Object.freeze([
  Object.freeze({ id: 'st-backlog',  name: 'Backlog',     type: 'backlog',   position: 0, color: '#bec2c8' }),
  Object.freeze({ id: 'st-todo',     name: 'Todo',        type: 'unstarted', position: 1, color: '#e2e2e2' }),
  Object.freeze({ id: 'st-progress', name: 'In Progress', type: 'started',   position: 2, color: '#f2c94c' }),
  Object.freeze({ id: 'st-done',     name: 'Done',        type: 'completed', position: 3, color: '#5e6ad2' }),
]);

export const USERS = Object.freeze([
  Object.freeze({ id: 'user-ada',   name: 'Ada Lovelace', avatarUrl: null }),
  Object.freeze({ id: 'user-grace', name: 'Grace Hopper', avatarUrl: null }),
]);

function stateByName(name) {
  const s = STATES.find((x) => x.name === name);
  if (!s) throw new Error(`fixture: unknown state ${name}`);
  return { name: s.name, type: s.type, color: s.color, position: s.position };
}

function userById(id) {
  if (id === null) return null;
  const u = USERS.find((x) => x.id === id);
  if (!u) throw new Error(`fixture: unknown user ${id}`);
  return { id: u.id, name: u.name, avatarUrl: u.avatarUrl };
}

function milestoneByName(name) {
  if (name === null) return null;
  const m = MILESTONES.find((x) => x.name === name);
  if (!m) throw new Error(`fixture: unknown milestone ${name}`);
  return { id: m.id, name: m.name, sortOrder: m.sortOrder };
}

const ISSUE_TABLE = [
  { id: 'iss-1',  identifier: 'ACME-1',  title: 'Setup repo',       state: 'Done',        milestone: 'Foundation', estimate: 2, priority: 2, assignee: 'user-ada',   startedAt: '2026-09-01T08:00:00.000Z', completedAt: '2026-09-03T16:00:00.000Z', blocks: [] },
  { id: 'iss-2',  identifier: 'ACME-2',  title: 'Auth',             state: 'Done',        milestone: 'Foundation', estimate: 3, priority: 2, assignee: 'user-grace', startedAt: '2026-09-02T08:00:00.000Z', completedAt: '2026-09-05T16:00:00.000Z', blocks: [{ blocked: 'ACME-4', rel: 'rel-2-4' }] },
  { id: 'iss-3',  identifier: 'ACME-3',  title: 'Schema',           state: 'In Progress', milestone: 'Foundation', estimate: 2, priority: 3, assignee: 'user-ada',   startedAt: '2026-09-20T08:00:00.000Z', completedAt: null,                    blocks: [{ blocked: 'ACME-7', rel: 'rel-3-7' }] },
  { id: 'iss-4',  identifier: 'ACME-4',  title: 'API',              state: 'Todo',        milestone: 'Foundation', estimate: 5, priority: 2, assignee: null,         startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-5',  identifier: 'ACME-5',  title: 'Empty states',     state: 'Backlog',     milestone: 'Foundation', estimate: 1, priority: 4, assignee: null,         startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-6',  identifier: 'ACME-6',  title: 'Docs',             state: 'Todo',        milestone: 'Foundation', estimate: 1, priority: 3, assignee: 'user-grace', startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-7',  identifier: 'ACME-7',  title: 'Beta flag',        state: 'In Progress', milestone: 'Launch',     estimate: 2, priority: 1, assignee: 'user-grace', startedAt: '2026-09-28T08:00:00.000Z', completedAt: null,                    blocks: [{ blocked: 'ACME-9', rel: 'rel-7-9' }] },
  { id: 'iss-8',  identifier: 'ACME-8',  title: 'Landing copy',     state: 'Todo',        milestone: 'Launch',     estimate: 1, priority: 3, assignee: 'user-ada',   startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-9',  identifier: 'ACME-9',  title: 'Email',            state: 'Todo',        milestone: 'Launch',     estimate: 2, priority: 2, assignee: null,         startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-10', identifier: 'ACME-10', title: 'Metrics',          state: 'Backlog',     milestone: 'Launch',     estimate: 3, priority: 4, assignee: null,         startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-11', identifier: 'ACME-11', title: 'Support',          state: 'Todo',        milestone: 'Launch',     estimate: 2, priority: 3, assignee: 'user-ada',   startedAt: null,                       completedAt: null,                    blocks: [] },
  { id: 'iss-12', identifier: 'ACME-12', title: 'Launch checklist', state: 'Todo',        milestone: 'Launch',     estimate: 1, priority: 1, assignee: 'user-grace', startedAt: null,                       completedAt: null,                    blocks: [] },
];

// Build the linear-shaped issue objects. Sort order is 1000, 2000, ... 12000.
const ISSUES = Object.freeze(ISSUE_TABLE.map((row, idx) => {
  const relations = row.blocks.map((b) => ({
    id: b.rel,
    type: 'blocks',
    relatedIssue: { id: b.blocked, identifier: b.blocked },
  }));
  return Object.freeze({
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    url: `https://linear.app/acme/issue/${row.identifier}`,
    estimate: row.estimate,
    priority: row.priority,
    priorityLabel: ['Urgent', 'High', 'Medium', 'Low'][row.priority - 1] ?? 'No priority',
    sortOrder: (idx + 1) * 1000,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    state: stateByName(row.state),
    assignee: userById(row.assignee),
    projectMilestone: milestoneByName(row.milestone),
    labels: { nodes: [] },
    relations: { nodes: relations },
  });
}));

// History per issue. Newest-first, as Linear returns it. The handler
// returns it as-is to the page.
const HISTORY = Object.freeze({
  'iss-1': [
    { createdAt: '2026-09-03T10:00:00.000Z', fromStateName: 'In Progress', toStateName: 'Done',        fromAssignee: 'user-ada',   toAssignee: 'user-ada' },
    { createdAt: '2026-09-01T08:00:00.000Z', fromStateName: 'Todo',        toStateName: 'In Progress', fromAssignee: null,         toAssignee: 'user-ada' },
  ],
  'iss-2': [
    { createdAt: '2026-09-05T10:00:00.000Z', fromStateName: 'In Progress', toStateName: 'Done',        fromAssignee: 'user-grace', toAssignee: 'user-grace' },
    { createdAt: '2026-09-02T08:00:00.000Z', fromStateName: 'Todo',        toStateName: 'In Progress', fromAssignee: null,         toAssignee: 'user-grace' },
  ],
  'iss-3': [
    { createdAt: '2026-09-20T08:00:00.000Z', fromStateName: 'Todo',        toStateName: 'In Progress', fromAssignee: null,         toAssignee: 'user-ada' },
  ],
  'iss-7': [
    { createdAt: '2026-09-28T08:00:00.000Z', fromStateName: 'Todo',        toStateName: 'In Progress', fromAssignee: null,         toAssignee: 'user-grace' },
  ],
});

export function getHistoryForIssue(issueId) {
  const nodes = HISTORY[issueId] ?? [];
  return nodes.map((n) => ({
    createdAt: n.createdAt,
    fromState: n.fromStateName ? stateByName(n.fromStateName) : null,
    toState: n.toStateName ? stateByName(n.toStateName) : null,
    fromAssignee: n.fromAssignee ? { id: n.fromAssignee } : null,
    toAssignee: n.toAssignee ? { id: n.toAssignee } : null,
  }));
}

export { ISSUES };
