// @vitest-environment happy-dom
import { createElement } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DependencyTree } from "./DependencyTree";
import { DeadlineTimeline } from "./DeadlineTimeline";
import { IssueQuickLookSurfaceContext, type IssueQuickLookSurface } from "./issueQuickLookContext";
import type { LinearIssue } from "./linear";
import {
  IDLE_LONG_PRESS,
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MOVE_LIMIT_PX,
  createIssueLongPressController,
  exceedsMoveLimit,
  reduceLongPress,
  useIssueLongPressController,
} from "./issueInteraction";

const ISSUE_URL = "https://linear.app/example/issue/SII-1";

/** A press of a touch pointer. */
function touchDown(element: Element, position: { x: number; y: number } = { x: 100, y: 100 }) {
  fireEvent.pointerDown(element, {
    pointerType: "touch",
    pointerId: 1,
    clientX: position.x,
    clientY: position.y,
  });
}

/** A move of the watched touch pointer. */
function touchMove(element: Element, position: { x: number; y: number }) {
  fireEvent.pointerMove(element, {
    pointerType: "touch",
    pointerId: 1,
    clientX: position.x,
    clientY: position.y,
  });
}

/** One issue row that takes part in the gesture. */
function IssueRow({ url, onClick }: { url: string; onClick: (event: ReactMouseEvent<HTMLElement>) => void }) {
  const longPress = useIssueLongPressController();
  const press = longPress.bind({ url, onClick });
  return createElement(
    "a",
    { href: url, target: "_blank", rel: "noopener noreferrer", ...press, "data-issue-row": "" },
    "SII-1",
  );
}

/** Renders one issue row and returns it with the spy of its click. */
function renderRow(url = ISSUE_URL) {
  // The click of an issue row stops the browser, like the click of a real row.
  const onClick = vi.fn((event: ReactMouseEvent<HTMLElement>) => event.preventDefault());
  const view = render(createElement(IssueRow, { url, onClick }));
  const row = view.container.querySelector("[data-issue-row]") as HTMLElement;
  return { row, onClick, view };
}

