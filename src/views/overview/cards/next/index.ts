import { defineCard } from "../shell/contract";
import { shortDay } from "../../calendar";
import { dueWindowRange, matchesDueWindow } from "../../../../dueWindows";
import "./index.css";

const CLOSED = new Set(["completed", "canceled"]);

export const nextCard = defineCard({
  id: "next",
  async load(ctx) {
    const range = dueWindowRange("next", ctx.today);
    const rows = ctx.issues
      .filter((issue) => !CLOSED.has(issue.state.type) && matchesDueWindow(issue.dueDate, "next", ctx.today))
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
      subtitle: range.end === null ? undefined : `through ${shortDay(range.end)}`,
      sections: [{ rows }],
    };
  },
});
