import { defineCard } from "../shell/contract";
import { addCalendarDays, shortDay } from "../../calendar";
import "./index.css";

const CLOSED = new Set(["completed", "canceled"]);

export const nextCard = defineCard({
  id: "next",
  async load(ctx) {
    const end = addCalendarDays(ctx.today, 14);
    const rows = ctx.issues
      .filter((issue) => !CLOSED.has(issue.state.type) && issue.dueDate !== null)
      .filter((issue) => issue.dueDate! >= ctx.today && issue.dueDate! <= end)
      .sort((left, right) => {
        const byDate = left.dueDate!.localeCompare(right.dueDate!);
        if (byDate !== 0) return byDate;
        return left.identifier.localeCompare(right.identifier);
      })
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
      title: "Next",
      subtitle: `through ${shortDay(end)}`,
      sections: [{ rows }],
    };
  },
});
