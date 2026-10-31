import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LinearWorkflowState } from "./linear";
import { StatusCircle } from "./StatusCircle";
import { getStateProgress, sortStates } from "./workflowState";
import { headerInputStyle } from "./appStyles";

export interface StatusSelectProps {
  /** The workflow states the user can choose from. */
  states: readonly LinearWorkflowState[];
  /** The started states of the same workflow, used for the status progress. */
  startedStates?: readonly LinearWorkflowState[];
  /** Id of the selected workflow state. */
  value: string;
  /** Called with the selected state id and the complete selected state. */
  onChange: (id: string, state: LinearWorkflowState) => void;
  disabled?: boolean;
  /** Accessible label for the control, for example `Status`. */
  label?: string;
}

/** A keyboard-accessible workflow-state listbox. */
export function StatusSelect({
  states,
  startedStates = [],
  value,
  onChange,
  disabled = false,
  label,
}: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const triggerId = `${id}-trigger`;
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const orderedStates = useMemo(() => sortStates([...states]), [states]);
  const selectedIndex = orderedStates.findIndex((state) => state.id === value);
  const selected = selectedIndex >= 0 ? orderedStates[selectedIndex] : null;
  const safeActiveIndex = orderedStates.length === 0
    ? -1
    : Math.min(Math.max(activeIndex, 0), orderedStates.length - 1);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function openList(index: number) {
    if (orderedStates.length === 0) return;
    setActiveIndex(index);
    setOpen(true);
  }

  function selectState(state: LinearWorkflowState) {
    onChange(state.id, state);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = open ? Math.min(safeActiveIndex + 1, orderedStates.length - 1) : Math.max(selectedIndex, 0);
      if (!open) openList(next);
      else setActiveIndex(next);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = open ? Math.max(safeActiveIndex - 1, 0) : Math.max(selectedIndex, orderedStates.length - 1);
      if (!open) openList(next);
      else setActiveIndex(next);
      return;
    }

    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(orderedStates.length - 1);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && orderedStates.length > 0) {
      event.preventDefault();
      if (!open) {
        openList(Math.max(selectedIndex, 0));
        return;
      }
      const state = orderedStates[safeActiveIndex];
      if (state) selectState(state);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && safeActiveIndex >= 0 ? optionId(safeActiveIndex) : undefined}
        aria-label={label ? `${label}: ${selected?.name ?? value}` : undefined}
        disabled={disabled || orderedStates.length === 0}
        onClick={() => {
          if (open) setOpen(false);
          else openList(Math.max(selectedIndex, 0));
        }}
        onKeyDown={handleTriggerKeyDown}
        style={{
          ...headerInputStyle,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          background: "var(--bg)",
          minWidth: 120,
        }}
      >
        {selected && (
          <span aria-hidden="true">
            <StatusCircle
              stateType={selected.type}
              color={selected.color}
              progress={getStateProgress(selected, startedStates)}
              size={12}
            />
          </span>
        )}
        <span style={{ flex: 1, textAlign: "left" }}>{selected?.name ?? value}</span>
        <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 2,
            zIndex: 100,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            minWidth: "100%",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {orderedStates.map((state, index) => (
            <div
              key={state.id}
              id={optionId(index)}
              role="option"
              aria-selected={state.id === value}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectState(state)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "6px 10px",
                background: index === safeActiveIndex || state.id === value ? "var(--surface-hover)" : "transparent",
                color: "var(--text)",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span aria-hidden="true">
                <StatusCircle
                  stateType={state.type}
                  color={state.color}
                  progress={getStateProgress(state, startedStates)}
                  size={12}
                />
              </span>
              {state.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
