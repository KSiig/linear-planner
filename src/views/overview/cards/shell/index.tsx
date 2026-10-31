import { useState } from "react";
import type { CardModel, CardModule, CardSection } from "./contract";
import { issueAccessibleName, issueQuickLookLink, useIssueQuickLookSurface } from "../../../../issueQuickLookContext";
import { ISSUE_TOUCH_CLASS, useIssueLongPressController } from "../../../../issueInteraction";
import "./index.css";

function rowCount(model: CardModel): number {
  return model.sections.reduce((total, section) => total + section.rows.length, 0);
}

function visibleSections(sections: CardSection[], limit: number | null): CardSection[] {
  if (limit === null) return sections;
  let remaining = limit;
  const shown: CardSection[] = [];
  for (const section of sections) {
    if (remaining <= 0) break;
    const rows = section.rows.slice(0, remaining);
    remaining -= rows.length;
    if (rows.length > 0) shown.push({ title: section.title, rows });
  }
  return shown;
}

export function CardShell({ card, model }: { card: CardModule; model: CardModel | null }) {
  const [expanded, setExpanded] = useState(false);
  const surface = useIssueQuickLookSurface();
  const longPress = useIssueLongPressController();
  if (model === null) return null;

  const appearance = card.appearance ?? {};
  const collapseAfter = appearance.collapseAfter ?? 4;
  const total = rowCount(model);
  const collapsed = total > collapseAfter && !expanded;
  const sections = visibleSections(model.sections, collapsed ? collapseAfter : null);
  const hidden = Math.max(0, total - collapseAfter);
  const accent = appearance.accent;
  const style = {
    border: "1px solid var(--border)",
    borderRadius: "var(--overview-card-radius, 12px)",
    background: "var(--surface)",
    ...(appearance.radius === undefined ? {} : { ["--overview-card-radius" as string]: `${appearance.radius}px` }),
    ...(accent === undefined ? {} : { borderInlineStart: `3px solid ${accent}` }),
  };

  return (
    <section className="overview-card" style={style}>
      {card.renderHeader ? card.renderHeader(model) : (
        <header className="overview-card-header">
          <h2 className={appearance.muted ? "is-muted" : undefined}>{model.title}</h2>
          <span className="overview-card-count" style={accent === undefined ? undefined : { color: accent }}>{total}</span>
          {model.subtitle ? <span className="overview-card-subtitle">{model.subtitle}</span> : null}
        </header>
      )}
      <div className={appearance.scroll === "body" && expanded ? "overview-card-body is-capped" : "overview-card-body"}>
        {card.renderBody ? card.renderBody(model) : sections.map((section, index) => (
          <div key={section.title ?? index}>
            {section.title ? <div className="overview-card-section-title">{section.title}</div> : null}
            {section.rows.map((row) => {
              // The row carries a narrow issue, so the full issue is looked up in
              // the project's issues to name the row with its status.
              const issue = surface?.issueById(row.id);
              const link = issueQuickLookLink(surface, {
                id: row.id,
                url: row.url,
                name: issue
                  ? issueAccessibleName(issue.identifier, issue.title, issue.state.name)
                  : `${row.identifier} ${row.title}`,
              });
              const press = longPress.bind({ url: link.href, onClick: link.onClick });
              return (
                <a
                  key={row.id}
                  {...link}
                  {...press}
                  className={`overview-card-row ${ISSUE_TOUCH_CLASS}`}
                >
                  <span className="overview-card-id">{row.identifier}</span>
                  <span className="overview-card-title">{row.title}</span>
                  <span className="overview-card-project">{row.projectName}</span>
                  <span className="overview-card-trailing">{row.trailing}</span>
                </a>
              );
            })}
          </div>
        ))}
        {total > collapseAfter ? (
          <button type="button" className="overview-card-more" onClick={() => setExpanded((value) => !value)}>
            {hidden} more
          </button>
        ) : null}
      </div>
    </section>
  );
}
