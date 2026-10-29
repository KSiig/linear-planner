// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { createSavedView, loadSavedViews, renameSavedView } from "../../savedViews";

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
    fireEvent.click(await screen.findByRole("button", { name: "Save current as view" }));
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
    render(<ViewMenu query={emptyPlannerQuery()} mode="dates" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(await screen.findByText("This account is outside the siig workspace.")).toBeTruthy();
  });

  it("shows a plus, pencil, and trash without Rename or Delete words", async () => {
    const view: SavedView = { id: "v1", name: "Husk\u00f8b", query, mode: "overview" };
    vi.mocked(loadSavedViews).mockResolvedValue([view]);
    render(<ViewMenu query={query} mode="overview" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(await screen.findByRole("button", { name: "Save current as view" })).toBeTruthy();
    const rename = screen.getByRole("button", { name: "Rename Husk\u00f8b" });
    const remove = screen.getByRole("button", { name: "Delete Husk\u00f8b" });
    expect(rename.textContent).not.toMatch(/Rename/);
    expect(remove.textContent).not.toMatch(/Delete/);
    expect(rename.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(remove.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("clears the active view id when the mode changes and shows Save view", async () => {
    const view: SavedView = { id: "v1", name: "Huskøb", query, mode: "overview" };
    function Harness() {
      const [mode, setMode] = useState<SavedViewMode>("overview");
      const [active, setActive] = useState<SavedView | null>(view);
      return (
        <>
          <button type="button" onClick={() => { setMode("tree"); setActive(null); }}>Tree</button>
          <FilterChips query={query} mode={mode} activeView={active} projects={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />
          <span data-testid="active">{active?.id ?? ""}</span>
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByTestId("active").textContent).toBe("");
    expect(screen.getByRole("button", { name: "Save view" })).toBeTruthy();
  });

  it("cancels the plus-button name field and saves with the Save view button", async () => {
    const created: SavedView = { id: "v1", name: "Huskøb", query, mode: "overview" };
    vi.mocked(loadSavedViews).mockResolvedValue([]);
    vi.mocked(createSavedView).mockResolvedValue(created);
    render(<ViewMenu query={query} mode="overview" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save current as view" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("View name")).toBeNull();
    expect(createSavedView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save current as view" }));
    expect(screen.getByRole("button", { name: "Save view" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Huskøb" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(createSavedView).toHaveBeenCalledWith(fetch, "token", { name: "Huskøb", query, mode: "overview" }));
    expect(await screen.findByRole("button", { name: "Huskøb" })).toBeTruthy();
  });

  it("cancels rename without calling renameSavedView and saves with Save name", async () => {
    const existing: SavedView = { id: "v1", name: "Huskøb", query, mode: "overview" };
    const renamed: SavedView = { ...existing, name: "Flytning" };
    vi.mocked(loadSavedViews).mockResolvedValue([existing]);
    vi.mocked(renameSavedView).mockResolvedValue(renamed);
    render(<ViewMenu query={query} mode="overview" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename Huskøb" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("View name")).toBeNull();
    expect(renameSavedView).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Huskøb" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Rename Huskøb" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save name" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Flytning" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(renameSavedView).toHaveBeenCalledWith(fetch, "token", "v1", "Flytning"));
    expect(await screen.findByRole("button", { name: "Flytning" })).toBeTruthy();
  });

  it("Escape on the plus-button field does not create a view", async () => {
    vi.mocked(loadSavedViews).mockResolvedValue([]);
    render(<ViewMenu query={query} mode="overview" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Views" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save current as view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Huskøb" } });
    fireEvent.keyDown(screen.getByLabelText("View name"), { key: "Escape" });
    expect(screen.queryByLabelText("View name")).toBeNull();
    expect(createSavedView).not.toHaveBeenCalled();
  });
});
