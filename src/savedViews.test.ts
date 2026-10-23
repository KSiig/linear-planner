import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "./plannerQuery";
import { createSavedView, loadActiveViewId, loadPlannerQuery, readSavedViewMode, saveActiveViewId, savePlannerQuery } from "./savedViews";

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
});

describe("readSavedViewMode", () => {
  it("maps a saved view mode treeGlobal to tree", () => {
    expect(readSavedViewMode("treeGlobal")).toBe("tree");
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
});
