// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery, type PlannerQuery } from "../../plannerQuery";
import type { SavedView } from "../../savedViews";
import { createSavedView } from "../../savedViews";
import { FilterChips } from "./FilterChips";

vi.mock("../../savedViews", () => ({
  createSavedView: vi.fn(),
}));

vi.mock("../../auth", () => ({
  getAccessToken: vi.fn(async () => "token"),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FilterChips", () => {
  it("removing a project chip drops that id from the query", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1", "p2"] };
    const onChange = vi.fn();
    render(
      <FilterChips
        query={query}
        mode="overview"
        activeView={null}
        projects={[{ id: "p1", label: "Huskøb/Flytning" }, { id: "p2", label: "Other" }]}
        assignees={[]}
        milestones={[]}
        onChange={onChange}
        onCreated={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Project Huskøb/Flytning" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ projectIds: ["p2"] }));
  });

  it("shows Save view after the active view id is cleared", () => {
    const view: SavedView = { id: "v1", name: "Huskøb", query: emptyPlannerQuery(), mode: "overview" };
    function Harness() {
      const [active, setActive] = useState<SavedView | null>(view);
      const [mode, setMode] = useState<"overview" | "workers">("overview");
      return (
        <>
          <button type="button" onClick={() => { setMode("workers"); setActive(null); }}>Timeline</button>
          <FilterChips
            query={emptyPlannerQuery()}
            mode={mode}
            activeView={active}
            projects={[]}
            assignees={[]}
            milestones={[]}
            onChange={() => {}}
            onCreated={() => {}}
          />
        </>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Save view" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(screen.getByRole("button", { name: "Save view" })).toBeTruthy();
  });

  it("cancels the name field without creating a view", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };
    render(
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    expect(screen.getByLabelText("View name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("View name")).toBeNull();
    expect(createSavedView).not.toHaveBeenCalled();
  });

  it("saves Huskøb when Save view is clicked", async () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };
    const created: SavedView = { id: "v1", name: "Huskøb", query, mode: "overview" };
    vi.mocked(createSavedView).mockResolvedValue(created);
    const onCreated = vi.fn();
    render(
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={onCreated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Huskøb" } });
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await waitFor(() => expect(createSavedView).toHaveBeenCalledWith(fetch, "token", { name: "Huskøb", query, mode: "overview" }));
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("disables Save while the trimmed name is empty", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };
    render(
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    expect(screen.getByRole("button", { name: "Save view" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save view" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not create a view when Escape closes the name field", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };
    render(
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Huskøb" } });
    fireEvent.keyDown(screen.getByLabelText("View name"), { key: "Escape" });
    expect(screen.queryByLabelText("View name")).toBeNull();
    expect(createSavedView).not.toHaveBeenCalled();
  });
});
