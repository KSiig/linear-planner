import type { LinearIssue } from "./linear";
import {
  getIssueTimelineFacts,
  isOpenIssue,
  type TimelineEvent,
  type TimelineLabel,
} from "./issueFacts";
import { addCalendarDays } from "./views/overview/calendar";

/** Width of one calendar-day column, in pixels. */
export const DAY_WIDTH = 32;

/** Height of one marker lane, in pixels. */
export const LANE_HEIGHT = 18;

/** Vertical gap between two marker lanes, in pixels. */
export const LANE_GAP = 4;

/** Edge length of a point marker, in pixels. A point marker never grows with a duration. */
export const POINT_MARKER_SIZE = 10;

/** Height of the axis header, in pixels. */
export const AXIS_HEADER_HEIGHT = 26;

/** The name the group of issues without a milestone gets. */
export const NO_MILESTONE_NAME = "No milestone";

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The number of days between the epoch and a `YYYY-MM-DD` calendar day.
 *
 * The arithmetic runs in UTC, so a day counts as one day on either side of a
 * daylight-saving change: the axis counts calendar days, not hours.
 */
export function calendarDayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY;
}

/** The calendar-day axis every marker is placed on. */
export interface DeadlineTimelineAxis {
  /** The first calendar day on the axis (`YYYY-MM-DD`), or null when the axis is empty. */
  startDate: string | null;
  /** How many calendar days the axis holds. */
  dayCount: number;
  /** The calendar day of every column, in order. */
  days: string[];
}

/** One marker on the timeline: one fact of one issue. */
export interface DeadlineTimelineMarker {
  /** A key that is unique inside the whole timeline. */
  key: string;
  /** The id of the issue the marker belongs to. */
  issueId: string;
  /** The identifier of the issue, for example `ABC-12`. */
  identifier: string;
  /** The title of the issue. */
  title: string;
  /** Which fact the marker shows. */
  fact: TimelineEvent["fact"];
  /** The canonical label of the fact. */
  label: TimelineLabel;
  /** `point` for a single-day marker, `span` for a range of days. */
  kind: TimelineEvent["kind"];
  /** The calendar day the marker starts on. */
  startDate: string;
  /** The calendar day the marker ends on. A point marker ends on the day it starts. */
  endDate: string;
  /** The column of the first day of the marker, counted from the axis start. */
  startDay: number;
  /** The column after the last day of the marker, counted from the axis start. */
  endDay: number;
  /** The lane the marker takes inside its milestone group. */
  lane: number;
  /** The name a screen reader reads for the marker. */
  accessibleName: string;
}

/** One issue of the timeline, with the milestone it belongs to. */
export interface DeadlineTimelineIssue {
  /** The issue the timeline shows. */
  issue: LinearIssue;
  /** The milestone id, or null when the issue has no milestone. */
  milestoneId: string | null;
  /** The milestone name, or `No milestone` when the issue has no milestone. */
  milestoneName: string;
}

/** The issues of one milestone, with the markers they put on the axis. */
export interface DeadlineTimelineGroup {
  /** The milestone id, or null when the issue has no milestone. */
  id: string | null;
  /** The milestone name, or `No milestone` when the issue has no milestone. */
  name: string;
  /** The order of the milestone. Issues without a milestone sort last. */
  sortOrder: number;
  /** The issues of the group, ordered by identifier. */
  issues: DeadlineTimelineIssue[];
  /** The markers of the group, ordered by their position on the axis. */
  markers: DeadlineTimelineMarker[];
}

/** The whole timeline: one axis, the milestone groups and the undated issues. */
export interface DeadlineTimelineLayout {
  /** The calendar-day axis every marker sits on. */
  axis: DeadlineTimelineAxis;
  /** The milestone groups, in milestone order. */
  groups: DeadlineTimelineGroup[];
  /** Every marker of the timeline, in group order. */
  markers: DeadlineTimelineMarker[];
  /** The open issues without a due date. */
  undated: DeadlineTimelineIssue[];
}

/** The milestone an issue belongs to. */
interface MilestoneFacts {
  id: string | null;
  name: string;
  sortOrder: number;
}

function milestoneOf(issue: LinearIssue): MilestoneFacts {
  const milestone = issue.projectMilestone;
  if (!milestone) {
    return { id: null, name: NO_MILESTONE_NAME, sortOrder: Number.MAX_SAFE_INTEGER };
  }
  return { id: milestone.id, name: milestone.name, sortOrder: milestone.sortOrder };
}

/** The name a screen reader reads for a marker. */
function markerAccessibleName(
  fact: TimelineEvent["fact"],
  label: TimelineLabel,
  identifier: string,
  title: string,
  startDate: string,
  endDate: string,
  milestoneName: string | null,
): string {
  const issue = title ? `${identifier} ${title}` : identifier;
  const milestone = milestoneName ? ` (${milestoneName})` : "";
  if (fact === "statusHistory") {
    return `${label} ${startDate} to ${endDate} — ${issue}${milestone}`;
  }
  return `${label} ${startDate} — ${issue}${milestone}`;
}

