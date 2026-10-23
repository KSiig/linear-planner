// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery, type PlannerQuery } from "../../plannerQuery";
import type { SavedView, SavedViewMode } from "../../savedViews";
import { FilterChips } from "./FilterChips";
import { ViewMenu } from "./ViewMenu";

vi.mock("../../savedViews", () => ({
  loadSavedViews: vi.fn(),
  createSavedView: vi.fn(),
  renameSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
}));

vi.mock("../../auth", () => ({
  getAccessToken: vi.fn(async () => "token"),
}));

import { createSavedView, loadSavedViews } from "../../savedViews";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };

describe("ViewMenu", () => {
  it("creates Huskøb from the current query and overview, then applying restores overview", async () => {
    const created: SavedView = { id: "v1", name: "Huskøb", query, mode: "overview" };
    vi.mocked(loadSavedViews).mockResolvedValue([]);
    vi.mocked(createSavedView).mockResolvedValue(created);

    function Harness() {
      const [mode, setMode] = useState<SavedViewMode>("overview");
      const [activeId, setActiveId] = useState<string | null>(null);
      return (
        <>
          <ViewMenu
            query={query}
            mode="overview"
            onApply={(view) => { setMode(view.mode); setActiveId(view.id); }}
            onCreated={(view) => setActiveId(view.id)}
            onRenamed={() => {}}
            onDeleted={() => setActiveId(null)}
          />
          <span data-testid="mode">{mode}</span>
          <span data-testid="active">{activeId ?? ""}</span>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Huskøb" } });
    fireEvent.submit(screen.getByLabelText("View name").closest("form")!);
    expect(await screen.findByRole("button", { name: "Huskøb" })).toBeTruthy();
    expect(createSavedView).toHaveBeenCalledWith(fetch, "token", { name: "Huskøb", query, mode: "overview" });
    fireEvent.click(screen.getByRole("button", { name: "Huskøb" }));
    expect(screen.getByTestId("mode").textContent).toBe("overview");
    expect(screen.getByTestId("active").textContent).toBe("v1");
  });

  it("shows the workspace error when loadSavedViews returns 403", async () => {
    vi.mocked(loadSavedViews).mockRejectedValue(new Error("Saved views request failed: 403"));
    render(<ViewMenu query={emptyPlannerQuery()} mode="workers" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(await screen.findByText("This account is outside the siig workspace.")).toBeTruthy();
  });

  it("clears the active view id when the mode changes and shows Save view", async () => {
    const view: SavedView = { id: "v1", name: "Huskøb", query, mode: "overview" };
    function Harness() {
      const [mode, setMode] = useState<SavedViewMode>("overview");
      const [active, setActive] = useState<SavedView | null>(view);
      return (
        <>
          <button type="button" onClick={() => { setMode("tree"); setActive(null); }}>Tree (per milestone)</button>
          <FilterChips query={query} mode={mode} activeView={active} projects={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />
          <span data-testid="active">{active?.id ?? ""}</span>
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tree (per milestone)" }));
    expect(screen.getByTestId("active").textContent).toBe("");
    expect(screen.getByRole("button", { name: "Save view" })).toBeTruthy();
  });
});
