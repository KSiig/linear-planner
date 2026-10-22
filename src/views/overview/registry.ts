import type { CardModule } from "./cards/shell/contract";
import { nextCard } from "./cards/next";
import { overdueCard } from "./cards/overdue";

export const overviewCardOrder = ["overdue", "next", "soon", "no-date", "later"] as const;

export const overviewCards: CardModule[] = [overdueCard, nextCard].sort(
  (a, b) =>
    overviewCardOrder.indexOf(a.id as (typeof overviewCardOrder)[number]) -
    overviewCardOrder.indexOf(b.id as (typeof overviewCardOrder)[number]),
);
