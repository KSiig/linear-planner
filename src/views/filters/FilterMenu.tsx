import { useEffect, useId, useRef, useState } from "react";
import { DUE_WINDOW_OPTIONS, type DueWindow } from "../../dueWindows";
import type { PlannerQuery } from "../../plannerQuery";

export interface FilterOption {
  id: string;
  label: string;
}

/** A workflow state the Status filter offers. */
export interface StatusOption extends FilterOption {
  /** Linear's internal state type. The legacy filter still uses it. */
  type: string;
}

/** A workflow state and the team that owns it. */
export interface StatusState {
  id: string;
  name: string;
  type: string;
  teamKey: string;
}

const PRIORITIES: FilterOption[] = [
  { id: "1", label: "Urgent" },
  { id: "2", label: "High" },
  { id: "3", label: "Medium" },
  { id: "4", label: "Low" },
  { id: "0", label: "No priority" },
];

const DUE_OPTIONS: Array<{ id: DueWindow | "any"; label: string }> = [
  { id: "any", label: "Any" },
  ...DUE_WINDOW_OPTIONS.map((option) => ({ id: option.id, label: option.label })),
];

type Dimension = "project" | "status" | "assignee" | "priority" | "label" | "milestone" | "due";

const ROWS: Array<{ id: Dimension; label: string }> = [
  { id: "project", label: "Project" },
  { id: "status", label: "Status" },
  { id: "assignee", label: "Assignee" },
  { id: "priority", label: "Priority" },
  { id: "label", label: "Label" },
  { id: "milestone", label: "Milestone" },
  { id: "due", label: "Due" },
];

const buttonStyle = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
  flexShrink: 0,
} as const;

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left" as const,
  padding: "8px 10px",
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};

const panelStyle = {
  position: "absolute" as const,
  right: 0,
  top: "calc(100% + 6px)",
  zIndex: 80,
  width: 280,
  maxWidth: "calc(100vw - 24px)",
  boxSizing: "border-box" as const,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 8,
  color: "var(--text)",
};

function matchesSearch(label: string, search: string): boolean {
  return label.toLowerCase().includes(search.trim().toLowerCase());
}

