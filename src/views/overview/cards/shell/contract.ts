import type { ReactNode } from "react";
import type { IssueQuickLookData } from "../../../../issueQuickLookModel";

/**
 * The canonical issue facts shown by Overview.
 *
 * Overview uses the same issue model as every other issue surface. It does
 * not define a second issue shape or rename any canonical fields.
 */
export type OverviewIssue = IssueQuickLookData;

export interface CardContext {
  today: string;
  issues: OverviewIssue[];
}

export interface CardRow {
  id: string;
  identifier: string;
  title: string;
  url: string;
  trailing: string;
  projectName: string;
}

export interface CardSection {
  title?: string;
  rows: CardRow[];
}

export interface CardModel {
  title: string;
  subtitle?: string;
  sections: CardSection[];
}

export interface CardAppearance {
  accent?: string;
  radius?: number;
  muted?: boolean;
  collapseAfter?: number;
  scroll?: "page" | "body";
}

export interface CardModule {
  id: string;
  appearance?: CardAppearance;
  load(ctx: CardContext): Promise<CardModel | null>;
  renderHeader?(model: CardModel): ReactNode;
  renderBody?(model: CardModel): ReactNode;
}

export function defineCard(card: CardModule): CardModule {
  return {
    ...card,
    appearance: {
      collapseAfter: 4,
      scroll: "page",
      muted: false,
      ...card.appearance,
    },
  };
}