beforeEach(() => {
  vi.useFakeTimers();
  // The browser opens the new tab of the long press.
  vi.spyOn(window, "open").mockImplementation(() => ({}) as Window);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the long press decision", () => {
  const arm = () => reduceLongPress(IDLE_LONG_PRESS, {
    type: "press",
    pointerId: 1,
    pointerType: "touch",
    position: { x: 0, y: 0 },
  });

  it("watches a touch press", () => {
    const step = arm();

    expect(step.action).toBe("armed");
    expect(step.state.watching).toBe(true);
    expect(step.state.fired).toBe(false);
  });

  it("ignores a mouse press", () => {
    const step = reduceLongPress(IDLE_LONG_PRESS, {
      type: "press",
      pointerId: 1,
      pointerType: "mouse",
      position: { x: 0, y: 0 },
    });

    expect(step.action).toBe("idle");
    expect(step.state.watching).toBe(false);
  });

  it("keeps the watch while the press stays within the limit", () => {
    const step = reduceLongPress(arm().state, {
      type: "move",
      pointerId: 1,
      position: { x: 6, y: 8 },
    });

    expect(step.action).toBe("idle");
    expect(step.state.watching).toBe(true);
  });

  it("cancels the watch when the press travels beyond the limit", () => {
    const step = reduceLongPress(arm().state, {
      type: "move",
      pointerId: 1,
      position: { x: 0, y: LONG_PRESS_MOVE_LIMIT_PX + 1 },
    });

    expect(step.action).toBe("cancelled");
    expect(step.state.watching).toBe(false);
  });

  it("measures the movement as the distance of the two points", () => {
    expect(exceedsMoveLimit({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(false);
    expect(exceedsMoveLimit({ x: 0, y: 0 }, { x: 6, y: 9 })).toBe(true);
  });

  it("does not fire before the delay is over", () => {
    const step = reduceLongPress(arm().state, {
      type: "timeout",
      elapsedMs: LONG_PRESS_DELAY_MS - 1,
    });

    expect(step.action).toBe("idle");
    expect(step.state.fired).toBe(false);
  });

  it("fires when the delay is over", () => {
    const step = reduceLongPress(arm().state, {
      type: "timeout",
      elapsedMs: LONG_PRESS_DELAY_MS,
    });

    expect(step.action).toBe("long-press");
    expect(step.state.fired).toBe(true);
  });

  it("cancels the watch on a pointer cancel", () => {
    const step = reduceLongPress(arm().state, { type: "cancel", pointerId: 1 });

    expect(step.action).toBe("cancelled");
    expect(step.state.watching).toBe(false);
  });

  it("cancels the watch on an interrupt", () => {
    const step = reduceLongPress(arm().state, { type: "interrupt" });

    expect(step.action).toBe("cancelled");
    expect(step.state.watching).toBe(false);
  });

  it("releases a press that ends before the delay without firing", () => {
    const step = reduceLongPress(arm().state, { type: "release", pointerId: 1 });

    expect(step.action).toBe("released");
    expect(step.state.watching).toBe(false);
    expect(step.state.fired).toBe(false);
  });

  it("keeps the fired flag of a long press that ends afterwards", () => {
    const fired = reduceLongPress(arm().state, { type: "timeout", elapsedMs: LONG_PRESS_DELAY_MS });
    const released = reduceLongPress(fired.state, { type: "release", pointerId: 1 });

    expect(released.state.fired).toBe(true);
  });
});

describe("the long press of an issue row", () => {
  it("opens Linear after 500 ms and not the quick-look", () => {
    const { row, onClick } = renderRow();

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).toHaveBeenCalledWith(ISSUE_URL, "_blank", "noopener,noreferrer");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("opens the quick-look when the press ends before 500 ms", () => {
    const { row, onClick } = renderRow();

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS - 1);
    fireEvent.pointerUp(row, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(row);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
  });

  it("cancels the long press when the press moves beyond the limit", () => {
    const { row, onClick } = renderRow();

    touchDown(row, { x: 100, y: 100 });
    touchMove(row, { x: 100, y: 100 + LONG_PRESS_MOVE_LIMIT_PX + 1 });
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).not.toHaveBeenCalled();

    fireEvent.pointerUp(row, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cancels the long press on a pointer cancel", () => {
    const { row } = renderRow();

    touchDown(row);
    fireEvent.pointerCancel(row, { pointerType: "touch", pointerId: 1 });
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).not.toHaveBeenCalled();
  });

  it("cancels the long press when the surface scrolls", () => {
    const { row } = renderRow();

    touchDown(row);
    fireEvent.scroll(window);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).not.toHaveBeenCalled();
  });

  it("cancels the long press when a drag starts", () => {
    const controller = createIssueLongPressController();
    const onClick = vi.fn();
    const press = controller.bind({ url: ISSUE_URL, onClick });
    render(createElement("a", { href: ISSUE_URL, ...press, "data-issue-row": "" }, "SII-1"));
    const row = screen.getByRole("link");

    touchDown(row);
    controller.cancel();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).not.toHaveBeenCalled();
  });

  it("suppresses the click that follows a long press", () => {
    const { row, onClick } = renderRow();

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    fireEvent.pointerUp(row, { pointerType: "touch", pointerId: 1 });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(row, click);

    expect(onClick).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
  });

  it("suppresses the context menu that follows a long press", () => {
    const { row } = renderRow();

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row, menu);

    expect(menu.defaultPrevented).toBe(true);
  });

  it("keeps the context menu of a right-click", () => {
    const { row } = renderRow();

    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row, menu);

    expect(menu.defaultPrevented).toBe(false);
  });

  it("keeps the click of the mouse", () => {
    const { row, onClick } = renderRow();

    fireEvent.pointerDown(row, { pointerType: "mouse", pointerId: 1, clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    fireEvent.click(row);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
  });

  it("lets the link of the row open the page when the browser blocks the new tab", () => {
    vi.mocked(window.open).mockImplementation(() => null);
    const { row, onClick } = renderRow();
    // The listener reads the decision of the row and keeps the test browser
    // from following the link.
    let stoppedByTheRow: boolean | null = null;
    const read = (event: Event) => {
      stoppedByTheRow = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", read);

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    fireEvent.pointerUp(row, { pointerType: "touch", pointerId: 1 });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(row, click);
    document.removeEventListener("click", read);

    // The quick-look stays closed, and the browser follows the link itself.
    expect(onClick).not.toHaveBeenCalled();
    expect(stoppedByTheRow).toBe(false);
  });
});

/** An issue as the surfaces report it. */
function surfaceIssue(overrides: Partial<LinearIssue> & Pick<LinearIssue, "id" | "identifier">): LinearIssue {
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
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

describe("the long press of an issue surface", () => {
  it("opens Linear instead of the quick-look from an undated row", () => {
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
      issueById: () => undefined,
    };
    render(
      createElement(
        IssueQuickLookSurfaceContext.Provider,
        { value: surface },
        createElement(DeadlineTimeline, {
          issues: [surfaceIssue({ id: "a", identifier: "SII-9", title: "No deadline" })],
        }),
      ),
    );
    const row = screen.getByRole("link", { name: "SII-9 No deadline — Todo" });

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).toHaveBeenCalledWith(
      "https://linear.app/issue/SII-9",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openIssue).not.toHaveBeenCalled();
  });

  it("opens the quick-look of an undated row on a short touch", () => {
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
      issueById: () => undefined,
    };
    render(
      createElement(
        IssueQuickLookSurfaceContext.Provider,
        { value: surface },
        createElement(DeadlineTimeline, {
          issues: [surfaceIssue({ id: "a", identifier: "SII-9", title: "No deadline" })],
        }),
      ),
    );
    const row = screen.getByRole("link", { name: "SII-9 No deadline — Todo" });

    touchDown(row);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS - 1);
    fireEvent.pointerUp(row, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(row);

    expect(openIssue).toHaveBeenCalledTimes(1);
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("the long press of the tree", () => {
  // The tree lays its cards out asynchronously, so the test waits for the card
  // with real timers and turns the fake ones on afterwards.
  async function renderTree() {
    vi.useRealTimers();
    render(
      createElement(DependencyTree, {
        issues: [surfaceIssue({ id: "a", identifier: "SII-1", title: "Fix login" })],
        onCreateBlockingRelation: vi.fn(),
      }),
    );
    const card = await screen.findByRole("link", { name: /SII-1/ });
    vi.useFakeTimers();
    return card;
  }

  it("opens Linear from a card of the tree", async () => {
    const card = await renderTree();

    touchDown(card);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).toHaveBeenCalledWith(
      "https://linear.app/issue/SII-1",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("cancels the long press when a drag of a card starts", async () => {
    const card = await renderTree();

    touchDown(card);
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);

    expect(window.open).not.toHaveBeenCalled();
  });
});
