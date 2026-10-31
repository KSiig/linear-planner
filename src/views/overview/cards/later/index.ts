import { shortDay, shortMonthYear } from "../../calendar";
import { matchesDueWindow } from "../../../../dueWindows";
import { defineCard, type CardSection, type OverviewIssue } from "../shell/contract";
import "./index.css";

function isOpen(issue: OverviewIssue): boolean {
  return issue.state.type !== "completed" && issue.state.type !== "canceled";
}

export const laterCard = defineCard({
  id: "later",
  appearance: {
    muted: true,
    collapseAfter: 1,
    scroll: "body",
  },
  load: async (ctx) => {
    const included = ctx.issues.filter(
      (issue) => isOpen(issue) && matchesDueWindow(issue.dueDate, "later", ctx.today),
    );
    if (included.length === 0) return null;

    const byDate = new Map<string, OverviewIssue[]>();
    for (const issue of included) {
      const dueDate = issue.dueDate as string;
      const group = byDate.get(dueDate) ?? [];
      group.push(issue);
      byDate.set(dueDate, group);
    }

    const dates = [...byDate.keys()].sort((left, right) => left.localeCompare(right));
    const sections: CardSection[] = dates.map((dueDate) => {
      const rows = byDate
        .get(dueDate)!
        .map((issue) => ({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
          trailing: "",
          projectName: issue.project?.name ?? "",
        }))
        .sort((left, right) => left.identifier.localeCompare(right.identifier));
      return { title: `${shortDay(dueDate)} · ${rows.length}`, rows };
    });

    const earliest = shortMonthYear(dates[0]);
    const latest = shortMonthYear(dates[dates.length - 1]);
    return {
      title: "Later",
      subtitle: earliest === latest ? earliest : `${earliest} – ${latest}`,
      sections,
    };
  },
});
