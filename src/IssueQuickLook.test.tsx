// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearIssue, LinearWorkflowState } from "./linear";
import { IssueQuickLook } from "./IssueQuickLook";
import { toIssueQuickLookData } from "./issueQuickLookModel";

const teamStates: LinearWorkflowState[] = [
  { id: "state-todo", name: "Todo", type: "unstarted", position: 1, color: "#888888" },
  { id: "state-done", name: "Done", type: "completed", position: 2, color: "#5e6ad2" },
];

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-1",
    identifier: "SII-179",
    title: "Build the issue quick-look",
    url: "https://linear.app/siig/issue/SII-179",
    priority: 2,
    priorityLabel: "High",
    sortOrder: 100,
    startedAt: "2026-10-20T09:00:00.000Z",
    completedAt: null,
    dueDate: "2026-11-01",
    description: "A useful description",
    updatedAt: "2026-10-29T12:00:00.000Z",
    createdAt: "2026-10-01T08:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
    team: { id: "team-1" },
    assignee: { id: "user-1", name: "Kasper", avatarUrl: null },
    projectMilestone: { id: "milestone-1", name: "M3", sortOrder: 1 },
    project: { id: "project-1", name: "Linear Planner" },
    labels: { nodes: [{ name: "frontend", color: "#5e6ad2" }] },
    relations: { nodes: [] },
    inverseRelations: {
      nodes: [{
        id: "relation-1",
        type: "blocks",
        relatedIssue: { id: "blocker-1", identifier: "SII-1", title: "Blocker issue", state: { type: "started" } },
      }],
    },
    ...overrides,
  };
}

function renderQuickLook(overrides: Partial<ComponentProps<typeof IssueQuickLook>> = {}) {
  const props: ComponentProps<typeof IssueQuickLook> = {
    data: toIssueQuickLookData(issue()),
    teamStates,
    onStatusChange: vi.fn(),
    onRemoveBlocker: vi.fn(),
    trigger: (triggerProps) => <button type="button" {...triggerProps}>Open quick look</button>,
    ...overrides,
  };
  render(<IssueQuickLook {...props} />);
  const trigger = screen.getByRole("button", { name: "Open quick look" });
  fireEvent.click(trigger);
  return { trigger, props };
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("IssueQuickLook", () => {
  it("shows the issue details, relationships, and an Open in Linear link", () => {
    renderQuickLook();

    const dialog = screen.getByRole("dialog", { name: "Build the issue quick-look" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.textContent).toContain("SII-179");
    expect(dialog.textContent).toContain("High");
    expect(dialog.textContent).toContain("Kasper");
    expect(dialog.textContent).toContain("frontend");
    expect(dialog.textContent).toContain("M3");
    expect(dialog.textContent).toContain("Linear Planner");
    expect(dialog.textContent).toContain("2026-11-01");
    expect(dialog.textContent).toContain("2026-10-29T12:00:00.000Z");
    expect(dialog.textContent).toContain("SII-1");
    expect(dialog.textContent).toContain("Blocker issue");

    const link = screen.getByRole("link", { name: "Open in Linear" });
    expect(link.getAttribute("href")).toBe("https://linear.app/siig/issue/SII-179");
  });

  it("moves focus into the dialog and closes on Escape with focus back on the trigger", () => {
    const { trigger } = renderQuickLook();

    const closeButton = screen.getByRole("button", { name: "Close quick look" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a backdrop action", () => {
    const { trigger } = renderQuickLook();
    const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;

    fireEvent.mouseDown(backdrop);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("shows only team states and calls the injected status mutation", async () => {
    const onStatusChange = vi.fn();
    renderQuickLook({ onStatusChange });

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Todo", "Done"]);

    fireEvent.click(screen.getByRole("option", { name: "Done" }));

    expect(onStatusChange).toHaveBeenCalledWith("issue-1", "state-done");
  });

  it("shows pending and error feedback for a status mutation", async () => {
    let resolveChange: (() => void) | undefined;
    const onStatusChange = vi.fn(() => new Promise<void>((resolve) => {
      resolveChange = resolve;
    }));
    renderQuickLook({ onStatusChange });

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));
    fireEvent.click(screen.getByRole("option", { name: "Done" }));
    expect(await screen.findByText("Updating status…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Status: Todo" }).hasAttribute("disabled")).toBe(true);

    resolveChange?.();
    await waitFor(() => expect(screen.queryByText("Updating status…")).toBeNull());
  });

  it("shows an error when a status mutation fails", async () => {
    const onStatusChange = vi.fn().mockRejectedValue(new Error("Linear rejected the status change"));
    renderQuickLook({ onStatusChange });

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));
    fireEvent.click(screen.getByRole("option", { name: "Done" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Linear rejected the status change");
  });

  it("calls the injected blocker removal with the relation id", () => {
    const onRemoveBlocker = vi.fn();
    renderQuickLook({ onRemoveBlocker });

    fireEvent.click(screen.getByRole("button", { name: "Remove blocker SII-1" }));

    expect(onRemoveBlocker).toHaveBeenCalledWith("relation-1");
  });

  it("renders a plain-text excerpt capped at 300 characters and expands it in place", () => {
    const description = "a".repeat(350);
    renderQuickLook({ data: toIssueQuickLookData(issue({ description })) });

    expect(screen.getByText("a".repeat(300))).toBeTruthy();
    expect(screen.queryByText(description)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(screen.getByText(description)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("does not render raw HTML from the description", () => {
    renderQuickLook({ data: toIssueQuickLookData(issue({ description: "<p>Hello <strong>world</strong></p>" })) });

    expect(screen.getByText("Hello world")).toBeTruthy();
    expect(screen.queryByText(/<p>|<strong>/)).toBeNull();
  });

  it("renders a generic secondary-action slot", () => {
    renderQuickLook({ secondaryActions: <button type="button">Set priority</button> });

    expect(screen.getByRole("button", { name: "Set priority" })).toBeTruthy();
  });

  it("uses the same content as a bottom sheet in the narrow layout", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    renderQuickLook();

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(Number.parseFloat(dialogs[0].style.bottom)).toBe(0);
    expect(dialogs[0].textContent).toContain("SII-179");
  });
});
