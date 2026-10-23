// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  startLogin: vi.fn(),
  handleOAuthCallback: vi.fn(),
  getCallbackPath: () => "/callback",
  isAuthenticated: () => true,
  clearTokens: vi.fn(),
  logout: vi.fn(async () => {}),
  isWriteEnabled: () => false,
  setWriteEnabled: vi.fn(),
  isAutoRefreshEnabled: () => false,
  setAutoRefreshEnabled: vi.fn(),
}));

vi.mock("./linear", () => ({
  fetchProjects: vi.fn(async () => [{ id: "A", name: "Project A", teams: { nodes: [] }, hasIssues: true }]),
  fetchProjectIssues: vi.fn(async () => []),
  fetchProjectCycles: vi.fn(async () => []),
  fetchProjectMilestones: vi.fn(async () => []),
  fetchProjectWorkflowStates: vi.fn(async () => []),
  fetchIssueStateHistory: vi.fn(async () => ({ transitions: new Map(), assignedIntervals: new Map(), noCount: new Map() })),
  endDateFromTransitions: () => null,
  createBlockingRelation: vi.fn(),
  deleteIssueRelation: vi.fn(),
  addBlocksRelation: (issues: unknown[]) => issues,
  removeRelation: (issues: unknown[]) => issues,
}));

import App from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.pushState(null, "", "/");
});

beforeEach(() => {
  localStorage.clear();
});

async function connectedHeader() {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });
}

describe("header", () => {
  it("has no project select, keeps settings, and shows the tab row on /", async () => {
    window.history.pushState(null, "", "/");
    localStorage.setItem("linear-planner:query", JSON.stringify({
      projectIds: ["A"],
      stateTypes: [],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    }));
    await connectedHeader();
    expect(document.querySelector("select")).toBeNull();
    expect(screen.queryByText("Select a project…")).toBeNull();
    expect(screen.queryByText("Select a project to display.")).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Timeline" })).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    expect(JSON.parse(localStorage.getItem("linear-planner:query") ?? "{}").projectIds).toEqual(["A"]);
  });

  it("writes projectIds to the URL project and then clears the path", async () => {
    window.history.pushState(null, "", "/A/");
    localStorage.setItem("linear-planner:query", JSON.stringify({
      projectIds: [],
      stateTypes: ["started"],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    }));
    await connectedHeader();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    const stored = JSON.parse(localStorage.getItem("linear-planner:query") ?? "{}");
    expect(stored.projectIds).toEqual(["A"]);
    expect(stored.stateTypes).toEqual(["started"]);
  });

  it("does not change projectIds for an unknown URL id", async () => {
    window.history.pushState(null, "", "/missing/");
    localStorage.setItem("linear-planner:query", JSON.stringify({
      projectIds: ["A"],
      stateTypes: [],
      assigneeIds: [],
      priorities: [],
      labelNames: [],
      milestoneIds: [],
      dueWindow: null,
    }));
    await connectedHeader();
    expect(window.location.pathname).toBe("/missing/");
    expect(JSON.parse(localStorage.getItem("linear-planner:query") ?? "{}").projectIds).toEqual(["A"]);
  });
});
