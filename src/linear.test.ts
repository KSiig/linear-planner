import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPlannableIssue, addBlocksRelation, removeRelation, fetchProjectIssues } from "./linear";
import type { LinearIssue } from "./linear";

// The Linear API client reads the access token through `./auth`; stub it so the
// fetch mock below is the only thing the request depends on.
vi.mock("./auth", () => ({ getAccessToken: vi.fn(async () => "test-token") }));

function withLabels(...names: string[]) {
  return {
    labels: { nodes: names.map((name) => ({ name, color: "#ccc" })) },
    state: { name: "In Progress", type: "started", color: "#ccc", position: 1 },
  };
}

function withState(name: string) {
  return { labels: { nodes: [] }, state: { name, type: "started", color: "#ccc", position: 1 } };
}

describe("isPlannableIssue", () => {
  it("includes issues with no labels", () => {
    expect(isPlannableIssue(withLabels())).toBe(true);
  });

  it("includes issues with unrelated labels", () => {
    expect(isPlannableIssue(withLabels("bug", "frontend"))).toBe(true);
  });

  it("excludes issues tagged no-planner", () => {
    expect(isPlannableIssue(withLabels("no-planner"))).toBe(false);
  });

  it("excludes issues with no-planner among other labels", () => {
    expect(isPlannableIssue(withLabels("bug", "no-planner"))).toBe(false);
  });

  it("excludes issues in the Duplicate state", () => {
    expect(isPlannableIssue(withState("Duplicate"))).toBe(false);
  });

  it("includes issues in other states", () => {
    expect(isPlannableIssue(withState("Done"))).toBe(true);
  });
});

function makeIssue(overrides: Partial<LinearIssue> & { id: string; identifier: string }): LinearIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/${overrides.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    startedAt: null,
    completedAt: null,
    dueDate: null,
    description: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    state: { id: "state-todo", name: "To do", type: "unstarted", color: "#ccc", position: 1 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    ...overrides,
  };
}

describe("addBlocksRelation", () => {
  it("adds a blocks relation on the blocker issue pointing at the blocked one", () => {
    const issues = [makeIssue({ id: "a", identifier: "A-1" }), makeIssue({ id: "b", identifier: "A-2" })];
    const next = addBlocksRelation(issues, "a", "b", "rel-1");
    const blocker = next.find((i) => i.id === "a")!;
    expect(blocker.relations.nodes).toEqual([
      { id: "rel-1", type: "blocks", relatedIssue: { id: "b", identifier: "A-2" } },
    ]);
    // The blocked issue is untouched (the relation lives on the blocker).
    expect(next.find((i) => i.id === "b")!.relations.nodes).toEqual([]);
  });

  it("does not mutate the input array or issue objects", () => {
    const issues = [makeIssue({ id: "a", identifier: "A-1" }), makeIssue({ id: "b", identifier: "A-2" })];
    const next = addBlocksRelation(issues, "a", "b", "rel-1");
    expect(issues[0].relations.nodes).toEqual([]);
    expect(next).not.toBe(issues);
    // Unaffected issues keep their identity (no needless re-render churn).
    expect(next.find((i) => i.id === "b")).toBe(issues[1]);
  });

  it("is a no-op when the same blocks relation already exists", () => {
    const issues = [
      makeIssue({ id: "a", identifier: "A-1", relations: { nodes: [{ id: "rel-old", type: "blocks", relatedIssue: { id: "b", identifier: "A-2" } }] } }),
      makeIssue({ id: "b", identifier: "A-2" }),
    ];
    const next = addBlocksRelation(issues, "a", "b", "rel-new");
    expect(next.find((i) => i.id === "a")!.relations.nodes).toHaveLength(1);
    expect(next.find((i) => i.id === "a")!.relations.nodes[0].id).toBe("rel-old");
  });

  it("falls back to an empty identifier when the blocked issue is absent", () => {
    const issues = [makeIssue({ id: "a", identifier: "A-1" })];
    const next = addBlocksRelation(issues, "a", "missing", "rel-1");
    expect(next.find((i) => i.id === "a")!.relations.nodes[0].relatedIssue).toEqual({ id: "missing", identifier: "" });
  });
});

