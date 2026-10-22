import type { CardModule } from "./cards/shell/contract";

export const overviewCardOrder = ["overdue", "next", "soon", "no-date", "later"] as const;

export const overviewCards: CardModule[] = [];
