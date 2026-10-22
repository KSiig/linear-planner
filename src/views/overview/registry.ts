import type { CardModule } from "./cards/shell/contract";
import { overdueCard } from "./cards/overdue";

export const overviewCardOrder = ["overdue", "next", "soon", "no-date", "later"] as const;

export const overviewCards: CardModule[] = [overdueCard].sort(
  (a, b) =>
    overviewCardOrder.indexOf(a.id as (typeof overviewCardOrder)[number]) -
    overviewCardOrder.indexOf(b.id as (typeof overviewCardOrder)[number]),
);
