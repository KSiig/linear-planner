import "./index.css";
import { createElement } from "react";
import { loadDisplaySettings } from "../../../../savedViews";
import { defineCard, type CardSection, type OverviewIssue } from "../shell/contract";

/** The name of the section that holds the issues without a milestone. */
const NO_MILESTONE_NAME = "No milestone";

/** The counts and the due-date range of one milestone. */
interface MilestoneFacts {
  /** The issues in the milestone. */
  total: number;
  /** The issues whose workflow state type is neither completed nor canceled. */
  open: number;
  /** The issues in a terminal state: a completed-type state or a configured terminal state id. */
  completed: number;
  /** The open, not-done issues whose due date already passed. */
  overdue: number;
  /** The earliest due date in the milestone, or null when no issue has one. */
  earliestDueDate: string | null;
  /** The latest due date in the milestone, or null when no issue has one. */
  latestDueDate: string | null;
}

/** The issues of one milestone. */
interface MilestoneGroup {
  /** The milestone id, or null when the issues have no milestone. */
  id: string | null;
  /** The milestone name, or "No milestone" when the issues have none. */
  name: string;
  issues: OverviewIssue[];
}

/**
 * The workflow state ids the project treats as terminal.
 *
 * The setting lives in the display settings of the browser, so the card reads
 * it from there. The card context carries the issues and the day, not the
 * setting.
 */
function configuredDoneStateIds(): ReadonlySet<string> {
  return new Set(loadDisplaySettings().doneStateIds);
}

/**
 * True while the issue still needs work.
 *
 * The workflow state type is the fact: an issue is open while its state type
 * is neither completed nor canceled.
 */
function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

/**
 * True when the issue sits in a terminal state.
 *
 * A completed-type state is always terminal. A custom terminal state — for
 * example "Merged", which Linear reports as a started-type state — is terminal
 * when its workflow state id is part of the configured done-state ids.
 */
function isDone(issue: OverviewIssue, doneStateIds: ReadonlySet<string>): boolean {
  if (issue.state.type === "completed") return true;
  return doneStateIds.has(issue.state.id);
}

/** The calendar day of an issue's due date, or null when the issue has none. */
function dueDay(issue: OverviewIssue): string | null {
  if (!issue.dueDate) return null;
  return issue.dueDate.slice(0, 10);
}

/**
 * The counts and the due-date range of a milestone's issues.
 *
 * The counts follow the shared issue facts, so a milestone and the global bar
 * count the same things the same way: an issue is open while its state type is
 * neither completed nor canceled, an issue is completed when it sits in a
 * terminal state, and an issue is overdue when it is open, not done, and its
 * due date already passed. No estimate, duration, worker count, capacity or
 * projected date takes part, and a milestone date is never inferred from the
 * dates of its issues.
 */
function countFacts(
  issues: OverviewIssue[],
  doneStateIds: ReadonlySet<string>,
  today: string,
): MilestoneFacts {
  let open = 0;
  let completed = 0;
  let overdue = 0;
  let earliestDueDate: string | null = null;
  let latestDueDate: string | null = null;

  for (const issue of issues) {
    const done = isDone(issue, doneStateIds);
    if (done) completed += 1;
    if (isOpen(issue)) {
      open += 1;
      const due = dueDay(issue);
      if (!done && due !== null && due < today) overdue += 1;
    }
    const due = dueDay(issue);
    if (due !== null) {
      if (earliestDueDate === null || due < earliestDueDate) earliestDueDate = due;
      if (latestDueDate === null || due > latestDueDate) latestDueDate = due;
    }
  }

  return { total: issues.length, open, completed, overdue, earliestDueDate, latestDueDate };
}

/**
 * The milestones the issues belong to.
 *
 * A milestone without issues is not in the list: the card only holds the
 * milestones the issues name. The issues without a milestone share the "No
 * milestone" group, and that group is only there when it holds issues. The
 * groups are ordered by name, with the issues without a milestone last.
 */
function groupByMilestone(issues: OverviewIssue[]): MilestoneGroup[] {
  const groups = new Map<string | null, MilestoneGroup>();
  for (const issue of issues) {
    const id = issue.milestone?.id ?? null;
    const name = issue.milestone?.name ?? NO_MILESTONE_NAME;
    const group = groups.get(id) ?? { id, name, issues: [] };
    group.issues.push(issue);
    groups.set(id, group);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.id === null) return 1;
    if (right.id === null) return -1;
    return left.name.localeCompare(right.name);
  });
}

/** `2026-03-01` → `1 Mar 2026`. */
function formatDueDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The count line of a milestone: the total, the open and the completed issues. */
function countLine(facts: MilestoneFacts): string {
  const total = `${facts.total} issue${facts.total !== 1 ? "s" : ""}`;
  return `${total} · ${facts.open} open · ${facts.completed} completed`;
}

/**
 * The due-date window of a milestone, or null when no issue in it has a due
 * date. A milestone whose issues share one due date shows that date, not a
 * range.
 */
function dueRangeLine(facts: MilestoneFacts): string | null {
  const { earliestDueDate, latestDueDate } = facts;
  if (!earliestDueDate || !latestDueDate) return null;
  if (earliestDueDate === latestDueDate) return formatDueDate(earliestDueDate);
  return `${formatDueDate(earliestDueDate)} – ${formatDueDate(latestDueDate)}`;
}

/** The title of a milestone section: its name and its facts. */
function sectionTitle(name: string, facts: MilestoneFacts): string {
  const parts = [name, countLine(facts), `${facts.overdue} overdue`];
  const range = dueRangeLine(facts);
  if (range !== null) parts.push(range);
  return parts.join(" · ");
}

export const milestonesCard = defineCard({
  id: "milestones",
  /**
   * The header of the card.
   *
   * The card summarises milestones and holds no issue rows, so the row count
   * of the shell would read as zero. The header shows the name of the card
   * on its own.
   */
  renderHeader: (model) =>
    createElement(
      "header",
      { className: "overview-card-header" },
      createElement("h2", null, model.title),
    ),
  async load(ctx) {
    const doneStateIds = configuredDoneStateIds();
    const groups = groupByMilestone(ctx.issues);
    if (groups.length === 0) return null;

    const sections: CardSection[] = groups.map((group) => ({
      title: sectionTitle(group.name, countFacts(group.issues, doneStateIds, ctx.today)),
      rows: [],
    }));

    return {
      title: "Milestones",
      sections,
    };
  },
});
