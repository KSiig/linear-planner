import { defineCard, type CardRow, type CardSection, type OverviewIssue } from "../shell/contract";
import "./index.css";

const PRIORITY_RANK: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  0: 4,
};

function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

function compareIssues(left: OverviewIssue, right: OverviewIssue): number {
  const byPriority = (PRIORITY_RANK[left.priority] ?? 4) - (PRIORITY_RANK[right.priority] ?? 4);
  if (byPriority !== 0) return byPriority;
  if (left.updatedAt < right.updatedAt) return -1;
  if (left.updatedAt > right.updatedAt) return 1;
  return left.identifier.localeCompare(right.identifier);
}

function toRow(issue: OverviewIssue): CardRow {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    trailing: issue.priorityLabel,
    projectName: issue.project?.name ?? "",
  };
}

export const noDateCard = defineCard({
  id: "no-date",
  appearance: {
    collapseAfter: 1,
    scroll: "body",
  },
  async load(ctx) {
    const undated = ctx.issues.filter((issue) => isOpen(issue) && issue.dueDate === null);
    const lead = undated.filter((issue) => issue.state.type !== "backlog").sort(compareIssues);
    const ideas = undated.filter((issue) => issue.state.type === "backlog").sort(compareIssues);
    const sections: CardSection[] = [];
    if (lead.length > 0) sections.push({ rows: lead.map(toRow) });
    if (ideas.length > 0) sections.push({ title: "Ideas", rows: ideas.map(toRow) });
    if (sections.length === 0) return null;
    return { title: "No date", sections };
  },
});
