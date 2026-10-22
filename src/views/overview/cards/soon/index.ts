import "./index.css";
import { addCalendarDays, shortDay } from "../../calendar";
import { defineCard, type CardContext, type CardModel, type OverviewIssue } from "../shell/contract";

function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

export const soonCard = defineCard({
  id: "soon",
  async load(ctx: CardContext): Promise<CardModel | null> {
    const start = addCalendarDays(ctx.today, 15);
    const end = addCalendarDays(ctx.today, 45);
    const rows = ctx.issues
      .filter((issue) => {
        if (!isOpen(issue) || issue.dueDate === null) return false;
        return issue.dueDate >= start && issue.dueDate <= end;
      })
      .sort((a, b) => {
        const byDate = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
        if (byDate !== 0) return byDate;
        return a.identifier.localeCompare(b.identifier);
      })
      .map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        trailing: shortDay(issue.dueDate as string),
        projectName: issue.project?.name ?? "",
      }));

    if (rows.length === 0) return null;

    return {
      title: "Soon",
      subtitle: `through ${shortDay(end)}`,
      sections: [{ rows }],
    };
  },
});
