// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPlannerQuery } from "../../plannerQuery";
import { FilterMenu, type StatusOption } from "./FilterMenu";
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

describe("filter rows", () => {
  function openFilters(projects: Array<{ id: string; label: string }> = [], query = emptyPlannerQuery()) {
    render(
      <FilterMenu
        query={query}
        projects={projects}
        statuses={[]}
        assignees={[]}
        labels={[]}
        milestones={[]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  }

  it("shows a Filters heading inside the panel, not only the trigger", () => {
    openFilters();
    const heading = screen.getByRole("heading", { name: "Filters" });
    expect(heading.textContent).toBe("Filters");
    expect(screen.getByRole("button", { name: "Filters" }).contains(heading)).toBe(false);
  });

  it("shows an icon and the Project label on the closed row", () => {
    openFilters();
    const project = screen.getByRole("button", { name: "Project" });
    expect(project.querySelector("svg")).toBeTruthy();
    expect(project.textContent).toContain("Project");
    const svgs = project.querySelectorAll("svg");
    expect(svgs).toHaveLength(2);
    expect(svgs[1]?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the selected project label", () => {
    openFilters([{ id: "p1", label: "Ad-hoc" }], { ...emptyPlannerQuery(), projectIds: ["p1"] });
    expect(screen.getByRole("button", { name: "Project" }).textContent).toContain("Ad-hoc");
  });

  it("shows a count when more than one project is selected", () => {
    openFilters(
      [
        { id: "p1", label: "Ad-hoc" },
        { id: "p2", label: "Other" },
      ],
      { ...emptyPlannerQuery(), projectIds: ["p1", "p2"] },
    );
    expect(screen.getByRole("button", { name: "Project" }).textContent).toContain("2 selected");
  });

  it("opens project options and shows a back chevron", () => {
    openFilters([{ id: "p1", label: "Ad-hoc" }]);
    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByRole("button", { name: "Ad-hoc" })).toBeTruthy();
    const back = screen.getByRole("button", { name: "Project" });
    expect(back.textContent).toContain("Project");
    const path = back.querySelector("svg path");
    expect(path?.getAttribute("d")).toBe("m15 18-6-6 6-6");
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

describe("the status filter", () => {
  const statuses: StatusOption[] = [
    { id: "state-todo", label: "Todo", type: "unstarted" },
    { id: "state-progress", label: "In Progress", type: "started" },
  ];

  function openStatus(query = emptyPlannerQuery(), onChange = () => {}) {
    render(
      <FilterMenu
        query={query}
        projects={[]}
        statuses={statuses}
        assignees={[]}
        labels={[]}
        milestones={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Status" }));
  }

  it("offers the concrete state names and not the internal state types", () => {
    openStatus();
    expect(screen.getByRole("button", { name: "In Progress" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "started" })).toBeNull();
    expect(screen.queryByRole("button", { name: "unstarted" })).toBeNull();
  });

  it("selects a state by its id", () => {
    const onChange = vi.fn();
    openStatus(emptyPlannerQuery(), onChange);
    fireEvent.click(screen.getByRole("button", { name: "In Progress" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stateIds: ["state-progress"] }));
  });

  it("marks a selected state as pressed", () => {
    openStatus({ ...emptyPlannerQuery(), stateIds: ["state-todo"] });
    expect(screen.getByRole("button", { name: "Todo" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "In Progress" }).getAttribute("aria-pressed")).toBe("false");
  });
});
