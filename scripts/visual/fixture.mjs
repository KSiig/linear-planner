// Visual harness mock-data fixture. Consumed by the route handler in
// run.mjs. The handler dispatches on substrings of body.query and reads
// body.variables to build each response — there is no static JSON file.
//
// Domain is priskurven milestone "M1 — Shelf collector" (Linear milestone
// 357094eb-a836-4978-946d-eadd97339f14): 16 issues, one assignee.
//
// The fixture answers the queries the app sends today (src/linear.ts): the
// project list, the project milestones, the project teams, the team workflow
// states, the team members, and the project issues with the full issue field
// set. It carries no estimate, no state history, no assignee interval and no
// count field — the app does not ask for them, so the fixture does not
// answer them.
//
// The harness freezes the clock at 2026-10-05T07:00:00.000Z and renders the
// app in Europe/Paris, so the calendar day of every capture is 2026-10-05.
// Every date below is relative to that day, so the due windows and the
// recency windows of the Overview hold the rows they are meant to hold.

export const TEAM = Object.freeze({
  id: 'team-siig',
  name: 'Siig',
  key: 'SII',
});

export const PROJECT = Object.freeze({
  id: 'proj-priskurven',
  name: 'priskurven',
});

// Filter-menu project only. Its issue id is not in ISSUE_TABLE.
export const ADHOC_PROJECT = Object.freeze({
  id: 'proj-adhoc',
  name: 'Ad-hoc',
  issueId: 'iss-adhoc',
});

export const SAVED_VIEWS = Object.freeze([
  Object.freeze({
    id: 'view-huskob',
    name: 'Huskøb',
    mode: 'overview',
    query: Object.freeze({
      projectIds: [],
      stateTypes: [],
      stateIds: [],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    }),
  }),
]);

export const MILESTONES = Object.freeze([
  Object.freeze({ id: 'ms-m1', name: 'M1 — Shelf collector', sortOrder: 1042 }),
]);

// The workflow states of the team. The app sends a state id in the Status
// filter and matches the configured done states against the id, so every
// state carries its id.
export const STATES = Object.freeze([
  Object.freeze({ id: 'st-backlog',  name: 'Backlog',     type: 'backlog',   position: 0, color: '#bec2c8' }),
  Object.freeze({ id: 'st-todo',     name: 'Todo',        type: 'unstarted', position: 1, color: '#e2e2e2' }),
  Object.freeze({ id: 'st-progress', name: 'In Progress', type: 'started',   position: 2, color: '#f2c94c' }),
  Object.freeze({ id: 'st-done',     name: 'Done',        type: 'completed', position: 3, color: '#5e6ad2' }),
]);

export const USERS = Object.freeze([
  Object.freeze({ id: 'user-kasper', name: 'Kasper Siig', displayName: 'Kasper', avatarUrl: null, active: true }),
]);

/**
 * The calendar day of every capture.
 *
 * The harness clock is 2026-10-05T07:00:00.000Z and the app runs in
 * Europe/Paris, so the local day of a capture is this one.
 */
const TODAY = '2026-10-05';

/** The day `offset` calendar days from TODAY, as `YYYY-MM-DD`. */
function day(offset) {
  const [year, month, dayOfMonth] = TODAY.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth + offset));
  return date.toISOString().slice(0, 10);
}

