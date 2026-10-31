// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "./plannerQuery";
import { reauthorizeWithWriteScope } from "./auth";
import { deleteIssueRelation, fetchProjects, fetchProjectTeamIds, fetchTeamWorkflowStates, fetchTeamMembers, fetchIssue, issueUpdate, issueUpdateFields } from "./linear";
import type { LinearIssue } from "./linear";
import { fetchScopedById, fetchScopedIssues } from "./applyPlannerQuery";
import App from "./App";
import { addCalendarDays, localToday } from "./dueWindows";

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
  fetchProjectTeamIds: vi.fn(async () => ["t1"]),
  fetchTeamWorkflowStates: vi.fn(async () => []),
  createBlockingRelation: vi.fn(),
  deleteIssueRelation: vi.fn(),
  issueUpdate: vi.fn(async () => undefined),
  issueUpdateFields: vi.fn(async () => undefined),
  fetchTeamMembers: vi.fn(async () => []),
  fetchIssue: vi.fn(async () => null),
  addBlocksRelation: vi.fn(),
  removeRelation: vi.fn((issues: LinearIssue[], relationId: string) => issues.map((issue) => ({
    ...issue,
    relations: {
      ...issue.relations,
      nodes: issue.relations.nodes.filter((relation) => relation.id !== relationId),
    },
  }))),
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
  vi.mocked(fetchTeamMembers).mockResolvedValue([
    { id: "u1", name: "Kasper", displayName: "Kasper", avatarUrl: null, active: true },
    { id: "u2", name: "Robin", displayName: "Robin", avatarUrl: null, active: true },
  ]);
  vi.mocked(fetchIssue).mockResolvedValue(null);
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
      id: "i1",
      identifier: "ABC-1",
      title: "Ship the dates view",
      inverseRelations: {
        nodes: [{
          id: "rel-1",
          type: "blocks",
          relatedIssue: { id: "i2", identifier: "ABC-2", title: "Blocked issue", state: { type: "unstarted" } },
        }],
      },
    };
    const blockerIssue: LinearIssue = {
      ...issueFixture,
      id: "i2",
      identifier: "ABC-2",
      title: "Blocked issue",
      relations: {
        nodes: [{
          id: "rel-1",
          type: "blocks",
          relatedIssue: { id: "i1", identifier: "ABC-1", title: "Ship the dates view", state: { type: "unstarted" } },
        }],
      },
    };
    vi.mocked(fetchScopedIssues).mockResolvedValue([blockedIssue, blockerIssue]);
    vi.mocked(deleteIssueRelation).mockRejectedValue(new Error("Invalid scope: write required"));

    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    const blockerTitle = await screen.findByText("Blocked issue");
    const blockerCard = blockerTitle.closest("[data-card]") as HTMLElement;
    expect(blockerCard.getAttribute("draggable")).toBe("true");

    // The blocker is removed from the quick-look of the blocked issue.
    fireEvent.click(screen.getByRole("link", { name: /ABC-1 Ship the dates view/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove blocker ABC-2" }));

    const reconnect = await screen.findByRole("button", { name: "Reconnect to update Linear" });
    fireEvent.click(reconnect);

    expect(reauthorizeWithWriteScope).toHaveBeenCalledTimes(1);
    expect(reauthorizeWithWriteScope).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid scope: write required" }),
    );
  });
});

