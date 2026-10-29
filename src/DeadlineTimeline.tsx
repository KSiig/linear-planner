import { useMemo } from "react";
import type { LinearIssue } from "./linear";
import {
  AXIS_HEADER_HEIGHT,
  DAY_WIDTH,
  LANE_GAP,
  LANE_HEIGHT,
  POINT_MARKER_SIZE,
  buildDeadlineTimelineLayout,
  type DeadlineTimelineAxis,
  type DeadlineTimelineGroup,
  type DeadlineTimelineIssue,
  type DeadlineTimelineMarker,
} from "./deadlineTimelineLayout";
import { shortDay, shortMonthYear } from "./views/overview/calendar";

/** Thickness of the "In started status" span, in pixels. The span is thin on purpose. */
const SPAN_THICKNESS = 4;

/** The issues the deadline timeline shows. */
export interface DeadlineTimelineProps {
  /** The issues the timeline shows. */
  issues: readonly LinearIssue[];
}

/** A month of the axis, with the columns it covers. */
interface MonthSpan {
  /** The month as `YYYY-MM`. */
  month: string;
  /** The label of the month, for example `Apr 2026`. */
  label: string;
  /** The first column of the month. */
  startDay: number;
  /** How many columns the month covers. */
  dayCount: number;
}

/** The months the axis covers, in order. */
function monthSpans(days: string[]): MonthSpan[] {
  const spans: MonthSpan[] = [];
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const month = day.slice(0, 7);
    const last = spans[spans.length - 1];
    if (last && last.month === month) {
      last.dayCount += 1;
      continue;
    }
    spans.push({ month, label: shortMonthYear(day), startDay: index, dayCount: 1 });
  }
  return spans;
}

/** The calendar-day axis, with one column per day. */
function AxisHeader({ axis }: { axis: DeadlineTimelineAxis }) {
  const months = monthSpans(axis.days);
  return (
    <div
      role="group"
      aria-label="Calendar-day axis"
      style={{
        position: "relative",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-hover)",
      }}
    >
      <div style={{ position: "relative", height: AXIS_HEADER_HEIGHT - 12 }}>
        {months.map((month) => (
          <div
            key={month.month}
            style={{
              position: "absolute",
              left: month.startDay * DAY_WIDTH,
              width: month.dayCount * DAY_WIDTH,
              paddingLeft: 4,
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {month.label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", height: 12 }}>
        {axis.days.map((day) => (
          <div
            key={day}
            title={shortDay(day)}
            style={{
              width: DAY_WIDTH,
              flexShrink: 0,
              textAlign: "center",
              fontSize: 10,
              color: "var(--text-muted)",
              borderRight: "1px solid var(--border)",
            }}
          >
            {Number(day.slice(8, 10))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The colour and the shape of a marker, so the facts read apart at a glance. */
function markerAppearance(marker: DeadlineTimelineMarker): { background: string; radius: string; transform?: string } {
  switch (marker.fact) {
    case "due":
      return { background: "var(--accent)", radius: "2px", transform: "rotate(45deg)" };
    case "enteredStartedStatus":
      return { background: "var(--iteration-line)", radius: "50%" };
    case "completed":
      return { background: "var(--text)", radius: "2px" };
    default:
      return { background: "color-mix(in srgb, var(--iteration-line) 45%, transparent)", radius: "2px" };
  }
}

/**
 * One marker on the axis.
 *
 * A point marker is a fixed size: it marks the day a fact happened on and
 * never grows into a bar that would stand for a duration. Only the span has a
 * width, and its width comes from the two dates Linear reported.
 */
function Marker({ marker }: { marker: DeadlineTimelineMarker }) {
  const isSpan = marker.kind === "span";
  const thickness = isSpan ? SPAN_THICKNESS : POINT_MARKER_SIZE;
  const left = marker.startDay * DAY_WIDTH + (isSpan ? 0 : (DAY_WIDTH - POINT_MARKER_SIZE) / 2);
  const width = isSpan ? (marker.endDay - marker.startDay) * DAY_WIDTH : POINT_MARKER_SIZE;
  const top = marker.lane * (LANE_HEIGHT + LANE_GAP) + (LANE_HEIGHT - thickness) / 2;
  const appearance = markerAppearance(marker);
  return (
    <div
      role="listitem"
      aria-label={marker.accessibleName}
      title={marker.accessibleName}
      data-fact={marker.fact}
      data-date={marker.startDate}
      data-end-date={marker.endDate}
      data-lane={marker.lane}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: thickness,
        background: appearance.background,
        borderRadius: appearance.radius,
        transform: appearance.transform,
      }}
    />
  );
}

/** The band of one milestone. The markers of the milestone share the band. */
function GroupBand({ group }: { group: DeadlineTimelineGroup }) {
  const lanes = group.markers.reduce((most, marker) => Math.max(most, marker.lane + 1), 0);
  return (
    <section aria-label={`Milestone ${group.name}`} style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        style={{
          padding: "6px 8px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {group.name}
      </div>
      <div
        role="list"
        aria-label={`${group.name} markers`}
        style={{ position: "relative", height: Math.max(lanes, 1) * (LANE_HEIGHT + LANE_GAP) }}
      >
        {group.markers.map((marker) => (
          <Marker key={marker.key} marker={marker} />
        ))}
      </div>
    </section>
  );
}

/** The open issues that carry no due date. */
function UndatedIssues({ issues }: { issues: DeadlineTimelineIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section
      aria-label="Open issues without a due date"
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--iteration-line)",
            }}
          >
            No due date
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{issues.length}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          Open issues without a due date.
        </div>
      </div>
      <div>
        {issues.map((entry) => (
          <a
            key={entry.issue.id}
            href={entry.issue.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${entry.issue.identifier} ${entry.issue.title} — no due date`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderTop: "1px solid var(--border)",
              color: "var(--text)",
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{entry.issue.identifier}</span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {entry.issue.title}
            </span>
            {entry.milestoneId !== null ? (
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                {entry.milestoneName}
              </span>
            ) : null}
          </a>
        ))}
      </div>
    </section>
  );
}

/**
 * The deadline timeline of a set of issues.
 *
 * The timeline shows the dates the issues report themselves: the due date of
 * an open issue, the moment the issue entered a started status and the moment
 * it was completed. The axis counts calendar days. Milestones group the issues
 * and nothing else: no date moves because of a milestone, a dependency, a
 * worker or an estimate.
 */
export function DeadlineTimeline({ issues }: DeadlineTimelineProps) {
  const layout = useMemo(() => buildDeadlineTimelineLayout(issues), [issues]);
  if (layout.groups.length === 0 && layout.undated.length === 0) return null;

  return (
    <section
      aria-label="Deadline timeline"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <header>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Deadline timeline</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Deadlines and workflow events on a calendar-day axis. A milestone groups the issues; it
          never moves a date.
        </p>
      </header>
      {layout.groups.length > 0 ? (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--surface)",
          }}
        >
          <div style={{ width: Math.max(layout.axis.dayCount * DAY_WIDTH, DAY_WIDTH) }}>
            <AxisHeader axis={layout.axis} />
            {layout.groups.map((group) => (
              <GroupBand key={group.id ?? "no-milestone"} group={group} />
            ))}
          </div>
        </div>
      ) : null}
      <UndatedIssues issues={layout.undated} />
    </section>
  );
}
