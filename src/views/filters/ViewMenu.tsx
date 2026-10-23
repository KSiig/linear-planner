import { useEffect, useRef, useState } from "react";
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
  width: 280,
  maxWidth: "calc(100vw - 24px)",
  boxSizing: "border-box" as const,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 8,
  color: "var(--text)",
};

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>Views</h2>
            <button
              type="button"
              aria-label="Create view"
              onClick={() => { setNaming(true); setRenameId(null); setName(""); }}
              style={{ ...buttonStyle, padding: "2px 8px", background: "var(--accent)", color: "var(--accent-text)", borderColor: "var(--accent)" }}
            >
              +
            </button>
          </div>
          {error && <p style={{ margin: "0 0 8px", color: "var(--text-muted)", fontSize: 12 }}>{error}</p>}
          {naming && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void create(name);
              }}
              style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}
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
            <div key={view.id} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              {renameId === view.id ? (
                <form
                  style={{ display: "flex", flex: 1, gap: 4, alignItems: "center" }}
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
                <button type="button" onClick={() => onApply(view)} style={{ ...buttonStyle, flex: 1, minWidth: 0, textAlign: "left", background: "transparent" }}>
                  {view.name}
                </button>
              )}
              <button
                type="button"
                aria-label={`Rename ${view.name}`}
                onClick={() => { setRenameId(view.id); setNaming(false); setName(view.name); }}
                style={buttonStyle}
              >
                Rename
              </button>
              <button type="button" aria-label={`Delete ${view.name}`} onClick={() => void remove(view.id)} style={buttonStyle}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
