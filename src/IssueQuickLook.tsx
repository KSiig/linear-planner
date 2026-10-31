import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { LinearWorkflowState } from "./linear";
import { toPlainText, type IssueQuickLookData, type IssueQuickLookRelationship } from "./issueQuickLookModel";
import { StatusSelect } from "./StatusSelect";
import { useNarrowLayout } from "./useNarrowLayout";

const EXCERPT_LIMIT = 300;
const DESKTOP_PANEL_WIDTH = 420;

export interface IssueQuickLookTriggerProps {
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string;
}

export interface IssueQuickLookProps {
  /** The canonical issue projection shown by the quick-look. */
  data: IssueQuickLookData;
  /** Workflow states belonging to the issue's team. */
  teamStates: readonly LinearWorkflowState[];
  /** Started workflow states used to draw status progress. */
  startedStates?: readonly LinearWorkflowState[];
  /** Called with the issue id and selected workflow-state id. */
  onStatusChange: (issueId: string, stateId: string) => void | Promise<void>;
  /** Called with the relation id of the blocker to remove. */
  onRemoveBlocker: (relationId: string) => void | Promise<void>;
  /** A slot for secondary issue actions supplied by a later layer. */
  secondaryActions?: ReactNode;
  /** Renders the control that opens the quick-look. */
  trigger: (props: IssueQuickLookTriggerProps) => ReactNode;
}

interface AnchorPosition {
  top: number;
  left: number;
  width: number;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

function DescriptionExcerpt({ description, headingId }: { description: string; headingId: string }) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = toPlainText(description);
  const visibleText = expanded ? collapsed : collapsed.slice(0, EXCERPT_LIMIT);
  const canExpand = collapsed.length > EXCERPT_LIMIT;

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} style={{ margin: "0 0 6px", fontSize: 13 }}>Description</h3>
      {collapsed ? (
        <>
          <p style={{ margin: 0, color: "var(--text)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{visibleText}</p>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              style={{
                marginTop: 6,
                padding: 0,
                border: "none",
                background: "transparent",
                color: "var(--accent)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </>
      ) : (
        <p style={{ margin: 0, color: "var(--text-muted)" }}>No description</p>
      )}
    </section>
  );
}

function RelationshipState({ relationship }: { relationship: IssueQuickLookRelationship }) {
  return (
    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
      {relationship.issue.isOpen ? "Open" : "Closed"}
    </span>
  );
}

/**
 * A shared issue quick-look.
 *
 * The same dialog content is rendered as an anchored popup on desktop and as
 * a bottom sheet on narrow screens.
 */