describe("the visible product title", () => {
  it("names the product Linear dashboard", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    const title = await screen.findByRole("heading", { name: "Linear dashboard" });
    expect(title.textContent).toBe("Linear dashboard");
    expect(screen.queryByText("Linear planner")).toBeNull();
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

  it("removes a blocker from the quick-look", async () => {
    const blockedIssue: LinearIssue = {
      ...issueFixture,
      inverseRelations: {
        nodes: [{
          id: "rel-1",
          type: "blocks",
          relatedIssue: { id: "i2", identifier: "ABC-2", title: "Blocked issue", state: { type: "unstarted" } },
        }],
      },
    };
    vi.mocked(fetchScopedIssues).mockResolvedValue([blockedIssue]);

    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.click(screen.getByRole("button", { name: "Remove blocker ABC-2" }));

    await waitFor(() => expect(deleteIssueRelation).toHaveBeenCalledWith("rel-1"));
    // The blocker leaves the quick-look without a reload of the page.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove blocker ABC-2" })).toBeNull());
  });

  it("changes the status of the issue from the quick-look", async () => {
    const workflowStates = [
      { id: "s1", name: "Todo", type: "unstarted", position: 1, color: "#888888" },
      { id: "s2", name: "Done", type: "completed", position: 2, color: "#5e6ad2" },
    ];
    vi.mocked(fetchTeamWorkflowStates).mockResolvedValue(workflowStates);
    vi.mocked(fetchScopedById).mockImplementation(async (_ids, fetchRows) => fetchRows("p1"));

    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));
    fireEvent.click(await screen.findByRole("option", { name: "Done" }));

    await waitFor(() => expect(issueUpdate).toHaveBeenCalledWith("i1", "s2"));
  });

  it("reads the issue again when a status change finishes the issue", async () => {
    const workflowStates = [
      { id: "s1", name: "Todo", type: "unstarted", position: 1, color: "#888888" },
      { id: "s2", name: "Done", type: "completed", position: 2, color: "#5e6ad2" },
    ];
    vi.mocked(fetchTeamWorkflowStates).mockResolvedValue(workflowStates);
    vi.mocked(fetchScopedById).mockImplementation(async (_ids, fetchRows) => fetchRows("p1"));
    const finishedIssue: LinearIssue = {
      ...issueFixture,
      completedAt: "2026-11-03T09:00:00.000Z",
      updatedAt: "2026-11-03T09:00:00.000Z",
      state: { id: "s2", name: "Done", type: "completed", color: "#5e6ad2", position: 2 },
    };
    vi.mocked(fetchIssue).mockResolvedValue(finishedIssue);

    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));
    fireEvent.click(await screen.findByRole("option", { name: "Done" }));

    // The completion time comes from Linear, so that one issue is read again.
    await waitFor(() => expect(fetchIssue).toHaveBeenCalledWith("i1"));
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("2026-11-03T09:00:00.000Z"));
  });
});

describe("the secondary quick-look actions", () => {
  it("offers the priority, the assignee, and the due date of the issue", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("2");
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Due date") as HTMLInputElement).value).toBe("2026-11-02");
  });

  it("offers the members of the issue team and Unassigned as assignee choices", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    await waitFor(() => expect(fetchTeamMembers).toHaveBeenCalledWith("t1"));
    const options = Array.from((screen.getByLabelText("Assignee") as HTMLSelectElement).options)
      .map((option) => option.textContent);
    expect(options).toEqual(["Unassigned", "Kasper", "Robin"]);
  });

  it("changes the priority through the shared issue mutation", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });

    await waitFor(() => expect(issueUpdateFields).toHaveBeenCalledWith("i1", { priority: 1 }));
  });

  it("changes the assignee and the due date through the shared issue mutation", async () => {
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "u2" } });
    await waitFor(() => expect(issueUpdateFields).toHaveBeenCalledWith("i1", { assigneeId: "u2" }));

    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-24" } });
    await waitFor(() => expect(issueUpdateFields).toHaveBeenCalledWith("i1", { dueDate: "2026-12-24" }));
  });

  it("keeps the old values when the issue mutation fails", async () => {
    vi.mocked(issueUpdateFields).mockRejectedValue(new Error("Linear rejected the change"));
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });

    expect((await screen.findByRole("alert")).textContent).toContain("Linear rejected the change");
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("2");
  });

  it("reports a missing write scope like the other actions do", async () => {
    vi.mocked(issueUpdateFields).mockRejectedValue(new Error("Invalid scope: write required"));
    window.history.pushState(null, "", "/p1/");
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });

    const reconnect = await screen.findByRole("button", { name: "Reconnect to update Linear" });
    fireEvent.click(reconnect);

    expect(reauthorizeWithWriteScope).toHaveBeenCalledTimes(1);
    expect(reauthorizeWithWriteScope).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid scope: write required" }),
    );
  });
});

