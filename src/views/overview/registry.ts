import type { CardModule } from "./cards/shell/contract";
import { blockedCard } from "./cards/blocked";
import { laterCard } from "./cards/later";
import { nextCard } from "./cards/next";
import { noDateCard } from "./cards/no-date";
import { overdueCard } from "./cards/overdue";
import { recentlyCompletedCard } from "./cards/recently-completed";
import { recentlyUpdatedCard } from "./cards/recently-updated";
import { soonCard } from "./cards/soon";

// The order the Overview stack shows the cards in. The first five cards are the
// due-date cards. The last three are the fact-based activity cards: blocked
// work, then recent updates, then recent completions.
export const overviewCardOrder = [
  "overdue",
  "next",
  "soon",
  "no-date",
  "later",
  "blocked",
  "recently-updated",
  "recently-completed",
] as const;

export const overviewCards: CardModule[] = [
  overdueCard,
  nextCard,
  soonCard,
  noDateCard,
  laterCard,
  blockedCard,
  recentlyUpdatedCard,
  recentlyCompletedCard,
].sort(
  (a, b) =>
    overviewCardOrder.indexOf(a.id as (typeof overviewCardOrder)[number]) -
    overviewCardOrder.indexOf(b.id as (typeof overviewCardOrder)[number]),
);
