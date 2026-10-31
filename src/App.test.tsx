// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "./plannerQuery";
import { reauthorizeWithWriteScope } from "./auth";
import { deleteIssueRelation, fetchProjectWorkflowStates, issueUpdate } from "./linear";
import type { LinearIssue } from "./linear";
import { fetchScopedById, fetchScopedIssues } from "./applyPlannerQuery";
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
  issueUpdate: vi.fn(async () => undefined),
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
  createdAt: "2026-09-01T00:00:00.000Z",
  state: { id: "s1", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
  team: { id: "t1" },
  assignee: null,
  projectMilestone: null,
  project: { id: "p1", name: "P" },
  labels: { nodes: [] },
  relations: { nodes: [] },
  inverseRelations: { nodes: [] },
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(fetchScopedIssues).mockResolvedValue([issueFixture]);
  vi.mocked(fetchScopedById).mockResolvedValue([]);
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

describe("the shared issue quick-look", () => {
  it("opens the quick-look when an issue of the timeline is clicked", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));

    const dialog = await screen.findByRole("dialog", { name: "Ship the dates view" });
    expect(dialog.textContent).toContain("ABC-1");
    expect(dialog.textContent).toContain("High");
  });

  it("keeps an Open in Linear link inside the quick-look", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    const link = screen.getByRole("link", { name: "Open in Linear" });
    expect(link.getAttribute("href")).toBe("https://linear.app/example/issue/ABC-1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("keeps the link behaviour of the browser on a ctrl-click", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    const marker = await screen.findByRole("link", { name: /^Due 2026-11-02/ });
    // The browser follows the link on a ctrl-click. The listener keeps the test
    // page and reads whether the surface stopped the link first.
    let preventedBySurface = true;
    const keepTheTestPage = (event: Event) => {
      preventedBySurface = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", keepTheTestPage);
    fireEvent(marker, new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    document.removeEventListener("click", keepTheTestPage);

    expect(preventedBySurface).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("changes the status of the issue from the quick-look", async () => {
    const workflowStates = [
      { id: "s1", name: "Todo", type: "unstarted", position: 1, color: "#888888" },
      { id: "s2", name: "Done", type: "completed", position: 2, color: "#5e6ad2" },
    ];
    vi.mocked(fetchScopedById).mockImplementation(async (_ids, fetchRows) => (
      fetchRows === fetchProjectWorkflowStates ? workflowStates : []
    ));

    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));
    fireEvent.click(await screen.findByRole("option", { name: "Done" }));

    await waitFor(() => expect(issueUpdate).toHaveBeenCalledWith("i1", "s2"));
  });
});
