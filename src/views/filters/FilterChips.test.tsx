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
        statuses={[]}
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
      const [mode, setMode] = useState<"overview" | "dates">("overview");
      return (
        <>
          <button type="button" onClick={() => { setMode("dates"); setActive(null); }}>Dates</button>
          <FilterChips
            query={emptyPlannerQuery()}
            mode={mode}
            activeView={active}
            projects={[]}
            statuses={[]}
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
    fireEvent.click(screen.getByRole("button", { name: "Dates" }));
    expect(screen.getByRole("button", { name: "Save view" })).toBeTruthy();
  });

  it("cancels the name field without creating a view", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };
    render(
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} statuses={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />,
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
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} statuses={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={onCreated} />,
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
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} statuses={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    expect(screen.getByRole("button", { name: "Save view" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save view" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not create a view when Escape closes the name field", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), projectIds: ["p1"] };
    render(
      <FilterChips query={query} mode="overview" activeView={null} projects={[]} statuses={[]} assignees={[]} milestones={[]} onChange={() => {}} onCreated={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.change(screen.getByLabelText("View name"), { target: { value: "Huskøb" } });
    fireEvent.keyDown(screen.getByLabelText("View name"), { key: "Escape" });
    expect(screen.queryByLabelText("View name")).toBeNull();
    expect(createSavedView).not.toHaveBeenCalled();
  });
});

describe("the status and due chips", () => {
  const statuses = [{ id: "state-progress", label: "In Progress", type: "started" }];

  function renderChips(query: PlannerQuery, onChange = vi.fn()) {
    render(
      <FilterChips
        query={query}
        mode="overview"
        activeView={null}
        projects={[]}
        statuses={statuses}
        assignees={[]}
        milestones={[]}
        onChange={onChange}
        onCreated={() => {}}
      />,
    );
    return onChange;
  }

  it("names a status chip after the workflow state and drops its id", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), stateIds: ["state-progress"] };
    const onChange = renderChips(query);
    fireEvent.click(screen.getByRole("button", { name: "Status In Progress" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stateIds: [] }));
  });

  it("names a legacy status chip after the workflow state too", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), stateTypes: ["started"] };
    renderChips(query);
    expect(screen.getByRole("button", { name: "Status In Progress" })).toBeTruthy();
  });

  it("names a due chip after the due window", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), dueWindow: "soon" };
    renderChips(query);
    expect(screen.getByRole("button", { name: "Due Soon" })).toBeTruthy();
  });

  it("keeps the due window name in the chip, so a saved view follows the browser's boundaries", () => {
    const query: PlannerQuery = { ...emptyPlannerQuery(), dueWindow: "next" };
    renderChips(query);
    const chip = screen.getByRole("button", { name: "Due Next" });
    expect(chip.textContent).toContain("Next");
    expect(chip.textContent).not.toContain("day");
  });
});