describe("the status filter", () => {
  it("offers the concrete workflow states instead of their internal types", async () => {
    vi.mocked(fetchTeamWorkflowStates).mockResolvedValue([
      { id: "s1", name: "Todo", type: "unstarted", position: 1, color: "#888888" },
      { id: "s2", name: "In Progress", type: "started", position: 2, color: "#f2c94c" },
    ]);
    vi.mocked(fetchScopedById).mockImplementation(async (_ids, fetchRows) => fetchRows("p1"));

    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByRole("button", { name: "In Progress" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "started" })).toBeNull();
    expect(screen.queryByRole("button", { name: "unstarted" })).toBeNull();
  });

  it("tells two states with the same name apart by their team key", async () => {
    vi.mocked(fetchProjects).mockResolvedValue([
      {
        id: "p1",
        name: "P",
        teams: { nodes: [{ id: "t1", name: "Siig", key: "SII" }, { id: "t2", name: "Web", key: "WEB" }] },
        hasIssues: true,
      },
    ]);
    vi.mocked(fetchProjectTeamIds).mockResolvedValue(["t1", "t2"]);
    vi.mocked(fetchTeamWorkflowStates).mockImplementation(async (teamId) => (
      teamId === "t1"
        ? [{ id: "s1", name: "Todo", type: "unstarted", position: 1, color: "#888888" }]
        : [{ id: "s2", name: "Todo", type: "unstarted", position: 1, color: "#888888" }]
    ));
    vi.mocked(fetchScopedById).mockImplementation(async (_ids, fetchRows) => fetchRows("p1"));

    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByRole("button", { name: "Todo · SII" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Todo · WEB" })).toBeTruthy();
  });
});

describe("the due-window settings", () => {
  /** The day the fixture issue is due, so the test does not depend on today. */
  const dueDate = addCalendarDays(localToday(new Date()), 20);

  async function openSettings() {
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    return screen.findByLabelText("Next window (days)");
  }

  it("shows both boundaries with their current values", async () => {
    const next = await openSettings();
    expect(next.getAttribute("value")).toBe("14");
    expect(screen.getByLabelText("Soon window (days)").getAttribute("value")).toBe("45");
  });

  it("stores a valid pair under one versioned key and applies it without a reload", async () => {
    const next = await openSettings();
    fireEvent.change(next, { target: { value: "30" } });

    expect(localStorage.getItem("linear-planner:due-windows:v1")).toBe('{"nextEndDays":30,"soonEndDays":45}');
    expect(screen.getByLabelText("Next window (days)").getAttribute("value")).toBe("30");
  });

  it("refuses a value outside its range and keeps the previous boundaries", async () => {
    const next = await openSettings();
    fireEvent.change(next, { target: { value: "200" } });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(localStorage.getItem("linear-planner:due-windows:v1")).toBeNull();
    expect(screen.getByLabelText("Next window (days)").getAttribute("value")).toBe("14");
  });

  it("refuses a Soon boundary below the Next boundary and keeps the previous boundaries", async () => {
    const next = await openSettings();
    fireEvent.change(next, { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Soon window (days)"), { target: { value: "30" } });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(localStorage.getItem("linear-planner:due-windows:v1")).toBeNull();
  });

  it("puts the due windows of the Overview in line with the new boundaries", async () => {
    vi.mocked(fetchScopedIssues).mockResolvedValue([
      { ...issueFixture, dueDate, state: { ...issueFixture.state, type: "unstarted" } },
    ]);
    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    // The issue is due after the standard Next window, so the Next card has
    // no rows and shows nothing.
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Next" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Next window (days)"), { target: { value: "30" } });

    // The card loads again with the new boundary, without the page reloading.
    expect(await screen.findByRole("heading", { name: "Next" })).toBeTruthy();
  });

  it("keeps a local issue edit when the due windows change", async () => {
    const blockedIssue: LinearIssue = {
      ...issueFixture,
      inverseRelations: {
        nodes: [{
          id: "rel-1",
          type: "blocks",
          relatedIssue: { id: "i2", identifier: "ABC-2", title: "Blocked issue", state: { type: "unstarted" } },
        }],
      },
    };
    vi.mocked(fetchScopedIssues).mockResolvedValue([blockedIssue]);

    window.history.pushState(null, "", "/p1/");
    render(<App />);
    await screen.findByRole("button", { name: "Overview" });

    // The blocker is removed from the quick-look. That is a local edit: it is
    // in the loaded issues, not in the issues as they were fetched.
    fireEvent.click(await screen.findByRole("link", { name: /^Due 2026-11-02/ }));
    await screen.findByRole("dialog", { name: "Ship the dates view" });
    fireEvent.click(screen.getByRole("button", { name: "Remove blocker ABC-2" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove blocker ABC-2" })).toBeNull());

    // The due windows change, so the loaded issues are filtered again.
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(await screen.findByLabelText("Next window (days)"), { target: { value: "30" } });

    // The quick-look is still open, and the local edit is still in place: the
    // blocker does not come back.
    expect(screen.queryByRole("dialog", { name: "Ship the dates view" })).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove blocker ABC-2" })).toBeNull());
  });

  it("clears the error when the fields go back to the saved values", async () => {
    const next = await openSettings();
    // A Soon boundary below the Next one cannot be used. The value stays in
    // the field, so the other field can be raised to meet it.
    fireEvent.change(next, { target: { value: "60" } });

    expect(await screen.findByRole("alert")).toBeTruthy();

    // The field loses focus, so the draft goes back to the saved values and
    // the error for the rejected value goes with it.
    fireEvent.focusOut(next);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByLabelText("Next window (days)").getAttribute("value")).toBe("14");
    expect(screen.getByLabelText("Soon window (days)").getAttribute("value")).toBe("45");
  });
});
