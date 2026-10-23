// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery, type PlannerQuery } from "../../plannerQuery";
import type { SavedView } from "../../savedViews";
import { FilterChips } from "./FilterChips";

vi.mock("../../savedViews", () => ({
  createSavedView: vi.fn(),
}));

vi.mock("../../auth", () => ({
  getAccessToken: vi.fn(async () => "token"),
}));

afterEach(() => {
  cleanup();
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
});
