import { useEffect, useMemo, useState } from "react";
import { localToday } from "./calendar";
import { CardShell } from "./cards/shell";
import type { CardContext, CardModel, CardModule, OverviewIssue } from "./cards/shell/contract";
import { overviewCards } from "./registry";

/** How often the Overview checks whether the local day has turned over. */
const DAY_CHECK_MS = 60 * 1000;

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
  const [today, setToday] = useState(() => localToday(new Date()));

  // The due windows count from the local day, so the Overview follows the
  // clock: after midnight the cards group the issues by the new day.
  useEffect(() => {
    const check = () => {
      const day = localToday(new Date());
      setToday((current) => (current === day ? current : day));
    };
    const timer = setInterval(check, DAY_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  const ctx = useMemo(() => ({ today, issues }), [today, issues]);

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