/** The markers of one issue, one marker per fact the issue supports. */
function markersOfIssue(entry: DeadlineTimelineIssue): DeadlineTimelineMarker[] {
  const { issue, milestoneId, milestoneName } = entry;
  const facts = getIssueTimelineFacts(issue);
  return facts.map((event) => {
    const startDate = event.kind === "span" ? event.startDate : event.date;
    const endDate = event.kind === "span" ? event.endDate : event.date;
    return {
      key: `${issue.id}:${event.fact}`,
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      fact: event.fact,
      label: event.label,
      kind: event.kind,
      startDate,
      endDate,
      startDay: 0,
      endDay: 0,
      lane: 0,
      accessibleName: markerAccessibleName(
        event.fact,
        event.label,
        issue.identifier,
        issue.title,
        startDate,
        endDate,
        milestoneId === null ? null : milestoneName,
      ),
    };
  });
}

function compareIssues(left: DeadlineTimelineIssue, right: DeadlineTimelineIssue): number {
  return (
    left.issue.identifier.localeCompare(right.issue.identifier) ||
    left.issue.id.localeCompare(right.issue.id)
  );
}

function compareGroups(left: DeadlineTimelineGroup, right: DeadlineTimelineGroup): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    (left.id ?? "").localeCompare(right.id ?? "")
  );
}

/**
 * The markers of a group, ordered by the day they start on.
 *
 * The sort is stable, so the markers of one issue keep the canonical order of
 * that issue's facts. The order only depends on the issues themselves, never on
 * the order they came in.
 */
function compareMarkers(left: DeadlineTimelineMarker, right: DeadlineTimelineMarker): number {
  return (
    left.startDay - right.startDay ||
    left.identifier.localeCompare(right.identifier) ||
    left.issueId.localeCompare(right.issueId)
  );
}

/**
 * Give every marker of a group a lane.
 *
 * A marker takes the first lane whose last marker ended before this marker
 * starts, so two markers that share a day never share a lane. The lanes start
 * over in every group: a milestone groups the issues, it never moves a date.
 */
function assignLanes(markers: DeadlineTimelineMarker[]): DeadlineTimelineMarker[] {
  const laneEnds: number[] = [];
  return markers.map((marker) => {
    let lane = laneEnds.findIndex((end) => end <= marker.startDay);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(marker.endDay);
    } else {
      laneEnds[lane] = marker.endDay;
    }
    return { ...marker, lane };
  });
}

/** The calendar days the markers of the timeline cover. */
function buildAxis(markers: DeadlineTimelineMarker[]): DeadlineTimelineAxis {
  if (markers.length === 0) return { startDate: null, dayCount: 0, days: [] };
  let first = markers[0].startDate;
  let last = markers[0].endDate;
  for (const marker of markers) {
    if (marker.startDate < first) first = marker.startDate;
    if (marker.endDate > last) last = marker.endDate;
  }
  const dayCount = calendarDayNumber(last) - calendarDayNumber(first) + 1;
  const days: string[] = [];
  for (let index = 0; index < dayCount; index += 1) days.push(addCalendarDays(first, index));
  return { startDate: first, dayCount, days };
}

/**
 * The deadline timeline of a set of issues.
 *
 * The timeline holds the dates the issues report themselves: a due date, the
 * moment the issue entered a started status, the moment it was completed and
 * the stretch between those two. Nothing is inferred: no start is calculated
 * from a due date, no duration is estimated and no date moves because of a
 * dependency, a worker or a milestone.
 */
export function buildDeadlineTimelineLayout(issues: readonly LinearIssue[]): DeadlineTimelineLayout {
  const entries: DeadlineTimelineIssue[] = issues.map((issue) => {
    const milestone = milestoneOf(issue);
    return {
      issue,
      milestoneId: milestone.id,
      milestoneName: milestone.name,
    };
  });

  const byMilestone = new Map<string | null, DeadlineTimelineIssue[]>();
  for (const entry of entries) {
    const list = byMilestone.get(entry.milestoneId);
    if (list) list.push(entry);
    else byMilestone.set(entry.milestoneId, [entry]);
  }

  const groups: DeadlineTimelineGroup[] = [];
  for (const [id, list] of byMilestone) {
    list.sort(compareIssues);
    groups.push({
      id,
      name: list[0].milestoneName,
      sortOrder: milestoneOf(list[0].issue).sortOrder,
      issues: list,
      markers: [],
    });
  }
  groups.sort(compareGroups);

  // The markers of every group, before they are placed on the axis.
  for (const group of groups) {
    group.markers = group.issues.flatMap((entry) => markersOfIssue(entry));
  }

  const axis = buildAxis(groups.flatMap((group) => group.markers));
  const axisStart = axis.startDate === null ? 0 : calendarDayNumber(axis.startDate);

  for (const group of groups) {
    const placed = group.markers.map((marker) => {
      const startDay = calendarDayNumber(marker.startDate) - axisStart;
      // A span covers both of its days, so the column after its last day is the
      // end of the marker. A point covers the single day it sits on.
      const endDay = calendarDayNumber(marker.endDate) + 1 - axisStart;
      return { ...marker, startDay, endDay };
    });
    group.markers = assignLanes([...placed].sort(compareMarkers));
  }

  const undated = entries
    .filter((entry) => isOpenIssue(entry.issue) && !entry.issue.dueDate)
    .sort(
      (left, right) =>
        milestoneOf(left.issue).sortOrder - milestoneOf(right.issue).sortOrder ||
        compareIssues(left, right),
    );

  return {
    axis,
    groups,
    markers: groups.flatMap((group) => group.markers),
    undated,
  };
}
