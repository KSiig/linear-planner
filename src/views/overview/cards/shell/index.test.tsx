// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineCard, type CardModel, type CardRow } from "./contract";
import { CardShell } from "./index";
import type { LinearIssue } from "../../../../linear";
import { IssueQuickLookSurfaceContext, type IssueQuickLookSurface } from "../../../../issueQuickLookContext";
import { toIssueQuickLookData } from "../../../../issueQuickLookModel";

afterEach(() => {
  cleanup();
});

function row(id: string): CardRow {
  return {
    id,
    identifier: id.toUpperCase(),
    title: `Title ${id}`,
    url: `https://example.test/${id}`,
    trailing: "trail",
    projectName: "Project",
  };
}

function model(count: number): CardModel {
  return {
    title: "Open",
    subtitle: "this week",
    sections: [{ title: "First", rows: Array.from({ length: count }, (_, index) => row(`row-${index + 1}`)) }],
  };
}

describe("CardShell", () => {
  it("renders nothing for a null model", () => {
    const card = defineCard({ id: "empty", load: async () => null });
    const view = render(<CardShell card={card} model={null} />);
    expect(view.container.childElementCount).toBe(0);
  });

  it("collapses after the configured row count and expands on the more button", () => {
    const card = defineCard({ id: "open", appearance: { collapseAfter: 4 }, load: async () => null });
    render(<CardShell card={card} model={model(5)} />);
    expect(screen.getByText("Title row-4")).toBeTruthy();
    expect(screen.queryByText("Title row-5")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 more" }));
    expect(screen.getByText("Title row-5")).toBeTruthy();
  });

  it("keeps the shell border when a module replaces the body", () => {
    const card = defineCard({
      id: "custom",
      load: async () => null,
      renderBody: () => <p>Custom body</p>,
    });
    const view = render(<CardShell card={card} model={model(1)} />);
    const shell = view.container.querySelector(".overview-card");
    expect(shell).toBeTruthy();
    expect(getComputedStyle(shell as Element).borderTopWidth).toBe("1px");
    expect(screen.getByText("Custom body")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Open" })).toBeTruthy();
  });
});

function issue(overrides: Partial<LinearIssue> & Pick<LinearIssue, "id" | "identifier">): LinearIssue {
  return {
    title: overrides.identifier,
    url: `https://linear.app/issue/${overrides.identifier}`,
    priority: 0,
    priorityLabel: "No priority",
    sortOrder: 0,
    startedAt: null,
    completedAt: null,
    dueDate: null,
    description: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
    team: { id: "team-1" },
    assignee: null,
    projectMilestone: null,
    project: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

/** Renders the shell with the contract the app shares with its surfaces. */
function renderShell(rows: CardRow[], issues: LinearIssue[] = []) {
  const openIssue = vi.fn();
  const surface: IssueQuickLookSurface = {
    trigger: {
      onClick: vi.fn(),
      "aria-haspopup": "dialog",
      "aria-expanded": false,
      "aria-controls": "quick-look-dialog",
    },
    selectedIssueId: null,
    openIssue,
    issueById: (id) => issues.find((candidate) => candidate.id === id),
  };
  const card = defineCard({ id: "open", load: async () => null });
  const view = render(
    <IssueQuickLookSurfaceContext.Provider value={surface}>
      <CardShell card={card} model={{ title: "Open", sections: [{ rows }] }} />
    </IssueQuickLookSurfaceContext.Provider>,
  );
  return { ...view, openIssue };
}

describe("the overview card quick-look interaction", () => {
  it("renders every row as a link to Linear", () => {
    renderShell([row("row-1")]);

    const link = screen.getByRole("link", { name: "ROW-1 Title row-1" });
    expect(link.getAttribute("href")).toBe("https://example.test/row-1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names a row with the identifier, the title, and the status of its issue", () => {
    renderShell(
      [row("row-1")],
      [issue({ id: "row-1", identifier: "ROW-1", title: "Title row-1" })],
    );

    expect(screen.getByRole("link", { name: "ROW-1 Title row-1 — Todo" })).toBeTruthy();
  });

  it("renders the canonical issue facts from the shared surface", () => {
    const source = issue({
      id: "row-1",
      identifier: "SII-184",
      title: "Canonical title",
      url: "https://linear.app/siig/issue/SII-184",
    });
    const canonical = toIssueQuickLookData(source);

    renderShell([row("row-1")], [source]);

    const link = screen.getByRole("link", {
      name: `${canonical.identifier} ${canonical.title} — ${canonical.state.name}`,
    });
    expect(link.getAttribute("href")).toBe(canonical.url);
    expect(screen.getByText(canonical.identifier)).toBeTruthy();
    expect(screen.getByText(canonical.title)).toBeTruthy();
  });

  it("opens the shared quick-look when a row is clicked", () => {
    const { openIssue } = renderShell([row("row-1")]);

    fireEvent.click(screen.getByRole("link", { name: "ROW-1 Title row-1" }));

    expect(openIssue).toHaveBeenCalledTimes(1);
    expect(openIssue.mock.calls[0]?.[0]).toBe("row-1");
  });

  it("keeps the link behaviour of the browser on a ctrl-click", () => {
    const { openIssue } = renderShell([row("row-1")]);
    const link = screen.getByRole("link", { name: "ROW-1 Title row-1" });
    // The browser follows the link on a ctrl-click. The listener keeps the test
    // page and reads whether the surface stopped the link first.
    let preventedBySurface = true;
    const keepTheTestPage = (event: Event) => {
      preventedBySurface = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", keepTheTestPage);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    fireEvent(link, event);
    document.removeEventListener("click", keepTheTestPage);

    expect(openIssue).not.toHaveBeenCalled();
    expect(preventedBySurface).toBe(false);
  });
});
