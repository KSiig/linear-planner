import { useEffect, useMemo, useState } from "react";
import { localToday } from "./calendar";
import { CardShell } from "./cards/shell";
import type { CardContext, CardModel, CardModule, OverviewIssue } from "./cards/shell/contract";
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

export function Overview({ issues }: { issues: OverviewIssue[] }) {
  const ctx = useMemo(() => ({ today: localToday(new Date()), issues }), [issues]);

  return (
    <div
      role="region"
      aria-label="Overview"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxWidth: 720,
        width: "100%",
        marginInline: "auto",
        overflowX: "hidden",
      }}
    >
      {overviewCards.map((card) => (
        <OverviewCard key={card.id} card={card} ctx={ctx} />
      ))}
    </div>
  );
}
