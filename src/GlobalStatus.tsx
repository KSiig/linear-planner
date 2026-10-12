import { useMemo, useState, type CSSProperties } from "react";
import type { ScheduleResult } from "./scheduler";
import { buildMilestoneSummary, elapsedWorkingDays, theoreticalWorkingDays } from "./MilestoneHeader";
import { useNarrowLayout } from "./useNarrowLayout";

// Match the milestone headers: orange, uppercase, tracked-out.
const titleStyle: CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--iteration-line)", whiteSpace: "nowrap" };
const lineStyle: CSSProperties = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" };

interface Section {
  title: string;
  lines: Array<{ text: string; color?: string | null }>;
}

/**
 * Horizontal "global status" bar shown above every mode: counts + progress across ALL
 * issues, ignoring milestones. Reuses buildMilestoneSummary (with status enabled) so it
 * stays consistent with the per-milestone summaries, just laid out left-to-right:
 *   Global count & started | Ongoing | Remaining | Completed
 */
export function GlobalStatus({ schedule, includeCapacityForecast = false }: { schedule: ScheduleResult; includeCapacityForecast?: boolean }) {
  const sections = useMemo<Section[]>(() => {
    const issues = schedule.issues;
    const summary = buildMilestoneSummary(issues, schedule.startDate, schedule.configuredWorkers, schedule.cycles, true, includeCapacityForecast);
    const result: Section[] = [];

    // Global: issue count + overall progress, in the SAME wall-clock terms as the Completed
    // section — elapsed days so far against the schedule the whole project would ideally take
    // with W workers. Summing per-issue days instead would mix effort with elapsed time and
    // give a number that cannot be reconciled with Completed's.
    const count = issues.length;
    const w = Math.max(1, schedule.configuredWorkers);
    const worked = issues.filter((i) => i.daysSpent != null);
    const estimated = issues.filter((i) => i.hasEstimate);
    const actualElapsed = elapsedWorkingDays(worked, schedule.startDate, schedule.cycles);
    const theoreticalElapsed = theoreticalWorkingDays(estimated, w);
    const fmt = (v: number) => (v % 1 === 0 ? `${v}` : v.toFixed(1));
    const globalLines: Section["lines"] = [
      { text: `${count} issue${count !== 1 ? "s" : ""} · ${fmt(actualElapsed)} / ~${fmt(theoreticalElapsed)} working days` },
    ];
    if (summary.startedAt) globalLines.push({ text: summary.startedAt });
    result.push({ title: "Global", lines: globalLines });

    // Ongoing
    if (summary.ongoingLabel) {
      const lines: Section["lines"] = [];
      if (summary.ongoingCount) lines.push({ text: summary.ongoingCount });
      if (summary.ongoingStatus) lines.push({ text: summary.ongoingStatus, color: summary.ongoingColor });
      result.push({ title: summary.ongoingLabel, lines });
    }

    // Remaining. The end date is omitted when the only unstarted work is an undated forecast.
    if (summary.targetDays || summary.targetEnd) {
      const lines: Section["lines"] = [];
      if (summary.targetDays) lines.push({ text: summary.targetDays });
      if (summary.targetEnd) lines.push({ text: summary.targetEnd });
      result.push({ title: "Remaining", lines });
    }

    // Completed
    if (summary.soFarLabel) {
      const lines: Section["lines"] = [];
      if (summary.soFarCount) lines.push({ text: summary.soFarCount });
      if (summary.soFarStatus) lines.push({ text: summary.soFarStatus, color: summary.soFarColor });
      result.push({ title: summary.soFarLabel, lines });
    }

    return result;
  }, [schedule, includeCapacityForecast]);

  const narrow = useNarrowLayout();
  const [expanded, setExpanded] = useState(false);

  const blocks = (
    <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap", rowGap: 12 }}>
      {sections.map((sec, i) => (
        <div key={sec.title} style={{ display: "flex", alignItems: "stretch" }}>
          {i > 0 && <div style={{ width: 1, background: "var(--border)", margin: "0 16px" }} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ ...titleStyle, color: i === 0 ? "var(--iteration-line)" : "var(--text)" }}>{sec.title}</span>
            {sec.lines.map((l, j) => (
              <span key={j} style={{ ...lineStyle, color: l.color ?? "var(--text-muted)", fontWeight: l.color ? 600 : 400 }}>
                {l.text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (!narrow) return blocks;

  const statusLine =
    sections.find((s) => s.title === "Ongoing")?.lines.find((l) => l.color)
    ?? sections.find((s) => s.title.startsWith("Completed"))?.lines.find((l) => l.color);
  const endLine = sections.find((s) => s.title === "Remaining")?.lines.find((l) => l.text.startsWith("End:"));
  const endText = endLine ? endLine.text.replace(/^End:\s*/, "ends ") : null;

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
        {statusLine && (
          <span style={{ fontWeight: 600, color: statusLine.color ?? "var(--text)" }}>{statusLine.text}</span>
        )}
        {statusLine && endText && <span style={{ color: "var(--text-muted)" }}>·</span>}
        {endText && <span style={{ color: "var(--text-muted)" }}>{endText}</span>}
        {!statusLine && !endText && <span style={{ color: "var(--text-muted)" }}>Project status</span>}
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div style={{ marginTop: 8 }}>{blocks}</div>}
    </div>
  );
}
