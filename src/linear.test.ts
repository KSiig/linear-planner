import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isPlannableIssue,
  addBlocksRelation,
  removeRelation,
  fetchProjectIssues,
  fetchTeamWorkflowStates,
  fetchTeamMembers,
  fetchIssue,
  issueUpdate,
  issueUpdateFields,
  classifyLinearError,
  LinearApiError,
} from "./linear";
import type { LinearIssue } from "./linear";

// The Linear API client reads the access token through `./auth`; stub it so the
// fetch mock below is the only thing the request depends on. The rest of the
// module stays real, so the scope-error detection is the one `./auth` owns.
vi.mock("./auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth")>();
  return { ...actual, getAccessToken: vi.fn(async () => "test-token") };
});

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
    createdAt: "2025-12-01T00:00:00.000Z",
    state: { id: "state-todo", name: "To do", type: "unstarted", color: "#ccc", position: 1 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    project: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

describe("addBlocksRelation", () => {
  it("adds a blocks relation on the blocker issue pointing at the blocked one", () => {
    const issues = [makeIssue({ id: "a", identifier: "A-1" }), makeIssue({ id: "b", identifier: "A-2" })];
    const next = addBlocksRelation(issues, "a", "b", "rel-1");
    const blocker = next.find((i) => i.id === "a")!;
    expect(blocker.relations.nodes).toEqual([
      { id: "rel-1", type: "blocks", relatedIssue: { id: "b", identifier: "A-2", title: "A-2", state: { type: "unstarted" } } },
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
      makeIssue({ id: "a", identifier: "A-1", relations: { nodes: [{ id: "rel-old", type: "blocks", relatedIssue: { id: "b", identifier: "A-2", title: "A-2", state: { type: "unstarted" } } }] } }),
      makeIssue({ id: "b", identifier: "A-2" }),
    ];
    const next = addBlocksRelation(issues, "a", "b", "rel-new");
    expect(next.find((i) => i.id === "a")!.relations.nodes).toHaveLength(1);
    expect(next.find((i) => i.id === "a")!.relations.nodes[0].id).toBe("rel-old");
  });

  it("falls back to an empty identifier when the blocked issue is absent", () => {
    const issues = [makeIssue({ id: "a", identifier: "A-1" })];
    const next = addBlocksRelation(issues, "a", "missing", "rel-1");
    expect(next.find((i) => i.id === "a")!.relations.nodes[0].relatedIssue).toEqual({ id: "missing", identifier: "", title: "", state: { type: "unknown" } });
  });
});

describe("removeRelation", () => {
  it("drops the relation node with the matching id", () => {
    const issues = [
      makeIssue({ id: "a", identifier: "A-1", relations: { nodes: [{ id: "rel-1", type: "blocks", relatedIssue: { id: "b", identifier: "A-2", title: "A-2", state: { type: "unstarted" } } }] } }),
      makeIssue({ id: "b", identifier: "A-2" }),
    ];
    const next = removeRelation(issues, "rel-1");
    expect(next.find((i) => i.id === "a")!.relations.nodes).toEqual([]);
  });

  it("only copies issues that held the relation, leaving others by identity", () => {
    const issues = [
      makeIssue({ id: "a", identifier: "A-1", relations: { nodes: [{ id: "rel-1", type: "blocks", relatedIssue: { id: "b", identifier: "A-2", title: "A-2", state: { type: "unstarted" } } }] } }),
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
      createdAt: "2026-10-01T09:00:00.000Z",
      assignee: null,
      state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#ccc", position: 1 },
      team: { id: "team-1" },
      projectMilestone: null,
      project: { id: "project-1", name: "M3" },
      labels: { nodes: [] },
      relations: { nodes: [] },
      inverseRelations: { nodes: [] },
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
    expect(body.query).toContain("createdAt");
    expect(body.query).toMatch(/project\s*\{\s*id\s+name\s*\}/);
    expect(body.query).toMatch(/inverseRelations\s*\{/);
    expect(body.query).toMatch(/relatedIssue\s*\{\s*id\s+identifier\s+title\s+state\s*\{\s*type\s*\}/);
    expect(body.query).toMatch(/state\s*\{\s*id\b/);
    expect(body.query).toMatch(/team\s*\{\s*id\s*\}/);

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toBe("Issue body");
    expect(issues[0].updatedAt).toBe("2026-10-29T12:34:56.789Z");
    expect(issues[0].createdAt).toBe("2026-10-01T09:00:00.000Z");
    expect(issues[0].project).toEqual({ id: "project-1", name: "M3" });
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

  it("returns incoming relations with the related issue details", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: issuesPage([issueNode({
          inverseRelations: {
            nodes: [{
              id: "rel-1",
              type: "blocks",
              relatedIssue: { id: "blocker-1", identifier: "SII-2", title: "Blocker", state: { type: "started" } },
            }],
          },
        })]),
      }),
    });

    const issues = await fetchProjectIssues("proj-1");

    expect(issues[0].inverseRelations.nodes).toEqual([
      {
        id: "rel-1",
        type: "blocks",
        relatedIssue: { id: "blocker-1", identifier: "SII-2", title: "Blocker", state: { type: "started" } },
      },
    ]);
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

describe("fetchTeamWorkflowStates", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function requestBody(callIndex: number) {
    return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
  }

  it("asks for the states of one team and keeps their ids", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          team: {
            states: {
              nodes: [
                { id: "state-todo", name: "Todo", type: "unstarted", position: 1, color: "#ccc" },
                { id: "state-done", name: "Done", type: "completed", position: 3, color: "#5e6ad2" },
              ],
            },
          },
        },
      }),
    });

    const states = await fetchTeamWorkflowStates("team-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(0);
    expect(body.variables).toEqual({ teamId: "team-1" });
    expect(body.query).toMatch(/team\(id:\s*\$teamId\)/);
    expect(body.query).toMatch(/states\s*\{/);

    expect(states.map((state) => state.id)).toEqual(["state-todo", "state-done"]);
    expect(states[0]).toEqual({
      id: "state-todo",
      name: "Todo",
      type: "unstarted",
      position: 1,
      color: "#ccc",
    });
  });
});

describe("issueUpdate", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function requestBody(callIndex: number) {
    return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
  }

  function okResponse(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ data }) };
  }

  it("sends the issue id and the state id", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await issueUpdate("issue-1", "state-done");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(0);
    expect(body.variables).toEqual({ id: "issue-1", stateId: "state-done" });
    expect(body.query).toMatch(/issueUpdate\(id:\s*\$id/);
    expect(body.query).toMatch(/success/);
  });

  it("resolves when Linear confirms the change", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await expect(issueUpdate("issue-1", "state-done")).resolves.toBeUndefined();
  });

  it("throws when Linear reports success as false", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: false } }));

    await expect(issueUpdate("issue-1", "state-done")).rejects.toThrow(
      /did not move issue issue-1 to state state-done/,
    );
  });

  it("throws when the response carries no result", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await expect(issueUpdate("issue-1", "state-done")).rejects.toThrow(/no state change result/);
  });

  it("throws when the response carries GraphQL errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: "Entity not found" }] }),
    });

    await expect(issueUpdate("issue-1", "state-done")).rejects.toThrow("Entity not found");
  });

  it("reports a rejected state change as a classified API error", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: false } }));

    const error = await issueUpdate("issue-1", "state-done").catch((e) => e);

    expect(error).toBeInstanceOf(LinearApiError);
    expect((error as LinearApiError).kind).toBe("graphql");
  });
});

