// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "./plannerQuery";
import { reauthorizeWithWriteScope } from "./auth";
import { deleteIssueRelation } from "./linear";
import type { LinearIssue } from "./linear";
import { fetchScopedIssues } from "./applyPlannerQuery";
import App from "./App";

vi.mock("./auth", async () => {
  const actual = await vi.importActual<typeof import("./auth")>("./auth");
  return {
    ...actual,
    startLogin: vi.fn(),
    handleOAuthCallback: vi.fn(),
    getCallbackPath: () => "/callback",
    isAuthenticated: () => true,
    clearTokens: vi.fn(),
    logout: vi.fn(),
    isAutoRefreshEnabled: () => false,
    setAutoRefreshEnabled: vi.fn(),
    reauthorizeWithWriteScope: vi.fn(),
  };
});

vi.mock("./linear", () => ({
  fetchProjects: vi.fn(async () => [{ id: "p1", name: "P", teams: { nodes: [] }, hasIssues: true }]),
  fetchProjectCycles: vi.fn(async () => []),
  fetchProjectMilestones: vi.fn(async () => []),
  fetchProjectWorkflowStates: vi.fn(async () => []),
  createBlockingRelation: vi.fn(),
  deleteIssueRelation: vi.fn(),
  addBlocksRelation: vi.fn(),
  removeRelation: vi.fn(),
}));

vi.mock("./applyPlannerQuery", () => ({
  fetchScopedIssues: vi.fn(async () => []),
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

const issueFixture: LinearIssue = {
  id: "i1",
  identifier: "ABC-1",
  title: "Ship the dates view",
  url: "https://linear.app/example/issue/ABC-1",
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
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(fetchScopedIssues).mockResolvedValue([issueFixture]);
  vi.mocked(deleteIssueRelation).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "alert");
  vi.restoreAllMocks();
  vi.clearAllMocks();
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

  it("keeps dependency editing available and reconnects after a scope failure", async () => {
    const blockedIssue: LinearIssue = {
      ...issueFixture,
      id: "i2",
      identifier: "ABC-2",
      title: "Blocked issue",
      relations: { nodes: [] },
    };
    const blockerIssue: LinearIssue = {
      ...issueFixture,
      relations: {
        nodes: [{ id: "rel-1", type: "blocks", relatedIssue: { id: "i2", identifier: "ABC-2" } }],
      },
    };
    vi.mocked(fetchScopedIssues).mockResolvedValue([blockerIssue, blockedIssue]);
    vi.mocked(deleteIssueRelation).mockRejectedValue(new Error("Invalid scope: write required"));
    const alertSpy = vi.fn();
    Object.defineProperty(window, "alert", { configurable: true, value: alertSpy });

    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    const blockedTitle = await screen.findByText("Blocked issue");
    const blockedCard = blockedTitle.closest("[data-card]") as HTMLElement;
    expect(blockedCard.getAttribute("draggable")).toBe("true");

    fireEvent.contextMenu(blockedCard);
    fireEvent.click(await screen.findByRole("button", { name: /Remove blocked by issue: ABC-1/ }));

    const reconnect = await screen.findByRole("button", { name: "Reconnect to update Linear" });
    fireEvent.click(reconnect);

    expect(reauthorizeWithWriteScope).toHaveBeenCalledTimes(1);
    expect(reauthorizeWithWriteScope).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid scope: write required" }),
    );
    expect(alertSpy).toHaveBeenCalled();
  });
});
