import "./index.css";
import { addCalendarDays, shortDay } from "../../calendar";
import { defineCard, type CardContext, type CardModel, type OverviewIssue } from "../shell/contract";

function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

export const overdueCard = defineCard({
  id: "overdue",
  async load(ctx: CardContext): Promise<CardModel | null> {
    const beforeToday = addCalendarDays(ctx.today, 0);
    const rows = ctx.issues
      .filter((issue) => isOpen(issue) && issue.dueDate !== null && issue.dueDate < beforeToday)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.identifier.localeCompare(b.identifier))
      .map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        trailing: shortDay(issue.dueDate!),
        projectName: issue.project?.name ?? "",
      }));
    if (rows.length === 0) return null;
    return {
      title: "Overdue",
      sections: [{ rows }],
    };
  },
});
