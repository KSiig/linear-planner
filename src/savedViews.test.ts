import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "./plannerQuery";
import {
  createSavedView,
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_STORAGE_KEY,
  loadActiveViewId,
  loadDisplaySettings,
  loadPlannerQuery,
  readSavedViewMode,
  saveActiveViewId,
  saveDisplaySettings,
  savePlannerQuery,
  updateSavedView,
} from "./savedViews";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  });
});

describe("planner query draft", () => {
  it("loads a corrupt linear-planner:query value as emptyPlannerQuery()", () => {
    localStorage.setItem("linear-planner:query", "{not-json");
    expect(loadPlannerQuery()).toEqual(emptyPlannerQuery());
  });

  it("round-trips the draft query and clears the active view id", () => {
    const query = { ...emptyPlannerQuery(), stateTypes: ["started"] };
    savePlannerQuery(query);
    expect(loadPlannerQuery()).toEqual(query);
    saveActiveViewId("view-1");
    expect(loadActiveViewId()).toBe("view-1");
    saveActiveViewId(null);
    expect(loadActiveViewId()).toBeNull();
  });

  it("loads a stored legacy query with the state ids filled in and the legacy state types kept", () => {
    localStorage.setItem("linear-planner:query", JSON.stringify({
      projectIds: ["p1"],
      stateTypes: ["started"],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    }));
    const query = loadPlannerQuery();
    expect(query.stateIds).toEqual([]);
    expect(query.stateTypes).toEqual(["started"]);
  });

  it("writes the draft query with the workflow state ids", () => {
    savePlannerQuery({ ...emptyPlannerQuery(), stateIds: ["state-1"] });
    const stored = JSON.parse(localStorage.getItem("linear-planner:query") ?? "{}");
    expect(stored.stateIds).toEqual(["state-1"]);
  });
});

describe("readSavedViewMode", () => {
  it("maps a saved view mode treeGlobal to tree", () => {
    expect(readSavedViewMode("treeGlobal")).toBe("tree");
  });

  it("maps a saved view mode workers to dates", () => {
    expect(readSavedViewMode("workers")).toBe("dates");
  });

  it("returns null for an unknown mode", () => {
    expect(readSavedViewMode("gantt")).toBeNull();
  });
});

describe("createSavedView", () => {
  it("sends POST /api/views with the bearer token and does not send a Linear custom-view mutation", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ id: "v1", name: "Mine", query: emptyPlannerQuery(), mode: "overview" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await createSavedView(fetchImpl, "access-token", {
      name: "Mine",
      query: emptyPlannerQuery(),
      mode: "overview",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/views");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer access-token");
    const body = String(calls[0]?.init?.body);
    expect(body).not.toContain("customViewCreate");
    expect(body).not.toContain("customViewUpdate");
    expect(body).not.toContain("customViewDelete");
    expect(calls[0]?.url).not.toContain("api.linear.app");
  });

  it("sends the workflow state ids with a new saved view", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ id: "v1", name: "Mine", query: emptyPlannerQuery(), mode: "dates" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await createSavedView(fetchImpl, "access-token", {
      name: "Mine",
      query: { ...emptyPlannerQuery(), stateIds: ["state-1"] },
      mode: "dates",
    });

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.query.stateIds).toEqual(["state-1"]);
    expect(body.mode).toBe("dates");
  });
});

describe("updateSavedView", () => {
  it("sends the workflow state ids with an updated saved view", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ id: "v1", name: "Mine", query: emptyPlannerQuery(), mode: "dates" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await updateSavedView(fetchImpl, "access-token", "v1", {
      query: { ...emptyPlannerQuery(), stateIds: ["state-1"] },
    });

    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.query.stateIds).toEqual(["state-1"]);
  });
});

describe("display settings", () => {
  it("reads linear-planner:display", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "overview" }));
    localStorage.setItem("linear-planner:A", JSON.stringify({ mode: "dates" }));
    expect(loadDisplaySettings("A").mode).toBe("overview");
  });

  it("reads linear-planner:A when the display key is missing and the URL id is A", () => {
    localStorage.setItem("linear-planner:A", JSON.stringify({ mode: "overview" }));
    expect(loadDisplaySettings("A").mode).toBe("overview");
  });

  it("returns the defaults when neither display nor a URL project key is present", () => {
    expect(loadDisplaySettings(null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it("maps a stored treeGlobal mode to tree", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "treeGlobal" }));
    expect(loadDisplaySettings().mode).toBe("tree");
  });

  it("maps the old workers mode to dates", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "workers" }));
    expect(loadDisplaySettings().mode).toBe("dates");
  });

  it("keeps the done states and drops the ones that are not strings", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ doneStateIds: ["s1", 7, null] }));
    expect(loadDisplaySettings().doneStateIds).toEqual(["s1"]);
  });

  it("writes linear-planner:display and does not write a per-project key", () => {
    saveDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, mode: "tree" });
    expect(JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}").mode).toBe("tree");
    expect(localStorage.getItem("linear-planner:A")).toBeNull();
  });

  it("round-trips the display settings", () => {
    const settings = { ...DEFAULT_DISPLAY_SETTINGS, mode: "tree" as const, drawCrossMilestoneDeps: true, doneStateIds: ["s1"] };
    saveDisplaySettings(settings);
    expect(loadDisplaySettings()).toEqual(settings);
  });
});
