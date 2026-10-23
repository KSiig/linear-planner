// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyPlannerQuery } from "../../plannerQuery";
import { FilterMenu } from "./FilterMenu";
import { ViewMenu } from "./ViewMenu";

afterEach(() => {
  cleanup();
});

describe("FilterMenu", () => {
  it("search pri leaves Priority visible and hides Project", () => {
    render(
      <FilterMenu
        query={emptyPlannerQuery()}
        projects={[{ id: "p1", label: "Huskøb/Flytning" }]}
        statuses={[]}
        assignees={[]}
        labels={[]}
        milestones={[]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByPlaceholderText("Search filters..."), { target: { value: "pri" } });
    expect(screen.getByRole("button", { name: "Priority" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Project" })).toBeNull();
  });
});

describe("header controls at 390px", () => {
  it("keeps Filters and Views on screen without a sideways popover", () => {
    const view = render(
      <div style={{ width: 390, maxWidth: "100%", overflowX: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <FilterMenu query={emptyPlannerQuery()} projects={[]} statuses={[]} assignees={[]} labels={[]} milestones={[]} onChange={() => {}} />
          <ViewMenu query={emptyPlannerQuery()} mode="overview" onApply={() => {}} onCreated={() => {}} onRenamed={() => {}} onDeleted={() => {}} />
        </div>
      </div>,
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Views" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const popover = view.container.querySelector("input")?.parentElement;
    expect(popover?.style.maxWidth).toBe("calc(100vw - 24px)");
    expect(view.container.scrollWidth).toBeLessThanOrEqual(view.container.clientWidth || 390);
  });
});
