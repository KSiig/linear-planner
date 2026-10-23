import { useState, useCallback, useEffect, useRef, useMemo, type CSSProperties } from "react";
import { fetchProjects, fetchProjectCycles, fetchProjectMilestones, fetchProjectWorkflowStates, fetchIssueStateHistory, endDateFromTransitions, createBlockingRelation, deleteIssueRelation, addBlocksRelation, removeRelation } from "./linear";
import type { LinearProject, LinearIssue, LinearCycle, LinearMilestone, LinearWorkflowState, StateTransition, AssignedInterval, NoCountRange } from "./linear";
import { startLogin, handleOAuthCallback, getCallbackPath, isAuthenticated, clearTokens, logout, isWriteEnabled, setWriteEnabled, isAutoRefreshEnabled, setAutoRefreshEnabled } from "./auth";
import { scheduleIssues, buildIsDone } from "./scheduler";
import type { ScheduleResult } from "./scheduler";
import { GanttChart } from "./GanttChart";
import { DependencyTree } from "./DependencyTree";
import { BASE_PATH, getProjectIdFromUrl, navigateToProject } from "./routing";
import { loadProjectSettings, saveProjectSettings, LEGACY_STORAGE_KEY, type Mode } from "./projectSettings";
import { computeEffectiveEndStatus, sortStates } from "./workflowState";
import { StatusSelect } from "./StatusSelect";
import { GlobalStatus } from "./GlobalStatus";
import { centerCard, tabButtonStyle, stepperButtonStyle, buttonStyle } from "./appStyles";
import { useNarrowLayout } from "./useNarrowLayout";
import { Overview } from "./views/overview/Overview";
import { localToday } from "./views/overview/calendar";
import type { OverviewIssue } from "./views/overview/cards/shell/contract";
import { fetchScopedById, fetchScopedIssues, filterMatchingIssues, projectIdsToLoad, toOverviewIssue } from "./applyPlannerQuery";
import type { PlannerQuery } from "./plannerQuery";
import { loadActiveViewId, loadPlannerQuery, readSavedViewMode, saveActiveViewId, savePlannerQuery, type SavedView } from "./savedViews";
import { FilterMenu } from "./views/filters/FilterMenu";
import { FilterChips } from "./views/filters/FilterChips";
import { ViewMenu } from "./views/filters/ViewMenu";

const modeSettingStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", cursor: "pointer" };

function SettingsButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Settings"
      aria-label="Settings"
      style={{ ...buttonStyle, background: open ? "var(--surface-hover)" : "transparent", color: "var(--text-muted)", padding: "4px 8px", display: "flex", alignItems: "center" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        padding: "6px 12px",
        minHeight: 32,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: pressed ? "var(--accent)" : "transparent",
        color: pressed ? "var(--accent-text)" : "var(--text-muted)",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Don't auto-refresh if the data was already refreshed within this window.
const AUTO_REFRESH_THROTTLE_MS = 5 * 60 * 1000;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [numWorkers, setNumWorkers] = useState(2);
  const [mode, setMode] = useState<Mode>("workers");
  const [showWeekends, setShowWeekends] = useState(false);
  const [showHolidays, setShowHolidays] = useState(true);
  const [showCooldown, setShowCooldown] = useState(true);
  const [showCapacityForecast, setShowCapacityForecast] = useState(false);
  const [drawCrossMilestoneDeps, setDrawCrossMilestoneDeps] = useState(false);
  const [includeDoneIssuesTree, setIncludeDoneIssuesTree] = useState(true);
  const [includeDoneIssuesTreeGlobal, setIncludeDoneIssuesTreeGlobal] = useState(true);
  const [startStatusName, setStartStatusName] = useState("");
  const [endStatusName, setEndStatusName] = useState("");
  const [doneEndDates, setDoneEndDates] = useState<Map<string, string>>(new Map());
  const [stateHistoryByIssue, setStateHistoryByIssue] = useState<Map<string, StateTransition[]>>(new Map());
  const [assignedIntervalsByIssue, setAssignedIntervalsByIssue] = useState<Map<string, AssignedInterval[]>>(new Map());
  const [noCountByIssue, setNoCountByIssue] = useState<Map<string, NoCountRange[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [writeEnabled, setWriteEnabledState] = useState(isWriteEnabled());
  const [autoRefresh, setAutoRefreshState] = useState(isAutoRefreshEnabled());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [projectIssues, setProjectIssues] = useState<LinearIssue[]>([]);
  const [overviewIssues, setOverviewIssues] = useState<OverviewIssue[]>([]);
  const [plannerQuery, setPlannerQuery] = useState(loadPlannerQuery);
  const [activeViewId, setActiveViewId] = useState<string | null>(() => loadActiveViewId());
  const [activeView, setActiveView] = useState<SavedView | null>(null);
  const [projectCycles, setProjectCycles] = useState<LinearCycle[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<LinearMilestone[]>([]);
  const [workflowStates, setWorkflowStates] = useState<LinearWorkflowState[]>([]);
  const [chartStart, setChartStart] = useState<Date>(new Date());

  const endStatusNameRef = useRef(endStatusName);
  endStatusNameRef.current = endStatusName;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const loadGen = useRef(0);

  // Timestamp of the last data load (manual or auto), used to throttle auto-refresh.
  const lastRefreshAtRef = useRef(0);

  // Empty projects have nothing to plan, so they are not offered in the picker. They stay in
  // `projects` though, so an existing /p/<id> URL for one still restores.
  const selectableProjects = useMemo(() => projects.filter((p) => p.hasIssues), [projects]);

  const startedStates = useMemo(
    () => sortStates(workflowStates.filter((s) => s.type === "started")),
    [workflowStates],
  );

  const endStatusCandidates = useMemo(
    () => sortStates(workflowStates.filter((s) => s.type === "started" || s.type === "completed")),
    [workflowStates],
  );

  const effectiveStartStatus = useMemo(() => {
    if (startStatusName && startedStates.some((s) => s.name === startStatusName)) return startStatusName;
    return startedStates.length > 0 ? startedStates[0].name : "";
  }, [startStatusName, startedStates]);

  const effectiveEndStatus = useMemo(
    () => computeEffectiveEndStatus(endStatusName, workflowStates),
    [endStatusName, workflowStates],
  );

  const maxParallelism = useMemo(() => {
    if (projectIssues.length === 0) return 1;
    const unlimited = scheduleIssues(projectIssues, projectIssues.length, chartStart, projectCycles, projectMilestones, workflowStates, effectiveEndStatus, doneEndDates, effectiveStartStatus, stateHistoryByIssue, assignedIntervalsByIssue, noCountByIssue);
    return unlimited.usedWorkers;
  }, [projectIssues, projectCycles, projectMilestones, workflowStates, chartStart, effectiveEndStatus, doneEndDates, effectiveStartStatus, stateHistoryByIssue, assignedIntervalsByIssue, noCountByIssue]);

  const effectiveWorkers = Math.min(numWorkers, maxParallelism);

  const schedule: ScheduleResult | null = useMemo(() => {
    if (projectIssues.length === 0) return null;
    return scheduleIssues(projectIssues, effectiveWorkers, chartStart, projectCycles, projectMilestones, workflowStates, effectiveEndStatus, doneEndDates, effectiveStartStatus, stateHistoryByIssue, assignedIntervalsByIssue, noCountByIssue);
  }, [projectIssues, projectCycles, projectMilestones, workflowStates, effectiveWorkers, chartStart, effectiveEndStatus, doneEndDates, effectiveStartStatus, stateHistoryByIssue, assignedIntervalsByIssue, noCountByIssue]);

  // Restore session on mount (or handle OAuth callback)
  useEffect(() => {
    const callbackPath = getCallbackPath();
    const pathname = window.location.pathname;

    if (pathname === callbackPath || pathname === callbackPath + "/") {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");

      if (code && state) {
        handleOAuthCallback(code, state)
          .then(async () => {
            window.history.replaceState(null, "", BASE_PATH + "/");
            const projs = await fetchProjects();
            if (projs.length === 0) {
              clearTokens();
              setError("No projects found in your Linear workspace.");
              setRestoring(false);
              return;
            }
            setProjects(projs);
            const urlProjectId = getProjectIdFromUrl();
            const match = urlProjectId ? projs.find((p) => p.id === urlProjectId) : null;
            const ps = loadProjectSettings(match ? urlProjectId : null);
            setNumWorkers(ps.numWorkers);
            setMode(ps.mode);
            setDrawCrossMilestoneDeps(ps.drawCrossMilestoneDeps);
            setIncludeDoneIssuesTree(ps.includeDoneIssuesTree);
            setIncludeDoneIssuesTreeGlobal(ps.includeDoneIssuesTreeGlobal);
            setShowWeekends(ps.showWeekends);
            setShowHolidays(ps.showHolidays);
            setShowCooldown(ps.showCooldown);
            setShowCapacityForecast(ps.showCapacityForecast);
            setStartStatusName(ps.startStatusName);
            setEndStatusName(ps.endStatusName);
            setConnected(true);
            setRestoring(false);
          })
          .catch((e) => {
            window.history.replaceState(null, "", BASE_PATH + "/");
            setError(e instanceof Error ? e.message : "OAuth authentication failed");
            setRestoring(false);
          });
        return;
      }

      window.history.replaceState(null, "", BASE_PATH + "/");
    }

    if (!isAuthenticated()) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      setRestoring(false);
      return;
    }

    (async () => {
      try {
        const projs = await fetchProjects();
        if (projs.length === 0) {
          clearTokens();
          setRestoring(false);
          return;
        }
        setProjects(projs);

        const urlProjectId = getProjectIdFromUrl();
        const match = urlProjectId ? projs.find((p) => p.id === urlProjectId) : null;
        const ps = loadProjectSettings(match ? urlProjectId : null);
        setNumWorkers(ps.numWorkers);
        setMode(ps.mode);
        setDrawCrossMilestoneDeps(ps.drawCrossMilestoneDeps);
        setIncludeDoneIssuesTree(ps.includeDoneIssuesTree);
        setIncludeDoneIssuesTreeGlobal(ps.includeDoneIssuesTreeGlobal);
        setShowWeekends(ps.showWeekends);
        setShowHolidays(ps.showHolidays);
        setShowCooldown(ps.showCooldown);
        setShowCapacityForecast(ps.showCapacityForecast);
        setStartStatusName(ps.startStatusName);
        setEndStatusName(ps.endStatusName);

        if (match && urlProjectId) {
          const stored = loadPlannerQuery();
          const next = { ...stored, projectIds: [urlProjectId] };
          savePlannerQuery(next);
          setPlannerQuery(next);
          navigateToProject(null);
        }

        setConnected(true);
      } catch {
        clearTokens();
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!connected) return;
    saveProjectSettings({ numWorkers, mode, drawCrossMilestoneDeps, includeDoneIssuesTree, includeDoneIssuesTreeGlobal, showWeekends, showHolidays, showCooldown, showCapacityForecast, startStatusName, endStatusName });
  }, [connected, numWorkers, mode, drawCrossMilestoneDeps, includeDoneIssuesTree, includeDoneIssuesTreeGlobal, showWeekends, showHolidays, showCooldown, showCapacityForecast, startStatusName, endStatusName]);

  useEffect(() => {
    const handler = () => {
      const pid = getProjectIdFromUrl();
      if (!pid || !projects.some((p) => p.id === pid)) return;
      setPlannerQuery((current) => {
        const next = { ...current, projectIds: [pid] };
        savePlannerQuery(next);
        return next;
      });
      navigateToProject(null);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [projects]);

  const loadProject = useCallback(async () => {
    const gen = ++loadGen.current;
    const query = loadPlannerQuery();
    const selectableIds = projectsRef.current.filter((project) => project.hasIssues).map((project) => project.id);
    const ids = projectIdsToLoad(query, selectableIds);
    if (ids.length === 0) {
      setProjectIssues([]);
      setOverviewIssues([]);
      setProjectCycles([]);
      setProjectMilestones([]);
      setWorkflowStates([]);
      return;
    }
    setError(null);
    setLoading(true);
    setOverviewIssues([]);
    lastRefreshAtRef.current = Date.now();
    try {
      const [stamped, cycles, milestones, states] = await Promise.all([
        fetchScopedIssues(ids, projectsRef.current),
        fetchScopedById(ids, fetchProjectCycles),
        fetchScopedById(ids, fetchProjectMilestones),
        fetchScopedById(ids, fetchProjectWorkflowStates),
      ]);
      if (gen !== loadGen.current) return;
      const matched = filterMatchingIssues(stamped, query, localToday(new Date()));
      setOverviewIssues(matched.map(toOverviewIssue));
      setWorkflowStates(states);
      if (stamped.length === 0) {
        setProjectIssues([]);
        setOverviewIssues([]);
        setProjectCycles([]);
        setProjectMilestones([]);
        setError("No issues found in this project.");
        setLoading(false);
        return;
      }
      if (matched.length === 0) {
        setProjectIssues([]);
        setProjectCycles(cycles);
        setProjectMilestones(milestones);
        setLoading(false);
        return;
      }
      const issues = matched;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let start = today;
      for (const issue of issues) {
        if (issue.startedAt) {
          const d = new Date(issue.startedAt);
          d.setHours(0, 0, 0, 0);
          if (d < start) start = d;
        }
      }
      const endName = computeEffectiveEndStatus(endStatusNameRef.current, states);
      const isDone = buildIsDone(issues, states, endName);
      const doneIds = issues.filter((i) => i.startedAt && isDone(i)).map((i) => i.id);

      // Fetch the state-transition history of every issue that ever started — done ones
      // included. The scheduler uses it to discount time spent in below-start states (e.g.
      // "Waiting for info"), which Linear's own `startedAt` would otherwise treat as start
      // time, and to read the `planner-no-count:` corrections out of the comments.
      const startedIds = issues.filter((i) => i.startedAt).map((i) => i.id);
      const history = startedIds.length > 0
        ? await fetchIssueStateHistory(startedIds)
        : { transitions: new Map<string, StateTransition[]>(), assignedIntervals: new Map<string, AssignedInterval[]>(), noCount: new Map<string, NoCountRange[]>() };

      // End dates come out of that same history — no second query pass.
      const endDates = new Map<string, string>();
      for (const id of doneIds) {
        const iso = endDateFromTransitions(history.transitions.get(id) ?? [], endName);
        if (iso) endDates.set(id, iso);
      }

      if (gen !== loadGen.current) return;
      setDoneEndDates(endDates);
      setStateHistoryByIssue(history.transitions);
      setAssignedIntervalsByIssue(history.assignedIntervals);
      setNoCountByIssue(history.noCount);
      setProjectIssues(issues);
      setProjectCycles(cycles);
      setProjectMilestones(milestones);
      setChartStart(start);
    } catch (e) {
      if (gen !== loadGen.current) return;
      setError(e instanceof Error ? e.message : "Failed to fetch issues");
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    savePlannerQuery(plannerQuery);
  }, [plannerQuery]);

  useEffect(() => {
    saveActiveViewId(activeViewId);
  }, [activeViewId]);

  useEffect(() => {
    if (!connected) return;
    loadProject();
  }, [connected, plannerQuery, loadProject]);

  // Auto-refresh: re-fetch the latest Linear data when the tab regains focus, but skip if
  // we already (auto- or manually) refreshed within the last 5 minutes — focus events fire
  // constantly while working, and re-fetching every time is more annoying than useful.
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  useEffect(() => {
    if (!connected || !autoRefresh) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || loadingRef.current) return;
      if (Date.now() - lastRefreshAtRef.current < AUTO_REFRESH_THROTTLE_MS) return;
      loadProject();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [connected, autoRefresh, loadProject]);

  const handleToggleAutoRefresh = useCallback((next: boolean) => {
    setAutoRefreshEnabled(next);
    setAutoRefreshState(next);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await logout();
    setConnected(false);
    setProjectIssues([]);
    setProjectCycles([]);
    setProjectMilestones([]);
    setWorkflowStates([]);
    setProjects([]);
    navigateToProject(null);
  }, []);

  const handleToggleWriteEnabled = useCallback(async (next: boolean) => {
    if (next === writeEnabled) return;
    const msg = next
      ? "Enable write access? You'll be redirected to Linear to re-authorize with read+write scope."
      : "Switch back to read-only? You'll be redirected to Linear to re-authorize.";
    if (!window.confirm(msg)) return;
    setWriteEnabled(next);
    setWriteEnabledState(next);
    await logout();
    startLogin();
  }, [writeEnabled]);

  const handleCreateBlockingRelation = useCallback(async (blockerId: string, blockedId: string) => {
    let relationId: string;
    try {
      relationId = await createBlockingRelation(blockerId, blockedId);
    } catch (err) {
      // The write failed — fall back to a full refetch so the tree reflects the true state.
      await loadProject();
      throw err;
    }
    // Optimistic update: patch the local issue data in place instead of refetching everything.
    // The schedule + tree are derived from projectIssues via useMemo, so the tree redraws without
    // unmounting — the container keeps its scroll position.
    setProjectIssues((prev) => addBlocksRelation(prev, blockerId, blockedId, relationId));
  }, [loadProject]);

  const handleDeleteRelation = useCallback(async (relationId: string) => {
    try {
      await deleteIssueRelation(relationId);
    } catch (err) {
      // The delete failed — fall back to a full refetch so the tree reflects the true state.
      await loadProject();
      throw err;
    }
    // Optimistic update: drop the relation node from local issue data instead of refetching. The
    // tree redraws from projectIssues without unmounting, keeping the scroll position.
    setProjectIssues((prev) => removeRelation(prev, relationId));
  }, [loadProject]);

  const rememberView = useCallback((view: SavedView | null) => {
    setActiveViewId(view?.id ?? null);
    setActiveView(view);
    saveActiveViewId(view?.id ?? null);
  }, []);

  const editQuery = useCallback((next: PlannerQuery) => {
    setPlannerQuery(next);
    savePlannerQuery(next);
    rememberView(null);
  }, [rememberView]);

  const selectMode = useCallback((next: Mode) => {
    setMode(next);
    rememberView(null);
  }, [rememberView]);

  const applySavedView = useCallback((view: SavedView) => {
    setPlannerQuery(view.query);
    savePlannerQuery(view.query);
    setMode(readSavedViewMode(view.mode) ?? "workers");
    rememberView(view);
  }, [rememberView]);

  const filterProjects = useMemo(() => selectableProjects.map((project) => ({ id: project.id, label: project.name })), [selectableProjects]);
  const filterStatuses = useMemo(() => [...new Set(workflowStates.map((state) => state.type))], [workflowStates]);
  const filterAssignees = useMemo(() => {
    const people = new Map<string, string>();
    for (const issue of projectIssues) {
      if (issue.assignee) people.set(issue.assignee.id, issue.assignee.name);
    }
    return [...people].map(([id, label]) => ({ id, label }));
  }, [projectIssues]);
  const filterLabels = useMemo(() => {
    const names = new Set<string>();
    for (const issue of projectIssues) {
      for (const label of issue.labels.nodes) names.add(label.name);
    }
    return [...names];
  }, [projectIssues]);
  const filterMilestones = useMemo(() => {
    const milestones = new Map<string, string>();
    for (const issue of projectIssues) {
      if (issue.projectMilestone) milestones.set(issue.projectMilestone.id, issue.projectMilestone.name);
    }
    return [...milestones].map(([id, label]) => ({ id, label }));
  }, [projectIssues]);

  const narrow = useNarrowLayout();

  const settingsFields = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13, color: "var(--text-muted)" }}>
        <span>People in parallel</span>
        <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setNumWorkers((n) => Math.max(1, n - 1))} disabled={numWorkers <= 1} style={stepperButtonStyle}>-</button>
          <span style={{ padding: "4px 12px", fontSize: 13, fontWeight: 600, minWidth: 32, textAlign: "center", background: "var(--bg)", color: "var(--text)" }}>
            {Math.min(numWorkers, maxParallelism)}
          </span>
          <button onClick={() => setNumWorkers((n) => Math.min(maxParallelism, n + 1))} disabled={numWorkers >= maxParallelism} style={stepperButtonStyle}>+</button>
        </div>
      </div>
      <div style={{ height: 1, background: "var(--border)" }} />
      {startedStates.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
            <span>Start status</span>
            <StatusSelect states={startedStates} startedStates={startedStates} value={effectiveStartStatus} onChange={setStartStatusName} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
            <span>End status</span>
            <StatusSelect states={endStatusCandidates} startedStates={startedStates} value={effectiveEndStatus} onChange={setEndStatusName} />
          </div>
          <div style={{ height: 1, background: "var(--border)" }} />
        </>
      )}
      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
        title="Re-fetch the latest Linear data whenever this tab regains focus"
      >
        <input type="checkbox" checked={autoRefresh} onChange={(e) => handleToggleAutoRefresh(e.target.checked)} />
        Auto-refresh
      </label>
      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
        title="Allow drag-and-drop dependency edits (requires Linear write scope)"
      >
        <input type="checkbox" checked={writeEnabled} onChange={(e) => handleToggleWriteEnabled(e.target.checked)} />
        Allow writes
      </label>
      <div style={{ height: 1, background: "var(--border)" }} />
      <button
        onClick={() => { setSettingsOpen(false); handleDisconnect(); }}
        style={{ ...buttonStyle, background: "transparent", color: "var(--text-muted)", padding: "6px 12px", fontSize: 13 }}
      >
        Disconnect
      </button>
    </>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: narrow && connected ? "8px 12px" : "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8, ...(narrow && connected ? { position: "sticky" as const, top: 0, zIndex: 40 } : {}) }}>
        {!(narrow && connected) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={`${BASE_PATH}/icon.png`} alt="" width={24} height={24} style={{ display: "block" }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Linear planner</h1>
          {connected && (
            <div style={{ position: "relative", marginLeft: "auto" }}>
              <SettingsButton open={settingsOpen} onClick={() => setSettingsOpen((o) => !o)} />
              {settingsOpen && !narrow && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setSettingsOpen(false)} />
                  <div
                    style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.35)", padding: 16, minWidth: 280,
                      display: "flex", flexDirection: "column", gap: 14,
                    }}
                  >
                    {settingsFields}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {connected && (
          <>
            {narrow && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                <SettingsButton open={settingsOpen} onClick={() => setSettingsOpen((o) => !o)} />
              </div>
            )}
            {schedule && <GlobalStatus schedule={schedule} includeCapacityForecast={showCapacityForecast} />}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
              <FilterMenu
                query={plannerQuery}
                projects={filterProjects}
                statuses={filterStatuses}
                assignees={filterAssignees}
                labels={filterLabels}
                milestones={filterMilestones}
                onChange={editQuery}
              />
              <ViewMenu
                query={plannerQuery}
                mode={mode}
                onApply={applySavedView}
                onCreated={rememberView}
                onRenamed={(view) => { if (view.id === activeViewId) rememberView(view); }}
                onDeleted={(id) => { if (id === activeViewId) rememberView(null); }}
              />
            </div>
          </>
        )}
        {narrow && settingsOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.45)" }} onClick={() => setSettingsOpen(false)} />
            <div
              style={{
                position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
                background: "var(--surface)", borderTop: "1px solid var(--border)",
                borderRadius: "16px 16px 0 0",
                boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
                padding: 16,
                paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
                display: "flex", flexDirection: "column", gap: 14,
                maxHeight: "70vh", overflowY: "auto",
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto" }} />
              {settingsFields}
            </div>
          </>
        )}
      </header>
      {connected && (
        <FilterChips
          query={plannerQuery}
          mode={mode}
          activeView={activeView}
          projects={filterProjects}
          assignees={filterAssignees}
          milestones={filterMilestones}
          onChange={editQuery}
          onCreated={rememberView}
        />
      )}

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {restoring && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-muted)" }}>Restoring session...</div>
        )}
        {!restoring && !connected && (
          <div style={centerCard}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Connect to Linear</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: 14 }}>
              Sign in with your Linear account to get started.<br />
              <span style={{ fontSize: 12, display: "block", marginTop: 4 }}>Read-only access to your workspace projects.</span>
            </p>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 16 }}>{error}</p>}
            <button
              onClick={() => { setError(null); startLogin(); }}
              style={{ ...buttonStyle, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
                <path d="M1.22541 61.5228c-.97395-3.1498-.6726-6.5664.82382-9.3819l17.82677 17.8268c-2.8156 1.4964-6.2321 1.7977-9.38189.8238L1.22541 61.5228Z" fill="currentColor"/>
                <path d="M3.03935 45.6498c.29957-.6032.63498-1.1903 1.0047-1.7577l49.8638 49.8637c-.5674.3698-1.1545.7052-1.7577 1.0048L3.03935 45.6498Z" fill="currentColor"/>
                <path d="M7.71875 38.3755c.51463-.6698 1.07064-1.307 1.66479-1.9081l52.14936 52.1494c-.6012.5942-1.2384 1.1502-1.9082 1.6648L7.71875 38.3755Z" fill="currentColor"/>
                <path d="M14.3344 32.1498c.5765-.5765 1.1812-1.1194 1.8108-1.6264l53.331 53.331c-.507.6296-1.0499 1.2344-1.6264 1.8108L14.3344 32.1498Z" fill="currentColor"/>
                <path d="M22.0669 26.7382c.6647-.5095 1.3576-.9811 2.0751-1.4118l50.5321 50.5321c-.4307.7175-.9023 1.4104-1.4118 2.0751L22.0669 26.7382Z" fill="currentColor"/>
                <path d="M31.0358 22.3528c.7702-.3626 1.5611-.6744 2.3687-.9339l44.177 44.1769c-.2595.8077-.5713 1.5986-.9339 2.3688L31.0358 22.3528Z" fill="currentColor"/>
                <path d="M41.7183 19.6735c.8579-.1524 1.725-.2389 2.5963-.2579l36.2699 36.2699c-.019.8714-.1055 1.7384-.258 2.5963L41.7183 19.6735Z" fill="currentColor"/>
                <path d="M54.0545 20.4375 79.5624 45.9454c-.6594 2.7717-2.1184 5.2884-4.2147 7.227L47.6279 25.4526c1.3523-1.4602 2.9964-2.6353 4.8128-3.4401 .5261-.2244 1.0631-.4188 1.6138-.5751Z" fill="currentColor"/>
                <path d="M63.4891 22.2024 77.7977 36.511c-1.0986 2.3186-2.8345 4.2871-5.0152 5.6801L58.7073 28.1159c1.0399-.7622 1.9596-1.6826 2.7218-2.7225.6784-.9264 1.2288-1.9421 1.6356-3.0255l.4244-.1655Z" fill="currentColor"/>
                <path d="M69.7925 25.6586 74.5088 30.375c-.3041.9476-.7466 1.8445-1.313 2.6624l-6.0663-6.0663c.8179-.5664 1.7148-1.0088 2.6624-1.313l.0006.0005Z" fill="currentColor"/>
              </svg>
              Sign in with Linear
            </button>
          </div>
        )}

        {connected && (
          <div style={{ padding: narrow ? 8 : 16, overflow: "auto" }}>
            {loading && mode !== "overview" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 64, color: "var(--text-muted)" }}>
                <span className="spinner" />
                Loading issues...
              </div>
            )}
            {error && !loading && mode !== "overview" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 64, color: "#ef4444", fontSize: 14 }}>{error}</div>
            )}
            {(mode === "overview" || !loading) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8, ...(narrow ? { flexDirection: "column" as const, alignItems: "stretch", gap: 8 } : {}) }}>
                <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", ...(narrow ? { width: "100%" } : {}) }}>
                  <button aria-label="Overview" onClick={() => selectMode("overview")} style={{ ...tabButtonStyle, ...(narrow ? { flex: 1, padding: "8px 2px", whiteSpace: "nowrap" as const } : {}), background: mode === "overview" ? "var(--accent)" : "var(--bg)", color: mode === "overview" ? "var(--accent-text)" : "var(--text-muted)" }}>
                    Overview
                  </button>
                  <button aria-label="Timeline" onClick={() => selectMode("workers")} style={{ ...tabButtonStyle, ...(narrow ? { flex: 1, padding: "8px 2px", whiteSpace: "nowrap" as const } : {}), background: mode === "workers" ? "var(--accent)" : "var(--bg)", color: mode === "workers" ? "var(--accent-text)" : "var(--text-muted)" }}>
                    Timeline
                  </button>
                  <button aria-label="Tree" onClick={() => selectMode("tree")} style={{ ...tabButtonStyle, ...(narrow ? { flex: 1, padding: "8px 2px", whiteSpace: "nowrap" as const } : {}), background: mode === "tree" ? "var(--accent)" : "var(--bg)", color: mode === "tree" ? "var(--accent-text)" : "var(--text-muted)" }}>
                    Tree
                  </button>
                </div>
                {narrow ? (
                  <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                    {mode === "workers" && (
                      <>
                        <FilterChip pressed={showWeekends} onClick={() => setShowWeekends((v) => !v)}>Weekends</FilterChip>
                        <FilterChip pressed={showHolidays} onClick={() => setShowHolidays((v) => !v)}>Holidays</FilterChip>
                        <FilterChip pressed={showCooldown} onClick={() => setShowCooldown((v) => !v)}>Cooldown</FilterChip>
                        <FilterChip pressed={showCapacityForecast} onClick={() => setShowCapacityForecast((v) => !v)}>Forecast</FilterChip>
                      </>
                    )}
                    {mode === "tree" && (
                      <>
                        <FilterChip pressed={drawCrossMilestoneDeps} onClick={() => setDrawCrossMilestoneDeps((v) => !v)}>Cross-milestone</FilterChip>
                        <FilterChip pressed={includeDoneIssuesTree} onClick={() => setIncludeDoneIssuesTree((v) => !v)}>Done issues</FilterChip>
                      </>
                    )}
                  </div>
                ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  {mode === "workers" && (
                    <>
                      <label style={modeSettingStyle}>
                        <input type="checkbox" checked={showWeekends} onChange={(e) => setShowWeekends(e.target.checked)} />
                        Show weekends
                      </label>
                      <label style={modeSettingStyle}>
                        <input type="checkbox" checked={showHolidays} onChange={(e) => setShowHolidays(e.target.checked)} />
                        Show holidays
                      </label>
                      <label style={modeSettingStyle}>
                        <input type="checkbox" checked={showCooldown} onChange={(e) => setShowCooldown(e.target.checked)} />
                        Show cooldown
                      </label>
                      <label style={modeSettingStyle} title="Place issues with no due date on the timeline from today. The bars are a forecast, not a deadline.">
                        <input type="checkbox" checked={showCapacityForecast} onChange={(e) => setShowCapacityForecast(e.target.checked)} />
                        Capacity forecast
                      </label>
                    </>
                  )}
                  {mode === "tree" && (
                    <>
                      <label style={modeSettingStyle}>
                        <input type="checkbox" checked={drawCrossMilestoneDeps} onChange={(e) => setDrawCrossMilestoneDeps(e.target.checked)} />
                        Draw dependencies between milestones
                      </label>
                      <label style={modeSettingStyle}>
                        <input type="checkbox" checked={includeDoneIssuesTree} onChange={(e) => setIncludeDoneIssuesTree(e.target.checked)} />
                        Include done issues
                      </label>
                    </>
                  )}
                </div>
                )}
              </div>
            )}
            {!loading && !error && schedule && mode === "workers" && (
              <GanttChart schedule={schedule} showWeekends={showWeekends} showHolidays={showHolidays} showCooldown={showCooldown} showCapacityForecast={showCapacityForecast} />
            )}
            {!loading && !error && schedule && mode === "tree" && (
              <DependencyTree
                schedule={schedule}
                variant={drawCrossMilestoneDeps ? "split" : "individual"}
                includeDone={includeDoneIssuesTree}
                writeEnabled={writeEnabled}
                onCreateBlockingRelation={handleCreateBlockingRelation}
                onDeleteRelation={handleDeleteRelation}
              />
            )}
            {mode === "overview" && (
              <Overview issues={overviewIssues} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
