import { afterEach, describe, expect, it } from "vitest";
import {
  emptyPlannerQuery,
  isPlannerQuery,
  matchesQuery,
  normalizePlannerQuery,
  scopeProjectIds,
  type QueryIssue,
} from "./plannerQuery";
import { getDueWindowConfig, loadDueWindowConfig, saveDueWindowConfig } from "./dueWindows";

const TODAY = "2026-10-23";
const HUSKOB = "huskob";
const AD_HOC = "ad-hoc";

afterEach(() => {
  // Read the boundaries back, so the boundaries in effect are the standard
  // ones again.
  loadDueWindowConfig();
});

function issue(overrides: Partial<QueryIssue> = {}): QueryIssue {
  return {
    project: { id: AD_HOC },
    state: { id: "state-started", type: "started" },
    assignee: { id: "kasper" },
    priority: 2,
    labels: { nodes: [{ name: "Bug" }] },
    projectMilestone: { id: "m1" },
    dueDate: "2026-11-28",
    ...overrides,
  };
}

describe("scopeProjectIds", () => {
  it("uses a non-empty projectIds set in that order", () => {
    const query = { ...emptyPlannerQuery(), projectIds: ["B", "A"] };
    expect(scopeProjectIds(query, ["A", "B", "C"])).toEqual(["B", "A"]);
  });

  it("uses every selectable id in fetchProjects order when projectIds is empty", () => {
    expect(scopeProjectIds(emptyPlannerQuery(), ["A", "B"])).toEqual(["A", "B"]);
  });

  it("loads no issues when there are no selectable projects and projectIds is empty", () => {
    expect(scopeProjectIds(emptyPlannerQuery(), [])).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("matches an Ad-hoc issue when projectIds is empty", () => {
    expect(matchesQuery(issue(), emptyPlannerQuery(), TODAY)).toBe(true);
  });

  it("drops an Ad-hoc issue when projectIds is only Huskøb", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [HUSKOB] };
    expect(matchesQuery(issue(), query, TODAY)).toBe(false);
  });

  it("matches the same issue when projectIds contains the Ad-hoc id", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC] };
    expect(matchesQuery(issue(), query, TODAY)).toBe(true);
  });

  it("matches due 2026-11-28 as soon and not as next", () => {
    const soon = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "soon" as const };
    const next = { ...soon, dueWindow: "next" as const };
    expect(matchesQuery(issue(), soon, TODAY)).toBe(true);
    expect(matchesQuery(issue(), next, TODAY)).toBe(false);
  });

  it("matches a null due date as none and not as soon", () => {
    const none = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "none" as const };
    const soon = { ...none, dueWindow: "soon" as const };
    expect(matchesQuery(issue({ dueDate: null }), none, TODAY)).toBe(true);
    expect(matchesQuery(issue({ dueDate: null }), soon, TODAY)).toBe(false);
  });

  it("matches assignee unassigned when the issue has no assignee", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC], assigneeIds: ["unassigned"] };
    expect(matchesQuery(issue({ assignee: null }), query, TODAY)).toBe(true);
    expect(matchesQuery(issue(), query, TODAY)).toBe(false);
  });
});

describe("the status filter", () => {
  it("filters by the workflow state id", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC], stateIds: ["state-started"] };
    expect(matchesQuery(issue(), query, TODAY)).toBe(true);
    expect(matchesQuery(issue({ state: { id: "state-done", type: "started" } }), query, TODAY)).toBe(false);
  });

  it("keeps the legacy state type filter working", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC], stateTypes: ["started"] };
    expect(matchesQuery(issue(), query, TODAY)).toBe(true);
    expect(matchesQuery(issue({ state: { id: "state-done", type: "completed" } }), query, TODAY)).toBe(false);
  });

  it("reads a query that carries no state ids", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC] };
    delete query.stateIds;
    expect(matchesQuery(issue(), query, TODAY)).toBe(true);
  });
});

describe("the due windows", () => {
  const next = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "next" as const };

  it("counts today and day fourteen as next and day fifteen as soon", () => {
    expect(matchesQuery(issue({ dueDate: "2026-10-23" }), next, TODAY)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-11-06" }), next, TODAY)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-11-07" }), next, TODAY)).toBe(false);
  });

  it("keeps the window name in the query, not the days it covers", () => {
    const query = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "soon" as const };
    expect(query.dueWindow).toBe("soon");
    expect(Object.keys(query)).toContain("dueWindow");
    expect(normalizePlannerQuery(query).dueWindow).toBe("soon");
  });
});

describe("the due windows with configured boundaries", () => {
  const config = { nextEndDays: 30, soonEndDays: 60 };

  it("counts Next through the configured Next boundary", () => {
    const next = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "next" as const };
    expect(matchesQuery(issue({ dueDate: "2026-11-22" }), next, TODAY, config)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-11-23" }), next, TODAY, config)).toBe(false);
  });

  it("counts Soon from the day after Next through the configured Soon boundary", () => {
    const soon = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "soon" as const };
    expect(matchesQuery(issue({ dueDate: "2026-11-22" }), soon, TODAY, config)).toBe(false);
    expect(matchesQuery(issue({ dueDate: "2026-11-23" }), soon, TODAY, config)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-12-22" }), soon, TODAY, config)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-12-23" }), soon, TODAY, config)).toBe(false);
  });

  it("counts Later from the day after the configured Soon boundary", () => {
    const later = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "later" as const };
    expect(matchesQuery(issue({ dueDate: "2026-12-23" }), later, TODAY, config)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-12-22" }), later, TODAY, config)).toBe(false);
  });

  it("uses the boundaries in effect when no configuration is given", () => {
    const next = { ...emptyPlannerQuery(), projectIds: [AD_HOC], dueWindow: "next" as const };
    saveDueWindowConfig(config);
    expect(getDueWindowConfig()).toEqual(config);
    expect(matchesQuery(issue({ dueDate: "2026-11-22" }), next, TODAY)).toBe(true);
    expect(matchesQuery(issue({ dueDate: "2026-11-23" }), next, TODAY)).toBe(false);
  });
});

describe("isPlannerQuery", () => {
  it("reads a query that carries no state ids", () => {
    const legacy = {
      projectIds: [AD_HOC],
      stateTypes: ["started"],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    };
    expect(isPlannerQuery(legacy)).toBe(true);
  });

  it("rejects a query whose state ids are not strings", () => {
    expect(isPlannerQuery({ ...emptyPlannerQuery(), stateIds: [1] })).toBe(false);
  });
});

describe("normalizePlannerQuery", () => {
  it("fills in the state ids of a legacy query and keeps the legacy filter", () => {
    const legacy = {
      projectIds: [AD_HOC],
      stateTypes: ["started"],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    };
    expect(normalizePlannerQuery(legacy)).toEqual({ ...emptyPlannerQuery(), projectIds: [AD_HOC], stateTypes: ["started"] });
  });

  it("keeps the keys of an empty query in one order", () => {
    expect(Object.keys(normalizePlannerQuery(emptyPlannerQuery()))).toEqual(Object.keys(emptyPlannerQuery()));
  });
});
