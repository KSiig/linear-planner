import "./index.css";
import { shortDay } from "../../calendar";
import { dueWindowRange, getDueWindowConfig, matchesDueWindow } from "../../../../dueWindows";
import { defineCard, type CardContext, type CardModel, type OverviewIssue } from "../shell/contract";

function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

export const soonCard = defineCard({
  id: "soon",
  async load(ctx: CardContext): Promise<CardModel | null> {
    // The boundaries are read when the card loads, so a change to them
    // reaches the card without a reload.
    const config = getDueWindowConfig();
    const range = dueWindowRange("soon", ctx.today, config);
    const rows = ctx.issues
      .filter((issue) => isOpen(issue) && matchesDueWindow(issue.dueDate, "soon", ctx.today, config))
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
      subtitle: range.end === null ? undefined : `through ${shortDay(range.end)}`,
      sections: [{ rows }],
    };
  },
});