describe("removeRelation", () => {
  it("drops the relation node with the matching id", () => {
    const issues = [
      makeIssue({ id: "a", identifier: "A-1", relations: { nodes: [{ id: "rel-1", type: "blocks", relatedIssue: { id: "b", identifier: "A-2" } }] } }),
      makeIssue({ id: "b", identifier: "A-2" }),
    ];
    const next = removeRelation(issues, "rel-1");
    expect(next.find((i) => i.id === "a")!.relations.nodes).toEqual([]);
  });

  it("only copies issues that held the relation, leaving others by identity", () => {
    const issues = [
      makeIssue({ id: "a", identifier: "A-1", relations: { nodes: [{ id: "rel-1", type: "blocks", relatedIssue: { id: "b", identifier: "A-2" } }] } }),
      makeIssue({ id: "b", identifier: "A-2" }),
    ];
    const next = removeRelation(issues, "rel-1");
    expect(next.find((i) => i.id === "a")).not.toBe(issues[0]);
    expect(next.find((i) => i.id === "b")).toBe(issues[1]);
  });

  it("is a no-op when no relation matches", () => {
    const issues = [makeIssue({ id: "a", identifier: "A-1" })];
    const next = removeRelation(issues, "nope");
    expect(next[0]).toBe(issues[0]);
  });
});

describe("fetchProjectIssues", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A minimal issue node as the API returns it for the project issue selection. */
  function issueNode(overrides: Record<string, unknown> = {}) {
    return {
      id: "issue-1",
      identifier: "SII-1",
      title: "Some issue",
      url: "https://linear.app/siig/issue/SII-1",
      priority: 0,
      priorityLabel: "No priority",
      sortOrder: 1000,
      startedAt: null,
      completedAt: null,
      dueDate: null,
      description: "Issue body",
      updatedAt: "2026-10-29T12:34:56.789Z",
      assignee: null,
      state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#ccc", position: 1 },
      team: { id: "team-1" },
      projectMilestone: null,
      labels: { nodes: [] },
      relations: { nodes: [] },
      ...overrides,
    };
  }

  function issuesPage(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
    return {
      project: {
        issues: { nodes, pageInfo: { hasNextPage, endCursor } },
      },
    };
  }

  function requestBody(callIndex: number) {
    return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
  }

  it("requests the issue facts and returns them verbatim", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: issuesPage([issueNode()]) }),
    });

    const issues = await fetchProjectIssues("proj-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(0);
    expect(body.variables).toEqual({ projectId: "proj-1" });
    expect(body.query).toContain("description");
    expect(body.query).toContain("updatedAt");
    expect(body.query).toMatch(/state\s*\{\s*id\b/);
    expect(body.query).toMatch(/team\s*\{\s*id\s*\}/);

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toBe("Issue body");
    expect(issues[0].updatedAt).toBe("2026-10-29T12:34:56.789Z");
    expect(issues[0].state.id).toBe("state-todo");
    expect(issues[0].team.id).toBe("team-1");
  });

  it("keeps a null description and the raw updatedAt timestamp", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: issuesPage([issueNode({ description: null, updatedAt: "2026-01-02T03:04:05.006Z" })]),
      }),
    });

    const issues = await fetchProjectIssues("proj-1");

    expect(issues[0].description).toBe(null);
    expect(issues[0].updatedAt).toBe("2026-01-02T03:04:05.006Z");
  });

  it("pages through the project and drops issues that are not plannable", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: issuesPage(
            [
              issueNode({ id: "a", identifier: "A-1" }),
              issueNode({ id: "b", identifier: "A-2", labels: { nodes: [{ name: "no-planner", color: "#ccc" }] } }),
            ],
            true,
            "cursor-1",
          ),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: issuesPage([
            issueNode({
              id: "c",
              identifier: "A-3",
              state: { id: "state-dup", name: "Duplicate", type: "completed", color: "#999", position: 3 },
            }),
          ]),
        }),
      });

    const issues = await fetchProjectIssues("proj-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(1).variables).toEqual({ projectId: "proj-1", after: "cursor-1" });
    expect(issues.map((i) => i.identifier)).toEqual(["A-1"]);
  });
});
