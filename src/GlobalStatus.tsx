import { useMemo, useState, type CSSProperties } from "react";
import type { LinearIssue } from "./linear";
import { DUE_SOON_WINDOW_DAYS, getProjectFactsSummary } from "./issueFacts";
import { localToday } from "./views/overview/calendar";
import { useNarrowLayout } from "./useNarrowLayout";

// Match the milestone headers: orange, uppercase, tracked-out.
const titleStyle: CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--iteration-line)", whiteSpace: "nowrap" };
const lineStyle: CSSProperties = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" };

/** One count of the bar: its label and its number. */
interface Section {
  title: string;
  value: string;
}

/** No workflow state is configured as terminal. */
const NO_DONE_STATES: ReadonlySet<string> = new Set<string>();

/**
 * The facts the global status bar is built from.
 *
 * Every field is optional so the bar renders before the project's issues are
 * loaded: an empty project then reads as zero counts.
 */
export interface GlobalStatusProps {
  /** The project's issues, exactly as Linear reports them. */
  issues?: readonly LinearIssue[];
  /** The workflow state ids the project treats as terminal. */
  doneStateIds?: ReadonlySet<string>;
  /** The current calendar day (`YYYY-MM-DD`). */
  today?: string;
}

/**
 * Horizontal "global status" bar shown above every mode: the facts of ALL
 * issues, ignoring milestones.
 *
 * Every number is read off the issues themselves — how many are open, how many
 * are completed, overdue, due in the next two weeks, blocked or without a due
 * date. No estimate, worker count, duration or workday count takes part, and no
 * verdict compares the project against a schedule.
 */
export function GlobalStatus({ issues = [], doneStateIds = NO_DONE_STATES, today = localToday(new Date()) }: GlobalStatusProps) {
  const facts = useMemo(
    () => getProjectFactsSummary(issues, doneStateIds, today),
    [issues, doneStateIds, today],
  );

  const sections: Section[] = [
    { title: "Open", value: `${facts.open}` },
    { title: "Completed", value: `${facts.completed}` },
    { title: "Overdue", value: `${facts.overdue}` },
    { title: `Due in ${DUE_SOON_WINDOW_DAYS} days`, value: `${facts.dueSoon}` },
    { title: "Blocked", value: `${facts.blocked}` },
    { title: "No due date", value: `${facts.noDueDate}` },
  ];

  const narrow = useNarrowLayout();
  const [expanded, setExpanded] = useState(false);

  const blocks = (
    <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap", rowGap: 12 }}>
      {sections.map((sec, i) => (
        <div key={sec.title} style={{ display: "flex", alignItems: "stretch" }}>
          {i > 0 && <div style={{ width: 1, background: "var(--border)", margin: "0 16px" }} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ ...titleStyle, color: i === 0 ? "var(--iteration-line)" : "var(--text)" }}>{sec.title}</span>
            <span style={lineStyle}>{sec.value}</span>
          </div>
        </div>
      ))}
    </div>
  );

  if (!narrow) return blocks;

  // On a phone only the three counts a reader acts on stay on the button; the
  // expanded view holds every count.
  const summaryLine = `${facts.open} open · ${facts.overdue} overdue · ${facts.dueSoon} due in ${DUE_SOON_WINDOW_DAYS} days`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          background: "transparent", border: "none", padding: "2px 0",
          textAlign: "left", cursor: "pointer", fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{summaryLine}</span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div style={{ marginTop: 8 }}>{blocks}</div>}
    </div>
  );
}
