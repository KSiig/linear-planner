import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAY_STORAGE_KEY, loadProjectSettings, saveProjectSettings, DEFAULT_PROJECT_SETTINGS } from "./projectSettings";

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

describe("loadProjectSettings", () => {
  it("reads linear-planner:display", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "overview" }));
    localStorage.setItem("linear-planner:A", JSON.stringify({ mode: "dates" }));
    expect(loadProjectSettings("A").mode).toBe("overview");
  });

  it("reads linear-planner:A when the display key is missing and the URL id is A", () => {
    localStorage.setItem("linear-planner:A", JSON.stringify({ mode: "overview" }));
    expect(loadProjectSettings("A").mode).toBe("overview");
  });

  it("returns mode tree when a stored mode is treeGlobal", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "treeGlobal" }));
    expect(loadProjectSettings().mode).toBe("tree");
  });

  it("migrates a stored workers mode to dates", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "workers" }));
    expect(loadProjectSettings().mode).toBe("dates");
  });

  it("falls back to dates when the stored mode is unknown", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "gantt" }));
    expect(loadProjectSettings().mode).toBe("dates");
  });

  it("uses defaults when neither display nor a URL project key is present", () => {
    expect(loadProjectSettings(null)).toEqual(DEFAULT_PROJECT_SETTINGS);
  });

  it("reads the done state ids", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "dates", doneStateIds: ["state-1", "state-2"] }));
    expect(loadProjectSettings().doneStateIds).toEqual(["state-1", "state-2"]);
  });

  it("drops done state ids that are not strings", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ doneStateIds: ["state-1", 7, null] }));
    expect(loadProjectSettings().doneStateIds).toEqual(["state-1"]);
  });

  it("has no done state ids when the setting was never stored", () => {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ mode: "dates" }));
    expect(loadProjectSettings().doneStateIds).toEqual([]);
  });
});

describe("saveProjectSettings", () => {
  it("writes linear-planner:display and no per-project key", () => {
    saveProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, mode: "tree" });
    expect(JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}").mode).toBe("tree");
    expect(localStorage.getItem("linear-planner:A")).toBeNull();
  });

  it("stores the done state ids", () => {
    saveProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, doneStateIds: ["state-9"] });
    expect(JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}").doneStateIds).toEqual(["state-9"]);
  });

  it("maps a stored treeGlobal mode to tree", () => {
    localStorage.setItem("linear-planner:p1", JSON.stringify({ mode: "treeGlobal" }));
    expect(loadProjectSettings("p1").mode).toBe("tree");
  });
});
