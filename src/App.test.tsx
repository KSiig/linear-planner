// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "./plannerQuery";
import App from "./App";

vi.mock("./auth", () => ({
  startLogin: vi.fn(),
  handleOAuthCallback: vi.fn(),
  getCallbackPath: () => "/callback",
  isAuthenticated: () => true,
  clearTokens: vi.fn(),
  logout: vi.fn(),
  isWriteEnabled: () => false,
  setWriteEnabled: vi.fn(),
  isAutoRefreshEnabled: () => false,
  setAutoRefreshEnabled: vi.fn(),
}));

vi.mock("./linear", () => ({
  fetchProjects: vi.fn(async () => [{ id: "p1", name: "P", teams: { nodes: [] }, hasIssues: true }]),
  fetchProjectCycles: vi.fn(async () => []),
  fetchProjectMilestones: vi.fn(async () => []),
  fetchProjectWorkflowStates: vi.fn(async () => []),
  fetchIssueStateHistory: vi.fn(async () => ({ transitions: [], assignedIntervals: [], noCountRanges: [] })),
  endDateFromTransitions: () => null,
  createBlockingRelation: vi.fn(),
  deleteIssueRelation: vi.fn(),
  addBlocksRelation: vi.fn(),
  removeRelation: vi.fn(),
}));

vi.mock("./applyPlannerQuery", () => ({
  fetchScopedIssues: vi.fn(async () => []),
  filterMatchingIssues: () => [],
  projectIdsToLoad: () => ["p1"],
  toOverviewIssue: (issue: unknown) => issue,
}));

vi.mock("./views/filters/ViewMenu", () => ({
  ViewMenu: ({ onApply }: { onApply: (view: { id: string; name: string; query: ReturnType<typeof emptyPlannerQuery>; mode: string }) => void }) => (
    <button type="button" onClick={() => onApply({ id: "v1", name: "Legacy", query: emptyPlannerQuery(), mode: "treeGlobal" })}>
      Apply legacy view
    </button>
  ),
}));

afterEach(() => {
  cleanup();
});

function tabButtons(): HTMLElement[] {
  return ["Overview", "Timeline", "Tree"].map((name) => screen.getByRole("button", { name }));
}

describe("display tabs", () => {
  it("shows Overview, Timeline, and Tree and maps a treeGlobal saved view to Tree", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    expect(await screen.findByRole("button", { name: "Overview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tree (global)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tree (per milestone)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Milestones" })).toBeNull();
    expect(screen.queryByRole("button", { name: "All issues" })).toBeNull();
    expect(tabButtons().map((button) => button.textContent)).toEqual(["Overview", "Timeline", "Tree"]);
    fireEvent.click(screen.getByRole("button", { name: "Apply legacy view" }));
    const tree = await screen.findByRole("button", { name: "Tree" });
    expect(tree.style.background).toBe("var(--accent)");
    expect(screen.getByRole("button", { name: "Timeline" }).style.background).toBe("var(--bg)");
  });
});
