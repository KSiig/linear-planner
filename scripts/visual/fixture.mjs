// Visual harness mock-data fixture. Consumed by the route handler in
// run.mjs. The handler dispatches on substrings of body.query and reads
// body.variables to build each response — there is no static JSON file
// because the history query has a variable number of aliases (id0, id1,
// ...) and the GraphQL client expects a matching number of result keys
// (i0, i1, ...).
//
// Domain is priskurven milestone "M1 — Shelf collector" (Linear milestone
// 357094eb-a836-4978-946d-eadd97339f14): 16 issues, one assignee.
// blocks lists are the intra-milestone edges only. Targets on M1.1
// (SII-100, SII-102) are omitted, and relatedTo is not a blocks edge.
// History is empty: the scheduler falls back to startedAt / completedAt.
// Linear has every M1 issue Done. States below are a stand-in: the
// foundation stays Done, and the source interface, history query, and
// placeholder-zip fix stay open so the tree shows work in progress.

export const TEAM = Object.freeze({
  id: 'team-siig',
  name: 'Siig',
  key: 'SII',
});

export const PROJECT = Object.freeze({
  id: 'proj-priskurven',
  name: 'priskurven',
});

export const MILESTONES = Object.freeze([
  Object.freeze({ id: 'ms-m1', name: 'M1 — Shelf collector', sortOrder: 1042 }),
]);

export const STATES = Object.freeze([
  Object.freeze({ id: 'st-backlog',  name: 'Backlog',     type: 'backlog',   position: 0, color: '#bec2c8' }),
  Object.freeze({ id: 'st-todo',     name: 'Todo',        type: 'unstarted', position: 1, color: '#e2e2e2' }),
  Object.freeze({ id: 'st-progress', name: 'In Progress', type: 'started',   position: 2, color: '#f2c94c' }),
  Object.freeze({ id: 'st-done',     name: 'Done',        type: 'completed', position: 3, color: '#5e6ad2' }),
]);

export const USERS = Object.freeze([
  Object.freeze({ id: 'user-kasper', name: 'Kasper Siig', avatarUrl: null }),
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

const M1 = 'M1 — Shelf collector';

const ISSUE_TABLE = [
  // SII-112/113/114 only block M1.1 issues, so they stay disconnected.
  { id: 'sii-91',  identifier: 'SII-91',  title: 'Homelab Terraform: D1, WIF, Cloud Function, Scheduler, secret placeholders', state: 'Done',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: '2026-09-20T13:19:31.498Z', completedAt: '2026-09-22T07:44:05.208Z', blocks: ['SII-110', 'SII-109', 'SII-101', 'SII-99'] },
  { id: 'sii-109', identifier: 'SII-109', title: 'SII-93a — Homelab D1 migration: priskurven.observations',                      state: 'Done',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: '2026-09-20T14:25:51.057Z', completedAt: '2026-09-22T07:44:05.651Z', blocks: ['SII-99', 'SII-93'] },
  // Linear has startedAt null. A done issue with no start is skipped, then the bar path calls calendarHalfForIso on null. Stand-in is the morning of the completed day.
  { id: 'sii-110', identifier: 'SII-110', title: 'GitHub Actions secrets on KSiig/priskurven',                                  state: 'Done',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'human',   startedAt: '2026-09-28T06:00:00.000Z', completedAt: '2026-09-28T07:19:17.001Z', blocks: [] },
  { id: 'sii-93',  identifier: 'SII-93',  title: 'SII-93b — Source interface + writer + tests (priskurven)',                    state: 'In Progress', milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: '2026-09-20T13:31:03.890Z', completedAt: null,                       blocks: ['SII-103', 'SII-92', 'SII-101', 'SII-96', 'SII-98', 'SII-94', 'SII-97', 'SII-95'] },
  { id: 'sii-101', identifier: 'SII-101', title: 'CI: fetcher fixtures + deploy via WIF on main',                               state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-99',  identifier: 'SII-99',  title: 'History query: GET /v1/history?source=&sku=',                                 state: 'In Progress', milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: '2026-09-20T14:20:08.105Z', completedAt: null,                       blocks: [] },
  { id: 'sii-103', identifier: 'SII-103', title: 'Orchestrator: run all sources, isolate failures, always insert',             state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: ['SII-96', 'SII-94', 'SII-92', 'SII-98', 'SII-97', 'SII-95'] },
  { id: 'sii-92',  identifier: 'SII-92',  title: 'Min Købmand fetcher: Longjohn merchantId 769 (Holluf Pile, 5220)',             state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: ['SII-95'] },
  { id: 'sii-94',  identifier: 'SII-94',  title: 'Rema fetcher: cphapp catalog dump, keep bar_codes',                           state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-95',  identifier: 'SII-95',  title: 'SPAR fetcher: Longjohn merchantId 1329 (Odense NØ, optional)',                state: 'Backlog',     milestone: M1, estimate: null, priority: 4, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-96',  identifier: 'SII-96',  title: 'Nemlig fetcher: timestamp/timeslot group walk',                               state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-97',  identifier: 'SII-97',  title: 'Salling Algolia: Netto, Føtex, BilkaToGo fetchers',                           state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-98',  identifier: 'SII-98',  title: 'Lidl fetcher: /q/api/search offset walk',                                     state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-112', identifier: 'SII-112', title: 'Terraform: stop restoring the priskurven placeholder function.zip',           state: 'In Progress', milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: '2026-09-28T07:40:49.849Z', completedAt: null,                       blocks: [] },
  { id: 'sii-113', identifier: 'SII-113', title: 'CI: build and deploy priskurven-collect on push to main',                     state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
  { id: 'sii-114', identifier: 'SII-114', title: 'Publish the history Worker at priskurven.siig.tech',                         state: 'Todo',        milestone: M1, estimate: null, priority: 0, assignee: 'user-kasper', label: 'agentic', startedAt: null,                       completedAt: null,                       blocks: [] },
];

const idByIdentifier = new Map(ISSUE_TABLE.map((row) => [row.identifier, row.id]));

// relatedIssue.id is the Linear issue id. The scheduler drops the relation
// when that id is not in the issue set, so an identifier like "SII-93" draws nothing.
const ISSUES = Object.freeze(ISSUE_TABLE.map((row, idx) => {
  const relations = row.blocks.map((blocked) => {
    const id = idByIdentifier.get(blocked);
    if (!id) throw new Error(`fixture: ${row.identifier} blocks unknown issue ${blocked}`);
    return {
      id: `rel-${row.identifier}-${blocked}`,
      type: 'blocks',
      relatedIssue: { id, identifier: blocked },
    };
  });
  return Object.freeze({
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    url: `https://linear.app/siig/issue/${row.identifier}`,
    estimate: row.estimate,
    priority: row.priority,
    priorityLabel: ['Urgent', 'High', 'Medium', 'Low'][row.priority - 1] ?? 'No priority',
    sortOrder: (idx + 1) * 1000,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    dueDate: null,
    state: stateByName(row.state),
    assignee: userById(row.assignee),
    projectMilestone: milestoneByName(row.milestone),
    labels: { nodes: [{ name: row.label, color: row.label === 'human' ? '#EB5757' : '#4EA7FC' }] },
    relations: { nodes: relations },
  });
}));

const HISTORY = Object.freeze({});

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
