// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueQuickLookActions } from "./IssueQuickLookActions";
import { toIssueQuickLookData } from "./issueQuickLookModel";
import type { LinearIssue, LinearTeamMember } from "./linear";

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: "issue-1",
    identifier: "SII-182",
    title: "Add the quick actions",
    url: "https://linear.app/siig/issue/SII-182",
    priority: 2,
    priorityLabel: "High",
    sortOrder: 100,
    startedAt: null,
    completedAt: null,
    dueDate: "2026-11-01",
    description: null,
    updatedAt: "2026-10-29T12:00:00.000Z",
    createdAt: "2026-10-01T08:00:00.000Z",
    state: { id: "state-todo", name: "Todo", type: "unstarted", color: "#888888", position: 1 },
    team: { id: "team-1" },
    assignee: { id: "user-1", name: "Kasper", avatarUrl: null },
    projectMilestone: null,
    project: null,
    labels: { nodes: [] },
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

function member(overrides: Partial<LinearTeamMember> = {}): LinearTeamMember {
  return {
    id: "user-1",
    name: "Kasper",
    displayName: "Kasper",
    avatarUrl: null,
    active: true,
    ...overrides,
  };
}

const teamMembers: LinearTeamMember[] = [
  member(),
  member({ id: "user-2", name: "Robin", displayName: "Robin" }),
];

function renderActions(overrides: Partial<Parameters<typeof IssueQuickLookActions>[0]> = {}) {
  const props = {
    data: toIssueQuickLookData(issue()),
    teamMembers,
    onAction: vi.fn(),
    ...overrides,
  };
  render(<IssueQuickLookActions {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("IssueQuickLookActions", () => {
  it("shows the current priority, assignee, and due date", () => {
    renderActions();

    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("2");
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).value).toBe("user-1");
    expect((screen.getByLabelText("Due date") as HTMLInputElement).value).toBe("2026-11-01");
  });

  it("changes the priority through the shared action", async () => {
    const onAction = vi.fn();
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });

    await waitFor(() => expect(onAction).toHaveBeenCalledWith("issue-1", { kind: "priority", priority: 1 }));
    // The new priority shows right away, before Linear confirmed anything.
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("1");
  });

  it("changes the assignee through the shared action", async () => {
    const onAction = vi.fn();
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "user-2" } });

    await waitFor(() => expect(onAction).toHaveBeenCalledWith("issue-1", {
      kind: "assignee",
      assignee: { id: "user-2", name: "Robin", avatarUrl: null },
    }));
  });

  it("unassigns the issue through the shared action", async () => {
    const onAction = vi.fn();
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "" } });

    await waitFor(() => expect(onAction).toHaveBeenCalledWith("issue-1", {
      kind: "assignee",
      assignee: null,
    }));
  });

  it("offers the team members and Unassigned as assignee choices", () => {
    renderActions();

    const options = Array.from((screen.getByLabelText("Assignee") as HTMLSelectElement).options)
      .map((option) => option.textContent);
    expect(options).toEqual(["Unassigned", "Kasper", "Robin"]);
  });

  it("keeps the current assignee selectable when they are no longer a team member", () => {
    renderActions({ teamMembers: [member({ id: "user-2", name: "Robin" })] });

    const select = screen.getByLabelText("Assignee") as HTMLSelectElement;
    expect(select.value).toBe("user-1");
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Unassigned", "Robin", "Kasper"]);
  });

  it("sets and clears the due date", async () => {
    const onAction = vi.fn();
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-24" } });
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("issue-1", {
      kind: "dueDate",
      dueDate: "2026-12-24",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Clear due date" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("issue-1", {
      kind: "dueDate",
      dueDate: null,
    }));
  });

  it("clears the due date when the date field is emptied", async () => {
    const onAction = vi.fn();
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "" } });

    await waitFor(() => expect(onAction).toHaveBeenCalledWith("issue-1", {
      kind: "dueDate",
      dueDate: null,
    }));
  });

  it("shows a pending state while the mutation runs", async () => {
    let resolveAction: (() => void) | undefined;
    const onAction = vi.fn(() => new Promise<void>((resolve) => {
      resolveAction = resolve;
    }));
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });

    expect(await screen.findByText("Saving…")).toBeTruthy();
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Assignee") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Due date") as HTMLInputElement).disabled).toBe(true);

    resolveAction?.();
    await waitFor(() => expect(screen.queryByText("Saving…")).toBeNull());
  });

  it("rolls the value back and shows an error when the mutation fails", async () => {
    const onAction = vi.fn().mockRejectedValue(new Error("Linear rejected the change"));
    renderActions({ onAction });

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });

    expect((await screen.findByRole("alert")).textContent).toContain("Linear rejected the change");
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("2");
  });

  it("keeps the new value when the mutation succeeds", async () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <IssueQuickLookActions
        data={toIssueQuickLookData(issue())}
        teamMembers={teamMembers}
        onAction={onAction}
      />,
    );

    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });
    await waitFor(() => expect(onAction).toHaveBeenCalled());

    // The issue data catches up with the change that Linear confirmed.
    rerender(
      <IssueQuickLookActions
        data={toIssueQuickLookData(issue({ priority: 1, priorityLabel: "Urgent" }))}
        teamMembers={teamMembers}
        onAction={onAction}
      />,
    );

    await waitFor(() => expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("1"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
