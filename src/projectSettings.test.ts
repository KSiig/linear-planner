import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectSettings } from "./projectSettings";

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
  it("returns mode overview when that mode is stored", () => {
    localStorage.setItem("linear-planner:p1", JSON.stringify({ mode: "overview" }));
    expect(loadProjectSettings("p1").mode).toBe("overview");
  });
});
