import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlannerQuery } from "../../plannerQuery";
import type { SavedView, SavedViewMode } from "../../savedViews";
import { createSavedView, deleteSavedView, loadSavedViews, renameSavedView } from "../../savedViews";
import { getAccessToken } from "../../auth";
import { savedViewErrorMessage } from "./plannerViewState";

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

const panelStyle = {
  position: "absolute" as const,
  right: 0,
  top: "calc(100% + 6px)",
  zIndex: 80,
  width: 256,
  maxWidth: "100vw",
  boxSizing: "border-box" as const,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
};

const iconButtonStyle = {
  width: 24,
  height: 24,
  padding: 0,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
} as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Icon>
  );
}

function PencilIcon() {
  return (
    <Icon>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

export function ViewMenu({
  query,
  mode,
  onApply,
  onCreated,
  onRenamed,
  onDeleted,
}: {
  query: PlannerQuery;
  mode: SavedViewMode;
  onApply: (view: SavedView) => void;
  onCreated: (view: SavedView) => void;
  onRenamed: (view: SavedView) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const token = await getAccessToken();
        const next = await loadSavedViews(fetch, token);
        if (!cancelled) setViews(next);
      } catch (err) {
        if (!cancelled) setError(savedViewErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  async function create(nextName: string) {
    const trimmed = nextName.trim();
    if (trimmed === "") return;
    try {
      const token = await getAccessToken();
      const view = await createSavedView(fetch, token, { name: trimmed, query, mode });
      setViews((current) => [...current, view]);
      setNaming(false);
      setName("");
      setError(null);
      onCreated(view);
    } catch (err) {
      setError(savedViewErrorMessage(err));
    }
  }

  async function rename(id: string, nextName: string) {
    const trimmed = nextName.trim();
    if (trimmed === "") return;
    try {
      const token = await getAccessToken();
      const view = await renameSavedView(fetch, token, id, trimmed);
      setViews((current) => current.map((item) => (item.id === id ? view : item)));
      setRenameId(null);
      setName("");
      setError(null);
      onRenamed(view);
    } catch (err) {
      setError(savedViewErrorMessage(err));
    }
  }

  async function remove(id: string) {
    try {
      const token = await getAccessToken();
      await deleteSavedView(fetch, token, id);
      setViews((current) => current.filter((item) => item.id !== id));
      onDeleted(id);
      setError(null);
    } catch (err) {
      setError(savedViewErrorMessage(err));
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button type="button" aria-label="Views" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={buttonStyle}>
        Views
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 6px 8px 12px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>Views</span>
            <button
              type="button"
              aria-label="Save current as view"
              onClick={() => { setNaming(true); setRenameId(null); setName(""); }}
              style={iconButtonStyle}
            >
              <PlusIcon />
            </button>
          </div>
          <div style={{ padding: 4 }}>
            {error && <p style={{ margin: "0 0 8px", color: "var(--text-muted)", fontSize: 12 }}>{error}</p>}
            {naming && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void create(name);
                }}
                style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8, padding: "6px 8px" }}
              >
                <input
                  placeholder="View name"
                  aria-label="View name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setNaming(false);
                      setName("");
                    }
                  }}
                  style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
                <button type="button" onClick={() => { setNaming(false); setName(""); }} style={buttonStyle}>Cancel</button>
                <button type="button" aria-label="Save view" disabled={name.trim() === ""} onClick={() => void create(name)} style={buttonStyle}>Save</button>
              </form>
            )}
            {views.map((view) => (
              <div
                key={view.id}
                style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, padding: "0 8px", borderRadius: 6 }}
                onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg)"; }}
                onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
              >
                {renameId === view.id ? (
                  <form
                    style={{ display: "flex", flex: 1, gap: 4, alignItems: "center", padding: "6px 0" }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename(view.id, name);
                    }}
                  >
                    <input
                      aria-label="View name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setRenameId(null);
                          setName("");
                        }
                      }}
                      style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                    />
                    <button type="button" onClick={() => { setRenameId(null); setName(""); }} style={buttonStyle}>Cancel</button>
                    <button type="button" aria-label="Save name" disabled={name.trim() === ""} onClick={() => void rename(view.id, name)} style={buttonStyle}>Save</button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onApply(view)}
                    style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "12px 0", border: "none", background: "transparent", color: "var(--text)", fontSize: 14, cursor: "pointer" }}
                  >
                    {view.name}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Rename ${view.name}`}
                  onClick={() => { setRenameId(view.id); setNaming(false); setName(view.name); }}
                  style={iconButtonStyle}
                >
                  <PencilIcon />
                </button>
                <button type="button" aria-label={`Delete ${view.name}`} onClick={() => void remove(view.id)} style={iconButtonStyle}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
