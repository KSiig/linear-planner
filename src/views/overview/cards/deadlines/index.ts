import "./index.css";
import { addCalendarDays, shortDay } from "../../calendar";
import { loadDisplaySettings } from "../../../../savedViews";
import { defineCard, type CardRow, type CardSection, type OverviewIssue } from "../shell/contract";

/**
 * How many calendar days the deadline window covers, today included.
 *
 * This window is fixed. The Next, Soon, and Later windows belong to the Due
 * filter and are configurable, so the deadline card computes its own bounds
 * from the calendar helper instead of reading the due-window module.
 */
const DEADLINE_WINDOW_DAYS = 14;

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
 * when its workflow state id is part of the configured done-state ids. The
 * comparison is on ids, never on state names.
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

function toRow(issue: OverviewIssue): CardRow {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    trailing: "",
    projectName: issue.project?.name ?? "",
  };
}

export const deadlinesCard = defineCard({
  id: "deadlines",
  async load(ctx) {
    const doneStateIds = configuredDoneStateIds();
    const start = ctx.today;
    const end = addCalendarDays(ctx.today, DEADLINE_WINDOW_DAYS);

    const byDate = new Map<string, OverviewIssue[]>();
    for (const issue of ctx.issues) {
      // A done issue is not open work, so it is not a deadline.
      if (!isOpen(issue) || isDone(issue, doneStateIds)) continue;
      const due = dueDay(issue);
      if (due === null || due < start || due > end) continue;
      const group = byDate.get(due) ?? [];
      group.push(issue);
      byDate.set(due, group);
    }

    const dates = [...byDate.keys()].sort((left, right) => left.localeCompare(right));
    const sections: CardSection[] = dates.map((dueDate) => {
      const rows = byDate
        .get(dueDate)!
        .map(toRow)
        .sort((left, right) => left.identifier.localeCompare(right.identifier));
      return { title: `${shortDay(dueDate)} · ${rows.length}`, rows };
    });

    if (sections.length === 0) return null;

    return {
      title: "Deadlines",
      subtitle: `${shortDay(start)} – ${shortDay(end)}`,
      sections,
    };
  },
});
