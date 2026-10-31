import { createContext, useContext } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import type { LinearIssue } from "./linear";
import type { IssueQuickLookTriggerProps } from "./IssueQuickLook";

/**
 * The contract the app shares with the surfaces that show issues.
 *
 * The app owns one quick-look. A surface reaches it through this contract:
 * the trigger props describe the shared dialog, `openIssue` opens that dialog
 * for an issue, and `issueById` gives a surface the full issue behind a row.
 */
export interface IssueQuickLookSurface {
  /** The trigger props of the shared quick-look. */
  readonly trigger: IssueQuickLookTriggerProps;
  /** The id of the issue the shared quick-look shows, or null when none is selected. */
  readonly selectedIssueId: string | null;
  /** Opens the shared quick-look for an issue. */
  readonly openIssue: (issueId: string, event: ReactMouseEvent<HTMLElement>) => void;
  /** The full issue behind an id, when the app knows it. */
  readonly issueById: (issueId: string) => LinearIssue | undefined;
}

/** The shared quick-look contract. It is null when a surface renders outside the app. */
export const IssueQuickLookSurfaceContext = createContext<IssueQuickLookSurface | null>(null);

/** The shared quick-look contract of the app that renders the surface. */
export function useIssueQuickLookSurface(): IssueQuickLookSurface | null {
  return useContext(IssueQuickLookSurfaceContext);
}

/**
 * True when the click carries a modifier key.
 *
 * A modified click keeps the behaviour of the browser: it opens Linear in a
 * new tab, and the app opens nothing.
 */
export function isModifiedIssueClick(event: ReactMouseEvent<HTMLElement>): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
}

/** The issue a surface points at. It carries the link and the accessible name, no issue facts. */
export interface IssueLinkTarget {
  /** The id of the issue. */
  id: string;
  /** The Linear URL of the issue. */
  url: string;
  /** The accessible name of the element: identifier, title, and status. */
  name: string;
}

/** The props an issue surface puts on the element that points at an issue. */
export interface IssueQuickLookLinkProps {
  href: string;
  target: "_blank";
  rel: string;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-label": string;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

/**
 * The props of the element that points at an issue.
 *
 * Every issue surface uses these props, so a plain click opens the shared
 * quick-look, a modified click keeps the link behaviour of the browser, and
 * the element answers the keyboard.
 */
export function issueQuickLookLink(
  surface: IssueQuickLookSurface | null,
  issue: IssueLinkTarget,
): IssueQuickLookLinkProps {
  const expanded = surface !== null
    && surface.selectedIssueId === issue.id
    && surface.trigger["aria-expanded"];
  return {
    href: issue.url,
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-haspopup": "dialog",
    "aria-expanded": expanded,
    "aria-controls": surface?.trigger["aria-controls"] ?? "",
    "aria-label": issue.name,
    onClick: (event) => {
      if (!surface) return;
      // A modified click opens Linear directly, so the browser keeps its own behaviour.
      if (isModifiedIssueClick(event)) return;
      event.preventDefault();
      surface.openIssue(issue.id, event);
    },
    onKeyDown: (event) => {
      if (!surface) return;
      if (event.key !== " " && event.key !== "Spacebar") return;
      // A link does not answer the space bar, so the click is fired by hand.
      event.preventDefault();
      event.currentTarget.click();
    },
  };
}

/** The accessible name of an issue: its identifier, its title, and its status. */
export function issueAccessibleName(identifier: string, title: string, statusName: string): string {
  return `${identifier} ${title} — ${statusName}`;
}
