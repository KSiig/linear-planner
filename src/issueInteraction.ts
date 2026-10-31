import { createContext, useContext, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/**
 * The mobile gesture that opens Linear straight from an issue.
 *
 * The decision itself lives in one pure reducer, `reduceLongPress`. The
 * controller wires that reducer to the pointer events of a surface, and every
 * issue surface binds its rows to the controller. Nothing else in the app
 * knows about the gesture.
 */

/** The time a touch press has to last before it becomes a long press. */
export const LONG_PRESS_DELAY_MS = 500;

/** The distance a touch press may travel and still become a long press, in CSS pixels. */
export const LONG_PRESS_MOVE_LIMIT_PX = 10;

/**
 * The class of an element that shows an issue.
 *
 * The class suppresses the native touch callout on issue rows. The callout of
 * the rest of the app stays.
 */
export const ISSUE_TOUCH_CLASS = "issue-touch-target";

/** A point of the screen, in CSS pixels. */
export interface PointerPosition {
  x: number;
  y: number;
}

/** The state of the watched touch press. */
export interface LongPressState {
  /** True while a touch press is watched. */
  watching: boolean;
  /** True when the press already became a long press. */
  fired: boolean;
  /** The pointer id of the watched press. */
  pointerId: number | null;
  /** The point where the press started. */
  origin: PointerPosition | null;
}

/** The state of a surface that watches no press. */
export const IDLE_LONG_PRESS: LongPressState = {
  watching: false,
  fired: false,
  pointerId: null,
  origin: null,
};

/** What the gesture learns from an event. */
export type LongPressInput =
  | { type: "press"; pointerId: number; pointerType: string; position: PointerPosition }
  | { type: "move"; pointerId: number; position: PointerPosition }
  | { type: "release"; pointerId: number }
  | { type: "cancel"; pointerId: number }
  | { type: "interrupt" }
  | { type: "timeout"; elapsedMs: number };

/** What the gesture asks the surface to do. */
export type LongPressAction = "idle" | "armed" | "cancelled" | "released" | "long-press";

/** The result of one step of the gesture. */
export interface LongPressStep {
  /** The state after the step. */
  state: LongPressState;
  /** What the surface does with the step. */
  action: LongPressAction;
}

/** The distance between two points, in CSS pixels. */
export function pointerDistance(origin: PointerPosition, current: PointerPosition): number {
  return Math.hypot(current.x - origin.x, current.y - origin.y);
}

/** True when the press travelled further than the limit. */
export function exceedsMoveLimit(
  origin: PointerPosition,
  current: PointerPosition,
  limit: number = LONG_PRESS_MOVE_LIMIT_PX,
): boolean {
  return pointerDistance(origin, current) > limit;
}

/**
 * The decision of the gesture, without any DOM event.
 *
 * A touch press becomes a long press after 500 ms, as long as it stays within
 * 10 CSS pixels of its starting point. A pointer cancel, a movement beyond
 * that limit, a scroll, and a drag that starts all end the watch. A press
 * that ends before the 500 ms are over is a plain press: the click that
 * follows it opens the quick-look.
 */
export function reduceLongPress(state: LongPressState, input: LongPressInput): LongPressStep {
  switch (input.type) {
    case "press": {
      // Only a touch press becomes a long press. The mouse keeps its own behaviour.
      if (input.pointerType !== "touch") return { state, action: "idle" };
      return {
        state: { watching: true, fired: false, pointerId: input.pointerId, origin: input.position },
        action: "armed",
      };
    }
    case "move": {
      if (!state.watching || state.pointerId !== input.pointerId) return { state, action: "idle" };
      if (!state.origin) return { state, action: "idle" };
      if (!exceedsMoveLimit(state.origin, input.position)) return { state, action: "idle" };
      // The press travelled too far. It is a scroll or a drag, not a long press.
      return {
        state: { ...state, watching: false, pointerId: null, origin: null },
        action: "cancelled",
      };
    }
    case "release": {
      if (!state.watching || state.pointerId !== input.pointerId) return { state, action: "idle" };
      // The press ended. A press that already became a long press keeps its
      // flag, so the click that follows it stays suppressed.
      return {
        state: { watching: false, fired: state.fired, pointerId: null, origin: null },
        action: "released",
      };
    }
    case "cancel":
    case "interrupt": {
      if (!state.watching) return { state, action: "idle" };
      return {
        state: { ...state, watching: false, pointerId: null, origin: null },
        action: "cancelled",
      };
    }
    case "timeout": {
      if (!state.watching) return { state, action: "idle" };
      if (input.elapsedMs < LONG_PRESS_DELAY_MS) return { state, action: "idle" };
      return {
        state: { ...state, watching: false, fired: true, pointerId: null, origin: null },
        action: "long-press",
      };
    }
  }
}

/** The options of one issue row that takes part in the gesture. */
export interface IssueLongPressOptions {
  /** The Linear URL the long press opens in a new tab. */
  url: string;
  /** The click handler of the issue link. A long press never reaches it. */
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  /** Called when the long press fires. Defaults to opening the URL in a new tab. */
  onLongPress?: (url: string) => void;
}

/** The props an issue row takes to take part in the gesture. */
export interface IssueLongPressProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

/** The gesture of one surface. Every issue row of the surface binds to it. */
export interface IssueLongPressController {
  /** The props one issue row takes. */
  bind: (options: IssueLongPressOptions) => IssueLongPressProps;
  /** Cancels a long press that is pending. */
  cancel: () => void;
}

/**
 * Opens the Linear page of an issue in a new tab.
 *
 * The long press opens Linear itself, so the app never leaves the page. A
 * browser that blocks the new tab returns false, and the link of the row then
 * opens the page.
 */
export function openLinearInNewTab(url: string): boolean {
  if (!url) return false;
  return window.open(url, "_blank", "noopener,noreferrer") !== null;
}

/**
 * Creates the gesture of a surface.
 *
 * The controller keeps the state of the watched press, arms the timer of the
 * long press, and cancels the press when the surface scrolls or when a drag
 * starts.
 */
export function createIssueLongPressController(): IssueLongPressController {
  let state: LongPressState = IDLE_LONG_PRESS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pressed: IssueLongPressOptions | null = null;
  let startedAt = 0;
  let listening = false;
  // True when the long press opened the page of Linear itself.
  let opened = false;

  function clearTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function onScroll(): void {
    // The surface moved under the finger, so the press is a scroll.
    step({ type: "interrupt" });
  }

  function syncScrollListener(): void {
    if (state.watching && !listening) {
      window.addEventListener("scroll", onScroll, true);
      listening = true;
      return;
    }
    if (!state.watching && listening) {
      window.removeEventListener("scroll", onScroll, true);
      listening = false;
    }
  }

  function step(input: LongPressInput): LongPressAction {
    const result = reduceLongPress(state, input);
    state = result.state;
    if (result.action === "cancelled" || result.action === "released") clearTimer();
    syncScrollListener();
    return result.action;
  }

  function armTimer(): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      const action = step({ type: "timeout", elapsedMs: Date.now() - startedAt });
      if (action !== "long-press") return;
      const options = pressed;
      pressed = null;
      if (!options) return;
      if (options.onLongPress) {
        options.onLongPress(options.url);
        opened = true;
        return;
      }
      opened = openLinearInNewTab(options.url);
    }, LONG_PRESS_DELAY_MS);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>, options: IssueLongPressOptions): void {
    opened = false;
    if (event.pointerType !== "touch") {
      // The mouse starts a new gesture. A long press that never reached its
      // click must not swallow this click.
      state = { ...state, fired: false };
      return;
    }
    pressed = options;
    startedAt = Date.now();
    const action = step({
      type: "press",
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      position: { x: event.clientX, y: event.clientY },
    });
    if (action !== "armed") return;
    armTimer();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>): void {
    if (!state.watching || state.pointerId !== event.pointerId) return;
    step({ type: "move", pointerId: event.pointerId, position: { x: event.clientX, y: event.clientY } });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>): void {
    if (!state.watching || state.pointerId !== event.pointerId) return;
    step({ type: "release", pointerId: event.pointerId });
    pressed = null;
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLElement>): void {
    if (!state.watching || state.pointerId !== event.pointerId) return;
    step({ type: "cancel", pointerId: event.pointerId });
    pressed = null;
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLElement>): void {
    // The menu of a right-click stays: it belongs to the desktop. The menu of
    // a touch press does not: the touch opens Linear instead.
    if (!state.watching && !state.fired) return;
    event.preventDefault();
  }

  function handleClick(event: ReactMouseEvent<HTMLElement>, options: IssueLongPressOptions): void {
    if (!state.fired) {
      options.onClick(event);
      return;
    }
    // The long press opened Linear already. The click that follows it opens
    // nothing at all.
    state = { ...state, fired: false };
    const openedLinear = opened;
    opened = false;
    if (!openedLinear) {
      // The browser blocked the new tab, so the link of the row opens the page.
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function bind(options: IssueLongPressOptions): IssueLongPressProps {
    return {
      onPointerDown: (event) => handlePointerDown(event, options),
      onPointerMove: (event) => handlePointerMove(event),
      onPointerUp: (event) => handlePointerUp(event),
      onPointerCancel: (event) => handlePointerCancel(event),
      onContextMenu: (event) => handleContextMenu(event),
      onClick: (event) => handleClick(event, options),
    };
  }

  return {
    bind,
    cancel: () => {
      step({ type: "interrupt" });
      pressed = null;
    },
  };
}

/**
 * The gesture of the app.
 *
 * A surface that shows issue rows binds its rows to the controller of the
 * provider, so every row of the app shares one gesture.
 */
export const IssueLongPressContext = createContext<IssueLongPressController | null>(null);

/**
 * The gesture of the surrounding surface.
 *
 * The controller is shared by every issue row of the surface, so a press on
 * one row never leaves another row watching. A surface without a provider
 * owns its own controller.
 */
export function useIssueLongPressController(): IssueLongPressController {
  const shared = useContext(IssueLongPressContext);
  const [own] = useState(createIssueLongPressController);
  return shared ?? own;
}
