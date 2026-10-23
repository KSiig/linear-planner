import { useState } from "react";
import type { PlannerQuery } from "../../plannerQuery";
import { emptyPlannerQuery } from "../../plannerQuery";
import type { SavedView, SavedViewMode } from "../../savedViews";
import { createSavedView } from "../../savedViews";
import { getAccessToken } from "../../auth";
import type { FilterOption } from "./FilterMenu";
import { isEmptyQuery, savedViewErrorMessage, showSaveView } from "./plannerViewState";

const chipStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
} as const;

export function FilterChips({
  query,
  mode,
  activeView,
  projects,
  assignees,
  milestones,
  onChange,
  onCreated,
}: {
  query: PlannerQuery;
  mode: SavedViewMode;
  activeView: SavedView | null;
  projects: FilterOption[];
  assignees: FilterOption[];
  milestones: FilterOption[];
  onChange: (query: PlannerQuery) => void;
  onCreated: (view: SavedView) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chips = chipsFor(query, projects, assignees, milestones);
  const saveVisible = showSaveView(activeView, query, mode);
  if (chips.length === 0 && activeView == null && !saveVisible) return null;

  async function create(nextName: string) {
    const trimmed = nextName.trim();
    if (trimmed === "") return;
    try {
      const token = await getAccessToken();
      const view = await createSavedView(fetch, token, { name: trimmed, query, mode });
      setNaming(false);
      setName("");
      setError(null);
      onCreated(view);
    } catch (err) {
      setError(savedViewErrorMessage(err));
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 16px", background: "var(--bg)", color: "var(--text)" }}>
      {activeView && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text)", fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </svg>
          {activeView.name}
        </span>
      )}
      {chips.map((chip) => (
        <button key={chip.key} type="button" aria-label={chip.label} onClick={() => onChange(chip.next)} style={chipStyle}>
          {chip.label}
        </button>
      ))}
      {!isEmptyQuery(query) && (
        <button type="button" onClick={() => onChange(emptyPlannerQuery())} style={{ ...chipStyle, color: "var(--text-muted)" }}>
          Reset filters
        </button>
      )}
      {saveVisible && !naming && (
        <button type="button" onClick={() => setNaming(true)} style={{ ...chipStyle, background: "var(--accent)", color: "var(--accent-text)", borderColor: "var(--accent)" }}>
          Save view
        </button>
      )}
      {saveVisible && naming && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create(name);
          }}
        >
          <input
            placeholder="View name"
            aria-label="View name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </form>
      )}
      {error && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{error}</span>}
    </div>
  );
}

function labelFor(id: string, options: FilterOption[]): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

const DUE_LABELS: Record<string, string> = {
  overdue: "Overdue",
  next: "Next",
  soon: "Soon",
  later: "Later",
  none: "No date",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
  0: "No priority",
};

function chipsFor(query: PlannerQuery, projects: FilterOption[], assignees: FilterOption[], milestones: FilterOption[]) {
  const chips: Array<{ key: string; label: string; next: PlannerQuery }> = [];
  for (const id of query.projectIds) {
    const label = `Project ${labelFor(id, projects)}`;
    chips.push({ key: `project:${id}`, label, next: { ...query, projectIds: query.projectIds.filter((item) => item !== id) } });
  }
  for (const id of query.stateTypes) {
    chips.push({ key: `status:${id}`, label: `Status ${id}`, next: { ...query, stateTypes: query.stateTypes.filter((item) => item !== id) } });
  }
  for (const id of query.assigneeIds) {
    const name = id === "unassigned" ? "Unassigned" : labelFor(id, assignees);
    chips.push({ key: `assignee:${id}`, label: `Assignee ${name}`, next: { ...query, assigneeIds: query.assigneeIds.filter((item) => item !== id) } });
  }
  for (const priority of query.priorities) {
    chips.push({
      key: `priority:${priority}`,
      label: `Priority ${PRIORITY_LABELS[priority] ?? String(priority)}`,
      next: { ...query, priorities: query.priorities.filter((item) => item !== priority) },
    });
  }
  for (const name of query.labelNames) {
    chips.push({ key: `label:${name}`, label: `Label ${name}`, next: { ...query, labelNames: query.labelNames.filter((item) => item !== name) } });
  }
  for (const id of query.milestoneIds) {
    chips.push({
      key: `milestone:${id}`,
      label: `Milestone ${labelFor(id, milestones)}`,
      next: { ...query, milestoneIds: query.milestoneIds.filter((item) => item !== id) },
    });
  }
  if (query.dueWindow != null) {
    chips.push({ key: "due", label: `Due ${DUE_LABELS[query.dueWindow]}`, next: { ...query, dueWindow: null } });
  }
  return chips;
}
