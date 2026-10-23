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
    localStorage.setItem("linear-planner:A", JSON.stringify({ mode: "workers" }));
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

  it("uses defaults when neither display nor a URL project key is present", () => {
    expect(loadProjectSettings(null)).toEqual(DEFAULT_PROJECT_SETTINGS);
  });
});

describe("saveProjectSettings", () => {
  it("writes linear-planner:display and does not write treeGlobal", () => {
    saveProjectSettings({ ...DEFAULT_PROJECT_SETTINGS, mode: "treeGlobal" });
    expect(JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}").mode).toBe("tree");
    expect(localStorage.getItem("linear-planner:A")).toBeNull();
  });

  it("maps a stored treeGlobal mode to tree", () => {
    localStorage.setItem("linear-planner:p1", JSON.stringify({ mode: "treeGlobal" }));
    expect(loadProjectSettings("p1").mode).toBe("tree");
  });
});
