import type { CardModule } from "./cards/shell/contract";
import { nextCard } from "./cards/next";
import { noDateCard } from "./cards/no-date";
import { overdueCard } from "./cards/overdue";
import { soonCard } from "./cards/soon";

export const overviewCardOrder = ["overdue", "next", "soon", "no-date", "later"] as const;

export const overviewCards: CardModule[] = [overdueCard, nextCard, soonCard, noDateCard].sort(
  (a, b) =>
    overviewCardOrder.indexOf(a.id as (typeof overviewCardOrder)[number]) -
    overviewCardOrder.indexOf(b.id as (typeof overviewCardOrder)[number]),
);