function stateByName(name) {
  const s = STATES.find((x) => x.name === name);
  if (!s) throw new Error(`fixture: unknown state ${name}`);
  return { id: s.id, name: s.name, type: s.type, color: s.color, position: s.position };
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

// The issue set of the milestone.
//
// Every row carries the facts the app reads: the state, the milestone, the
// labels, the assignee, the dates, the body, and the `blocks` edges. The
// `blocks` list names the issues this issue blocks — a `blocks` relation
// lives on the blocker and points at the blocked issue.
//
// The set covers the rows of every Overview card:
//   - overdue           SII-103, SII-112
//   - next              SII-92, SII-97, SII-98, SII-113
//   - soon              SII-94
//   - no date           SII-93, SII-99, SII-101, SII-114, SII-95 (ideas)
//   - later             SII-96
//   - blocked           SII-92, SII-103, SII-94, SII-95
//   - recently updated  SII-93, SII-92, SII-103, SII-99
//   - recently done     SII-110, SII-109, SII-91
//   - deadlines         SII-92, SII-97, SII-98, SII-113
//   - milestones        M1 — Shelf collector, and SII-114 without a milestone
const ISSUE_TABLE = [
  {
    id: 'sii-91',
    identifier: 'SII-91',
    title: 'Homelab Terraform: D1, WIF, Cloud Function, Scheduler, secret placeholders',
    state: 'Done',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: '2026-09-20T13:19:31.498Z',
    completedAt: '2026-09-22T07:44:05.208Z',
    createdAt: '2026-09-20T13:19:31.498Z',
    updatedAt: '2026-09-22T07:44:05.208Z',
    description: 'The homelab Terraform module: D1, the write-from-induction function, the scheduler and the secret placeholders. Everything the collector needs to run is in place.',
    blocks: ['SII-110', 'SII-109', 'SII-101', 'SII-99'],
  },
  {
    id: 'sii-109',
    identifier: 'SII-109',
    title: 'SII-93a — Homelab D1 migration: priskurven.observations',
    state: 'Done',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: '2026-09-20T14:25:51.057Z',
    completedAt: '2026-09-22T07:44:05.651Z',
    createdAt: '2026-09-20T14:25:51.057Z',
    updatedAt: '2026-09-22T07:44:05.651Z',
    description: 'The D1 tables of priskurven.observations, moved to the homelab with the writer in front of them.',
    blocks: ['SII-93'],
  },
  {
    id: 'sii-110',
    identifier: 'SII-110',
    title: 'GitHub Actions secrets on KSiig/priskurven',
    state: 'Done',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'human',
    dueDate: null,
    startedAt: '2026-09-28T06:00:00.000Z',
    completedAt: '2026-09-28T07:19:17.001Z',
    createdAt: '2026-09-28T06:00:00.000Z',
    updatedAt: '2026-09-28T07:19:17.001Z',
    description: 'The secrets the workflow needs, added to KSiig/priskurven and read by the deploy job.',
    blocks: [],
  },
  {
    id: 'sii-93',
    identifier: 'SII-93',
    title: 'SII-93b — Source interface + writer + tests (priskurven)',
    state: 'In Progress',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: '2026-09-20T13:31:03.890Z',
    completedAt: null,
    createdAt: '2026-09-20T13:31:03.890Z',
    updatedAt: '2026-10-04T08:12:44.000Z',
    description: [
      '## Scope',
      '',
      '- The source interface of `priskurven.observations`',
      '- One writer per source',
      '- Tests for the retry path',
      '',
      'The writer keeps the **raw payload** next to the parsed row, so a source',
      'can be replayed without a new fetch.',
    ].join('\n'),
    blocks: ['SII-103', 'SII-92'],
  },
  {
    id: 'sii-101',
    identifier: 'SII-101',
    title: 'CI: fetcher fixtures + deploy via WIF on main',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    description: 'The CI fixtures of the fetcher, and the deploy through WIF on main. A fixture has to answer every merchant the fetcher supports.',
    blocks: [],
  },
  {
    id: 'sii-99',
    identifier: 'SII-99',
    title: 'History query: GET /v1/history?source=&sku=',
    state: 'In Progress',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: '2026-09-20T14:20:08.105Z',
    completedAt: null,
    createdAt: '2026-09-20T14:20:08.105Z',
    updatedAt: '2026-09-25T10:04:12.000Z',
    description: 'The history query of the API, with `source` and `sku` as the two filters it accepts.',
    blocks: [],
  },
  {
    id: 'sii-103',
    identifier: 'SII-103',
    title: 'Orchestrator: run all sources, isolate failures, always insert',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(-7),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-10-01T09:41:00.000Z',
    description: [
      'The orchestrator runs every source and isolates the failures:',
      '',
      '1. Run all sources, one after the other.',
      '2. Keep a failing source from stopping the others.',
      '3. Insert the rows that came back, always.',
      '',
      'A source that fails is reported with the error it returned, and the run',
      'continues with the next source. The rows of one source are written in a',
      'single transaction, so a half-written source never reaches the database.',
    ].join('\n'),
    blocks: ['SII-94', 'SII-95'],
  },
  {
    id: 'sii-92',
    identifier: 'SII-92',
    title: 'Min Købmand fetcher: Longjohn merchantId 769 (Holluf Pile, 5220)',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(0),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-10-03T11:20:30.000Z',
    description: [
      'The Min Købmand fetcher walks the merchant page of <b>Holluf Pile</b> (5220).',
      '',
      '- Collect the product list of the merchant.',
      '- Send the **SKU list** to the writer.',
    ].join('\n'),
    blocks: ['SII-95'],
  },
  {
    id: 'sii-94',
    identifier: 'SII-94',
    title: 'Rema fetcher: cphapp catalog dump, keep bar_codes',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(15),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-16T08:00:00.000Z',
    updatedAt: '2026-09-18T08:00:00.000Z',
    description: 'The Rema fetcher reads the cphapp catalog dump. The bar codes stay in the payload, because the writer keys the rows by them.',
    blocks: [],
  },
  {
    id: 'sii-95',
    identifier: 'SII-95',
    title: 'SPAR fetcher: Longjohn merchantId 1329 (Odense NØ, optional)',
    state: 'Backlog',
    milestone: M1,
    priority: 4,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-10T08:00:00.000Z',
    updatedAt: '2026-09-12T08:00:00.000Z',
    description: 'The SPAR fetcher for the Longjohn merchant 1329 in Odense NØ. The merchant is optional, so the fetcher lands when the others are done.',
    blocks: [],
  },
  {
    id: 'sii-96',
    identifier: 'SII-96',
    title: 'Nemlig fetcher: timestamp/timeslot group walk',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(46),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-13T08:00:00.000Z',
    updatedAt: '2026-09-15T08:00:00.000Z',
    description: 'The Nemlig fetcher walks the timestamp and timeslot groups of the merchant page.',
    blocks: [],
  },
  {
    id: 'sii-97',
    identifier: 'SII-97',
    title: 'Salling Algolia: Netto, Føtex, BilkaToGo fetchers',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(4),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-16T08:00:00.000Z',
    updatedAt: '2026-09-18T08:00:00.000Z',
    description: 'The Salling Algolia fetchers for Netto, Føtex and BilkaToGo. They share one client, so the three merchants come from one walk.',
    blocks: [],
  },
  {
    id: 'sii-98',
    identifier: 'SII-98',
    title: 'Lidl fetcher: /q/api/search offset walk',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(9),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-17T08:00:00.000Z',
    updatedAt: '2026-09-19T08:00:00.000Z',
    description: 'The Lidl fetcher walks the offsets of /q/api/search until the merchant page runs out of products.',
    blocks: [],
  },
  {
    id: 'sii-112',
    identifier: 'SII-112',
    title: 'Terraform: stop restoring the priskurven placeholder function.zip',
    state: 'In Progress',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(-5),
    startedAt: '2026-09-18T08:00:00.000Z',
    completedAt: null,
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-19T08:00:00.000Z',
    description: 'The Terraform state restores a placeholder function.zip on every apply. The state has to stop that.',
    blocks: [],
  },
  {
    id: 'sii-113',
    identifier: 'SII-113',
    title: 'CI: build and deploy priskurven-collect on push to main',
    state: 'Todo',
    milestone: M1,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: day(11),
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-19T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
    description: 'The workflow builds priskurven-collect on every push to main and deploys the artifact.',
    blocks: [],
  },
  {
    id: 'sii-114',
    identifier: 'SII-114',
    title: 'Publish the history Worker at priskurven.siig.tech',
    state: 'Todo',
    milestone: null,
    priority: 0,
    assignee: 'user-kasper',
    label: 'agentic',
    dueDate: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-08T08:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    description: 'The history Worker, published at priskurven.siig.tech. The issue sits outside the milestone on purpose.',
    blocks: [],
  },
];

const issueByIdentifier = new Map(ISSUE_TABLE.map((row) => [row.identifier, row]));

/**
 * The `blocks` edges of the set, from both sides.
 *
 * A `blocks` relation node lives on the blocker and names the blocked issue
 * through `relatedIssue`. The blocked issue sees the same edge from the other
 * side, through `inverseRelations`. The app reads that inverse direction to
 * know which open issue blocks it, so both sides carry the same relation id.
 */
function indexInverseRelations() {
  const inverse = new Map();
  for (const row of ISSUE_TABLE) {
    for (const blocked of row.blocks) {
      const related = issueByIdentifier.get(blocked);
      if (!related) throw new Error(`fixture: ${row.identifier} blocks unknown issue ${blocked}`);
      const node = {
        id: `rel-${row.identifier}-${blocked}`,
        type: 'blocks',
        relatedIssue: {
          id: row.id,
          identifier: row.identifier,
          title: row.title,
          state: { type: stateByName(row.state).type },
        },
      };
      const list = inverse.get(blocked) ?? [];
      list.push(node);
      inverse.set(blocked, list);
    }
  }
  return inverse;
}

const INVERSE_RELATIONS = indexInverseRelations();

// relatedIssue.id is the Linear issue id. A relation is dropped when that id
// is not in the issue set, so an identifier like "SII-93" draws nothing.
const ISSUES = Object.freeze(ISSUE_TABLE.map((row, idx) => {
  const relations = row.blocks.map((blocked) => {
    const related = issueByIdentifier.get(blocked);
    if (!related) throw new Error(`fixture: ${row.identifier} blocks unknown issue ${blocked}`);
    return {
      id: `rel-${row.identifier}-${blocked}`,
      type: 'blocks',
      relatedIssue: {
        id: related.id,
        identifier: blocked,
        title: related.title,
        state: { type: stateByName(related.state).type },
      },
    };
  });
  return Object.freeze({
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    url: `https://linear.app/siig/issue/${row.identifier}`,
    priority: row.priority,
    priorityLabel: ['Urgent', 'High', 'Medium', 'Low'][row.priority - 1] ?? 'No priority',
    sortOrder: (idx + 1) * 1000,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    dueDate: row.dueDate,
    description: row.description,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    team: { id: TEAM.id },
    project: { id: PROJECT.id, name: PROJECT.name },
    state: stateByName(row.state),
    assignee: userById(row.assignee),
    projectMilestone: milestoneByName(row.milestone),
    labels: { nodes: [{ name: row.label, color: row.label === 'human' ? '#EB5757' : '#4EA7FC' }] },
    relations: { nodes: relations },
    inverseRelations: { nodes: INVERSE_RELATIONS.get(row.identifier) ?? [] },
  });
}));

export { ISSUES };