describe("issueUpdateFields", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function requestBody(callIndex: number) {
    return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
  }

  function okResponse(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ data }) };
  }

  it("sends the changed fields as one input object", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await issueUpdateFields("issue-1", { priority: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(0);
    expect(body.variables).toEqual({ id: "issue-1", input: { priority: 2 } });
    expect(body.query).toMatch(/issueUpdate\(id:\s*\$id/);
    expect(body.query).toMatch(/input:\s*\$input/);
  });

  it("sends the assignee and the due date", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await issueUpdateFields("issue-1", { assigneeId: "user-2", dueDate: "2026-12-24" });

    expect(requestBody(0).variables).toEqual({
      id: "issue-1",
      input: { assigneeId: "user-2", dueDate: "2026-12-24" },
    });
  });

  it("clears the assignee and the due date with null", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await issueUpdateFields("issue-1", { assigneeId: null, dueDate: null });

    expect(requestBody(0).variables).toEqual({
      id: "issue-1",
      input: { assigneeId: null, dueDate: null },
    });
  });

  it("mentions only the fields the change touches", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await issueUpdateFields("issue-1", { priority: 1 });

    expect(Object.keys(requestBody(0).variables.input)).toEqual(["priority"]);
  });

  it("resolves when Linear confirms the change", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: true } }));

    await expect(issueUpdateFields("issue-1", { priority: 1 })).resolves.toBeUndefined();
  });

  it("throws when Linear reports success as false", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: false } }));

    await expect(issueUpdateFields("issue-1", { priority: 1 })).rejects.toThrow(
      /did not update issue issue-1/,
    );
  });

  it("throws when the response carries no result", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await expect(issueUpdateFields("issue-1", { priority: 1 })).rejects.toThrow(/no update result/);
  });

  it("reports a rejected change as a classified API error", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ issueUpdate: { success: false } }));

    const error = await issueUpdateFields("issue-1", { priority: 1 }).catch((e) => e);

    expect(error).toBeInstanceOf(LinearApiError);
    expect((error as LinearApiError).kind).toBe("graphql");
  });
});

