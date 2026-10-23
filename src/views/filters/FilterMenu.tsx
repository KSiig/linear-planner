import { useEffect, useId, useRef, useState } from "react";
import type { DueWindow, PlannerQuery } from "../../plannerQuery";

export interface FilterOption {
  id: string;
  label: string;
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
  { id: "overdue", label: "Overdue" },
  { id: "next", label: "Next" },
  { id: "soon", label: "Soon" },
  { id: "later", label: "Later" },
  { id: "none", label: "No date" },
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
  statuses: string[];
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
          {dimension == null ? (
            visibleRows.map((row) => (
              <button key={row.id} type="button" onClick={() => { setDimension(row.id); setSearch(""); }} style={rowStyle}>
                {row.label}
              </button>
            ))
          ) : (
            <>
              <button type="button" onClick={() => { setDimension(null); setSearch(""); }} style={{ ...rowStyle, color: "var(--text-muted)" }}>
                {ROWS.find((row) => row.id === dimension)?.label}
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

function optionsFor(
  dimension: Dimension | null,
  projects: FilterOption[],
  statuses: string[],
  assignees: FilterOption[],
  labels: string[],
  milestones: FilterOption[],
): FilterOption[] {
  if (dimension === "project") return projects;
  if (dimension === "status") return statuses.map((status) => ({ id: status, label: status }));
  if (dimension === "assignee") return [{ id: "unassigned", label: "Unassigned" }, ...assignees];
  if (dimension === "priority") return PRIORITIES;
  if (dimension === "label") return labels.map((label) => ({ id: label, label }));
  if (dimension === "milestone") return milestones;
  if (dimension === "due") return DUE_OPTIONS.map((option) => ({ id: option.id, label: option.label }));
  return [];
}

function isSelected(dimension: Dimension, id: string, query: PlannerQuery): boolean {
  if (dimension === "project") return query.projectIds.includes(id);
  if (dimension === "status") return query.stateTypes.includes(id);
  if (dimension === "assignee") return query.assigneeIds.includes(id);
  if (dimension === "priority") return query.priorities.includes(Number(id));
  if (dimension === "label") return query.labelNames.includes(id);
  if (dimension === "milestone") return query.milestoneIds.includes(id);
  if (dimension === "due") return id === "any" ? query.dueWindow == null : query.dueWindow === id;
  return false;
}

function selectOption(dimension: Dimension, id: string, query: PlannerQuery): PlannerQuery {
  if (dimension === "project") return { ...query, projectIds: toggleValue(query.projectIds, id) };
  if (dimension === "status") return { ...query, stateTypes: toggleValue(query.stateTypes, id) };
  if (dimension === "assignee") return { ...query, assigneeIds: toggleValue(query.assigneeIds, id) };
  if (dimension === "priority") return { ...query, priorities: toggleValue(query.priorities, Number(id)) };
  if (dimension === "label") return { ...query, labelNames: toggleValue(query.labelNames, id) };
  if (dimension === "milestone") return { ...query, milestoneIds: toggleValue(query.milestoneIds, id) };
  if (dimension === "due") return { ...query, dueWindow: id === "any" ? null : (id as DueWindow) };
  return query;
}