export function IssueQuickLook({
  data,
  teamStates,
  startedStates = [],
  onStatusChange,
  onRemoveBlocker,
  secondaryActions,
  trigger,
}: IssueQuickLookProps) {
  const narrow = useNarrowLayout();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorPosition>({ top: 8, left: 8, width: DESKTOP_PANEL_WIDTH });
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [removingRelationId, setRemovingRelationId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const dialogId = `${id}-dialog`;
  const headingId = `${id}-heading`;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const firstFocusable = focusableElements(dialog)[0];
    (firstFocusable ?? dialog).focus();
  }, [open]);

  function closeQuickLook() {
    setOpen(false);
    triggerElement?.focus();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeQuickLook();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleStatusChange(stateId: string) {
    if (statusPending) return;
    setStatusPending(true);
    setStatusError(null);
    try {
      await onStatusChange(data.id, stateId);
    } catch (error) {
      setStatusError(errorMessage(error, "Could not update the issue status."));
    } finally {
      setStatusPending(false);
    }
  }

  async function handleRemoveBlocker(relationId: string) {
    if (removingRelationId) return;
    setRemovingRelationId(relationId);
    setRemoveError(null);
    try {
      await onRemoveBlocker(relationId);
    } catch (error) {
      setRemoveError(errorMessage(error, "Could not remove the blocker."));
    } finally {
      setRemovingRelationId(null);
    }
  }

  function handleTriggerClick(event: ReactMouseEvent<HTMLElement>) {
    const element = event.currentTarget;
    setTriggerElement(element);
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || DESKTOP_PANEL_WIDTH + 16;
    const width = Math.min(DESKTOP_PANEL_WIDTH, Math.max(280, viewportWidth - 16));
    setAnchor({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, viewportWidth - width - 8)),
      width,
    });
    setOpen(true);
  }

  const triggerContent = trigger({
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": dialogId,
    onClick: handleTriggerClick,
  });

  const dialog = (
    <>
      <div
        aria-hidden="true"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeQuickLook();
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          background: "rgba(0,0,0,0.28)",
        }}
      />
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        style={{
          position: "fixed",
          zIndex: 1000,
          ...(narrow
            ? {
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                maxHeight: "85vh",
                borderRadius: "12px 12px 0 0",
              }
            : {
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                maxHeight: `calc(100vh - ${anchor.top + 8}px)`,
                borderRadius: 8,
              }),
          overflowY: "auto",
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 11 }}>{data.identifier}</div>
            <h2 id={headingId} style={{ margin: "3px 0 0", fontSize: 17, lineHeight: 1.3 }}>{data.title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close quick look"
            onClick={closeQuickLook}
            style={{
              width: 28,
              height: 28,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg)",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(90px, 34%) minmax(0, 1fr)",
            gap: "8px 12px",
            margin: "18px 0",
            fontSize: 13,
          }}
        >
          <dt style={{ color: "var(--text-muted)" }}>Status</dt>
          <dd style={{ margin: 0 }}>
            <StatusSelect
              states={teamStates}
              startedStates={startedStates}
              value={data.state.id}
              onChange={(stateId) => void handleStatusChange(stateId)}
              disabled={statusPending}
              label="Status"
            />
            {statusPending && <span role="status" style={{ marginLeft: 8, fontSize: 11 }}>Updating status…</span>}
            {statusError && <div role="alert" style={{ marginTop: 4, color: "var(--danger, #d64545)", fontSize: 11 }}>{statusError}</div>}
          </dd>

          <dt style={{ color: "var(--text-muted)" }}>Priority</dt>
          <dd style={{ margin: 0 }}>{data.priorityLabel}</dd>

          <dt style={{ color: "var(--text-muted)" }}>Assignee</dt>
          <dd style={{ margin: 0 }}>
            {data.assignee ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {data.assignee.avatarUrl && (
                  <img
                    src={data.assignee.avatarUrl}
                    alt=""
                    width={18}
                    height={18}
                    style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                  />
                )}
                {data.assignee.name}
              </span>
            ) : "Unassigned"}
          </dd>

          <dt style={{ color: "var(--text-muted)" }}>Labels</dt>
          <dd style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {data.labels.length > 0 ? data.labels.map((label) => (
              <span
                key={label.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: `${label.color}20`,
                  color: label.color,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: label.color }} />
                {label.name}
              </span>
            )) : "None"}
          </dd>

          <dt style={{ color: "var(--text-muted)" }}>Milestone</dt>
          <dd style={{ margin: 0 }}>{data.milestone?.name ?? "None"}</dd>

          <dt style={{ color: "var(--text-muted)" }}>Project</dt>
          <dd style={{ margin: 0 }}>{data.project?.name ?? "None"}</dd>

          <dt style={{ color: "var(--text-muted)" }}>Due date</dt>
          <dd style={{ margin: 0 }}>
            {data.dueDate ? <time dateTime={data.dueDate}>{data.dueDate}</time> : "None"}
          </dd>

          <dt style={{ color: "var(--text-muted)" }}>Created</dt>
          <dd style={{ margin: 0 }}><time dateTime={data.createdAt}>{data.createdAt}</time></dd>

          <dt style={{ color: "var(--text-muted)" }}>Updated</dt>
          <dd style={{ margin: 0 }}><time dateTime={data.updatedAt}>{data.updatedAt}</time></dd>

          <dt style={{ color: "var(--text-muted)" }}>Entered started status</dt>
          <dd style={{ margin: 0 }}>
            {data.enteredStartedStatusAt ? <time dateTime={data.enteredStartedStatusAt}>{data.enteredStartedStatusAt}</time> : "None"}
          </dd>

          <dt style={{ color: "var(--text-muted)" }}>Completed</dt>
          <dd style={{ margin: 0 }}>
            {data.completedAt ? <time dateTime={data.completedAt}>{data.completedAt}</time> : "None"}
          </dd>
        </div>

        <section aria-labelledby={`${id}-relationships-heading`}>
          <h3 id={`${id}-relationships-heading`} style={{ margin: "0 0 8px", fontSize: 13 }}>Relationships</h3>
          <div style={{ fontSize: 12 }}>
            <strong>Blocked by</strong>
            {data.blockedBy.length === 0 ? (
              <div style={{ color: "var(--text-muted)", marginTop: 4 }}>None</div>
            ) : data.blockedBy.map((relationship) => (
              <div
                key={relationship.relationId}
                style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minWidth: 0 }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "monospace" }}>{relationship.issue.identifier}</span>{" "}
                  {relationship.issue.title}{" "}
                  <RelationshipState relationship={relationship} />
                </span>
                {relationship.relationId && (
                  <button
                    type="button"
                    aria-label={`Remove blocker ${relationship.issue.identifier}`}
                    disabled={removingRelationId !== null}
                    onClick={() => void handleRemoveBlocker(relationship.relationId)}
                    style={{
                      flexShrink: 0,
                      padding: "4px 7px",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 11,
                      cursor: removingRelationId ? "wait" : "pointer",
                    }}
                  >
                    {removingRelationId === relationship.relationId ? "Removing…" : "Remove blocker"}
                  </button>
                )}
              </div>
            ))}

            <strong style={{ display: "block", marginTop: 12 }}>Blocks</strong>
            {data.blocks.length === 0 ? (
              <div style={{ color: "var(--text-muted)", marginTop: 4 }}>None</div>
            ) : data.blocks.map((relationship) => (
              <div key={relationship.relationId} style={{ marginTop: 4 }}>
                <span style={{ fontFamily: "monospace" }}>{relationship.issue.identifier}</span>{" "}
                {relationship.issue.title}{" "}
                <RelationshipState relationship={relationship} />
              </div>
            ))}
          </div>
          {removeError && <div role="alert" style={{ marginTop: 8, color: "var(--danger, #d64545)", fontSize: 11 }}>{removeError}</div>}
        </section>

        <div style={{ marginTop: 16 }}>
          <DescriptionExcerpt key={data.id} description={data.description} headingId={`${id}-description-heading`} />
        </div>

        {secondaryActions && (
          <div role="group" aria-label="Additional issue actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {secondaryActions}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            Open in Linear
          </a>
        </div>
      </div>
    </>
  );

  return (
    <>
      {triggerContent}
      {open && typeof document !== "undefined" && createPortal(dialog, document.body)}
    </>
  );
}