function toggleValue<T extends string | number>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function FilterMenu({
  query,
  projects,
  statuses,
  assignees,
  labels,
  milestones,
  onChange,
}: {
  query: PlannerQuery;
  projects: FilterOption[];
  statuses: StatusOption[];
  assignees: FilterOption[];
  labels: string[];
  milestones: FilterOption[];
  onChange: (query: PlannerQuery) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const options = optionsFor(dimension, projects, statuses, assignees, labels, milestones);
  const visibleRows = ROWS.filter((row) => matchesSearch(row.label, search));
  const visibleOptions = options.filter((option) => matchesSearch(option.label, search));

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button type="button" aria-label="Filters" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={buttonStyle}>
        Filters
      </button>
      {open && (
        <div style={panelStyle}>
          <input
            id={searchId}
            placeholder="Search filters..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 8,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
          <h2 style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", padding: "4px 10px", margin: 0 }}>Filters</h2>
          {dimension == null ? (
            visibleRows.map((row) => {
              const summary = valueSummary(row.id, query, projects, statuses, assignees, labels, milestones);
              return (
                <button key={row.id} type="button" aria-label={row.label} onClick={() => { setDimension(row.id); setSearch(""); }} style={rowStyle}>
                  <RowIcon dimension={row.id} />
                  <span>{row.label}</span>
                  <span style={{ flex: 1 }} />
                  {summary !== "" && <span style={{ color: "var(--text-muted)" }}>{summary}</span>}
                  <Chevron direction="right" />
                </button>
              );
            })
          ) : (
            <>
              <button type="button" onClick={() => { setDimension(null); setSearch(""); }} style={{ ...rowStyle, color: "var(--text-muted)" }}>
                <Chevron direction="left" />
                <span>{ROWS.find((row) => row.id === dimension)?.label}</span>
              </button>
              {visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isSelected(dimension, option.id, query)}
                  onClick={() => onChange(selectOption(dimension, option.id, query))}
                  style={{
                    ...rowStyle,
                    background: isSelected(dimension, option.id, query) ? "var(--accent)" : "transparent",
                    color: isSelected(dimension, option.id, query) ? "var(--accent-text)" : "var(--text)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function iconProps() {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { flexShrink: 0, color: "var(--text-muted)" },
  };
}

function RowIcon({ dimension }: { dimension: Dimension }) {
  if (dimension === "due") {
    return (
      <svg aria-hidden="true" {...iconProps()}>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4" />
        <path d="M3 10h18" />
        <path d="M8 2v4" />
        <path d="M17 14h-6" />
        <path d="M13 18H7" />
        <path d="M7 14h.01" />
        <path d="M17 18h.01" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" {...iconProps()}>
      <path d="M13 5h8" />
      <path d="M13 12h8" />
      <path d="M13 19h8" />
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" {...iconProps()}>
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function selectedIds(dimension: Dimension, query: PlannerQuery): string[] {
  if (dimension === "project") return query.projectIds;
  if (dimension === "status") return query.stateIds ?? [];
  if (dimension === "assignee") return query.assigneeIds;
  if (dimension === "priority") return query.priorities.map(String);
  if (dimension === "label") return query.labelNames;
  if (dimension === "milestone") return query.milestoneIds;
  return [];
}

function valueSummary(
  dimension: Dimension,
  query: PlannerQuery,
  projects: FilterOption[],
  statuses: StatusOption[],
  assignees: FilterOption[],
  labels: string[],
  milestones: FilterOption[],
): string {
  if (dimension === "due") {
    const match = DUE_OPTIONS.find((option) => option.id === query.dueWindow);
    return match ? match.label : "";
  }
  const ids = selectedIds(dimension, query);
  if (ids.length === 0) return "";
  if (ids.length > 1) return `${ids.length} selected`;
  const options = optionsFor(dimension, projects, statuses, assignees, labels, milestones);
  return options.find((option) => option.id === ids[0])?.label ?? "";
}

function optionsFor(
  dimension: Dimension | null,
  projects: FilterOption[],
  statuses: StatusOption[],
  assignees: FilterOption[],
  labels: string[],
  milestones: FilterOption[],
): FilterOption[] {
  if (dimension === "project") return projects;
  if (dimension === "status") return statuses;
  if (dimension === "assignee") return [{ id: "unassigned", label: "Unassigned" }, ...assignees];
  if (dimension === "priority") return PRIORITIES;
  if (dimension === "label") return labels.map((label) => ({ id: label, label }));
  if (dimension === "milestone") return milestones;
  if (dimension === "due") return DUE_OPTIONS.map((option) => ({ id: option.id, label: option.label }));
  return [];
}

function isSelected(dimension: Dimension, id: string, query: PlannerQuery): boolean {
  if (dimension === "project") return query.projectIds.includes(id);
  if (dimension === "status") return (query.stateIds ?? []).includes(id);
  if (dimension === "assignee") return query.assigneeIds.includes(id);
  if (dimension === "priority") return query.priorities.includes(Number(id));
  if (dimension === "label") return query.labelNames.includes(id);
  if (dimension === "milestone") return query.milestoneIds.includes(id);
  if (dimension === "due") return id === "any" ? query.dueWindow == null : query.dueWindow === id;
  return false;
}

function selectOption(dimension: Dimension, id: string, query: PlannerQuery): PlannerQuery {
  if (dimension === "project") return { ...query, projectIds: toggleValue(query.projectIds, id) };
  if (dimension === "status") return { ...query, stateIds: toggleValue(query.stateIds ?? [], id) };
  if (dimension === "assignee") return { ...query, assigneeIds: toggleValue(query.assigneeIds, id) };
  if (dimension === "priority") return { ...query, priorities: toggleValue(query.priorities, Number(id)) };
  if (dimension === "label") return { ...query, labelNames: toggleValue(query.labelNames, id) };
  if (dimension === "milestone") return { ...query, milestoneIds: toggleValue(query.milestoneIds, id) };
  if (dimension === "due") return { ...query, dueWindow: id === "any" ? null : (id as DueWindow) };
  return query;
}
