// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  fetchScopedIssues: vi.fn(async () => [{
    id: "i1",
    identifier: "ABC-1",
    title: "Ship the dates view",
    url: "https://linear.app/example/issue/ABC-1",
    estimate: 2,
    priority: 2,
    priorityLabel: "High",
    sortOrder: 1,
    startedAt: null,
    completedAt: null,
    dueDate: "2026-11-02",
    description: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    state: { id: "s1", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
    team: { id: "t1" },
    assignee: null,
    projectMilestone: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
  }]),
  fetchScopedById: vi.fn(async () => []),
  filterMatchingIssues: (issues: unknown[]) => issues,
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function tabButtons(): HTMLElement[] {
  return ["Overview", "Dates", "Tree"].map((name) => screen.getByRole("button", { name }));
}

describe("display tabs", () => {
  it("shows Overview, Dates, and Tree and maps a treeGlobal saved view to Tree", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    expect(await screen.findByRole("button", { name: "Overview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tree (global)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tree (per milestone)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Milestones" })).toBeNull();
    expect(screen.queryByRole("button", { name: "All issues" })).toBeNull();
    expect(tabButtons().map((button) => button.textContent)).toEqual(["Overview", "Dates", "Tree"]);
    fireEvent.click(screen.getByRole("button", { name: "Apply legacy view" }));
    const tree = await screen.findByRole("button", { name: "Tree" });
    expect(tree.style.background).toBe("var(--accent)");
    expect(screen.getByRole("button", { name: "Dates" }).style.background).toBe("var(--bg)");
  });

  it("renders the deadline timeline on the Dates tab", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    expect(await screen.findByRole("region", { name: "Deadline timeline" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Deadline timeline" })).toBeTruthy();
  });

  it("has no people-in-parallel, capacity forecast, start status or working-day control", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });
    for (const label of ["People in parallel", "Capacity forecast", "Start status", "End status", "Show weekends", "Show holidays", "Show cooldown"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByRole("checkbox", { name: /Capacity forecast/ })).toBeNull();
  });
});