describe("fetchTeamMembers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function requestBody(callIndex: number) {
    return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
  }

  it("asks the team for its members", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          team: {
            members: {
              nodes: [
                { id: "user-1", name: "Kasper", displayName: "Kasper", avatarUrl: null, active: true },
                { id: "user-2", name: "Robin", displayName: "Robin", avatarUrl: "https://avatar", active: false },
              ],
            },
          },
        },
      }),
    });

    const members = await fetchTeamMembers("team-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(0);
    expect(body.variables).toEqual({ teamId: "team-1" });
    expect(body.query).toMatch(/team\(id:\s*\$teamId\)/);
    expect(body.query).toMatch(/members\s*\(first:\s*50\)/);

    expect(members.map((member) => member.id)).toEqual(["user-1", "user-2"]);
    expect(members[1]).toEqual({
      id: "user-2",
      name: "Robin",
      displayName: "Robin",
      avatarUrl: "https://avatar",
      active: false,
    });
  });

  it("fails when the team does not exist", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { team: null } }),
    });

    await expect(fetchTeamMembers("team-1")).rejects.toThrow(/Team not found/);
  });
});

describe("fetchIssue", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function requestBody(callIndex: number) {
    return JSON.parse(String(fetchMock.mock.calls[callIndex][1].body));
  }

  it("reads one issue again", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          issue: {
            id: "issue-1",
            identifier: "SII-182",
            title: "Add the quick actions",
            url: "https://linear.app/siig/issue/SII-182",
            priority: 0,
            priorityLabel: "No priority",
            sortOrder: 1,
            startedAt: null,
            completedAt: "2026-10-30T09:00:00.000Z",
            dueDate: null,
            description: null,
            updatedAt: "2026-10-30T09:00:00.000Z",
            createdAt: "2026-10-01T08:00:00.000Z",
            assignee: null,
            state: { id: "state-done", name: "Done", type: "completed", color: "#5e6ad2", position: 2 },
            team: { id: "team-1" },
            projectMilestone: null,
            project: null,
            labels: { nodes: [] },
            relations: { nodes: [] },
            inverseRelations: { nodes: [] },
          },
        },
      }),
    });

    const issue = await fetchIssue("issue-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = requestBody(0);
    expect(body.variables).toEqual({ id: "issue-1" });
    expect(body.query).toMatch(/issue\(id:\s*\$id\)/);

    expect(issue?.id).toBe("issue-1");
    expect(issue?.completedAt).toBe("2026-10-30T09:00:00.000Z");
    expect(issue?.updatedAt).toBe("2026-10-30T09:00:00.000Z");
  });

  it("returns null when the issue is gone", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { issue: null } }),
    });

    await expect(fetchIssue("issue-1")).resolves.toBeNull();
  });
});

describe("classifyLinearError", () => {
  it("keeps the classification of an already classified error", () => {
    expect(classifyLinearError(new LinearApiError("network", "boom"))).toBe("network");
  });

  it("recognizes an OAuth scope rejection", () => {
    expect(classifyLinearError(new Error("Invalid scope: write required"))).toBe("oauth-scope");
  });

  it("recognizes a rejected input", () => {
    expect(classifyLinearError(new Error("Invalid input: issueId is required"))).toBe("validation");
  });

  it("recognizes a request that never reached Linear", () => {
    expect(classifyLinearError(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("treats an ordinary GraphQL error as a GraphQL error", () => {
    expect(classifyLinearError(new Error("Entity not found"))).toBe("graphql");
  });
});
