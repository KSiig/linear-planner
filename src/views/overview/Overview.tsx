import { useEffect, useState } from "react";
import { fetchProjectIssues, fetchProjectTeamIds, fetchTeamIssues, isPlannableIssue } from "../../linear";
import type { OverviewCardIssue } from "../../linear";
import { localToday } from "./calendar";
import { CardShell } from "./cards/shell";
import type { CardContext, CardModel, CardModule } from "./cards/shell/contract";
import { overviewCards } from "./registry";

function OverviewCard({ card, ctx }: { card: CardModule; ctx: CardContext }) {
  const [model, setModel] = useState<CardModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    card.load(ctx).then((next) => {
      if (!cancelled) setModel(next);
    });
    return () => {
      cancelled = true;
    };
  }, [card, ctx]);

  if (model === null) return null;
  return <CardShell card={card} model={model} />;
}

export function Overview({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [ctx, setCtx] = useState<CardContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCtx(null);

    (async () => {
      const teamIds = await fetchProjectTeamIds(projectId);
      const issues: OverviewCardIssue[] = [];
      if (teamIds.length === 0) {
        const projectIssues = await fetchProjectIssues(projectId);
        for (const issue of projectIssues) {
          issues.push({
            ...issue,
            updatedAt: "",
            state: { name: issue.state.name, type: issue.state.type },
            project: { id: projectId, name: projectName },
          });
        }
      } else {
        const seen = new Set<string>();
        for (const teamId of teamIds) {
          const nodes = await fetchTeamIssues(teamId);
          for (const issue of nodes) {
            if (seen.has(issue.id) || !isPlannableIssue(issue)) continue;
            seen.add(issue.id);
            issues.push(issue);
          }
        }
      }
      if (!cancelled) {
        setCtx({ today: localToday(new Date()), issues });
      }
    })().catch(() => {
      if (!cancelled) setError("Failed to fetch issues");
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, projectName]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 64, color: "#ef4444", fontSize: 14 }}>
        {error}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Overview"
      style={{
        display: "flex",
        flexDirection: "column",
        maxWidth: 720,
        width: "100%",
        marginInline: "auto",
        overflowX: "hidden",
      }}
    >
      {ctx ? overviewCards.map((card) => <OverviewCard key={card.id} card={card} ctx={ctx} />) : null}
    </div>
  );
}
