import { useState, useCallback, useEffect, useRef, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { fetchProjects, fetchProjectMilestones, fetchProjectTeamIds, fetchTeamWorkflowStates, createBlockingRelation, deleteIssueRelation, addBlocksRelation, removeRelation, issueUpdate, issueUpdateFields, fetchTeamMembers, fetchIssue } from "./linear";
import type { LinearProject, LinearIssue, LinearMilestone, LinearWorkflowState, LinearTeamMember } from "./linear";
import { startLogin, handleOAuthCallback, getCallbackPath, isAuthenticated, clearTokens, logout, isAutoRefreshEnabled, setAutoRefreshEnabled, isOAuthScopeError, reauthorizeWithWriteScope } from "./auth";
import { DependencyTree } from "./DependencyTree";
import { DeadlineTimeline } from "./DeadlineTimeline";
import { BASE_PATH, getProjectIdFromUrl, navigateToProject } from "./routing";
import { computeEffectiveDoneStateIds, sortStates } from "./workflowState";
import { GlobalStatus } from "./GlobalStatus";
import { centerCard, tabButtonStyle, buttonStyle } from "./appStyles";
import { useNarrowLayout } from "./useNarrowLayout";
import { Overview } from "./views/overview/Overview";
import { localToday } from "./views/overview/calendar";
import type { OverviewIssue } from "./views/overview/cards/shell/contract";
import { fetchScopedById, fetchScopedIssues, filterMatchingIssues, projectIdsToLoad, toOverviewIssue } from "./applyPlannerQuery";
import type { PlannerQuery } from "./plannerQuery";
import { normalizePlannerQuery } from "./plannerQuery";
import {
  loadActiveViewId,
  loadDisplaySettings,
  loadPlannerQuery,
  readSavedViewMode,
  saveActiveViewId,
  saveDisplaySettings,
  savePlannerQuery,
  LEGACY_STORAGE_KEY,
  type SavedView,
  type SavedViewMode as Mode,
} from "./savedViews";
import { FilterMenu, type StatusOption, type StatusState } from "./views/filters/FilterMenu";
import { FilterChips } from "./views/filters/FilterChips";
import { ViewMenu } from "./views/filters/ViewMenu";
import { IssueQuickLook } from "./IssueQuickLook";
import { IssueQuickLookActions } from "./IssueQuickLookActions";
import { applyQuickLookActionToIssue, toIssueUpdateFields, type IssueQuickLookAction } from "./issueQuickLookActions";
import { toIssueQuickLookData, type IssueQuickLookData } from "./issueQuickLookModel";
import { IssueQuickLookSurfaceContext } from "./issueQuickLookContext";
import { IssueLongPressContext, useIssueLongPressController } from "./issueInteraction";

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

/**
 * Drop a relation from the local issue data, on both sides of the relation.
 *
 * A relation has two sides: the "blocks" side of the blocker and the "blocked
 * by" side of the blocked issue. `removeRelation` clears the first one, and
 * the quick-look reads the second one, so it is cleared here as well. The
 * relation id is the same on both sides.
 */
function removeRelationEverywhere(issues: LinearIssue[], relationId: string): LinearIssue[] {
  return removeRelation(issues, relationId).map((issue) => {
    if (!issue.inverseRelations.nodes.some((relation) => relation.id === relationId)) return issue;
    return {
      ...issue,
      inverseRelations: {
        ...issue.inverseRelations,
        nodes: issue.inverseRelations.nodes.filter((relation) => relation.id !== relationId),
      },
    };
  });
}

/**
 * True for the workflow state types that close an issue.
 *
 * An issue in one of these states has a completion time in Linear, so that
 * time is read from Linear instead of being made up.
 */
function isClosingStateType(stateType: string): boolean {
  return stateType === "completed" || stateType === "canceled";
}

/**
 * The data the quick-look holds before the user picks an issue.
 *
 * The quick-look needs an issue, but the app only knows one after a click.
 * The dialog stays closed until then, so this placeholder is never shown.
 */
const NO_ISSUE: IssueQuickLookData = {
  id: "",
  identifier: "",
  title: "",
  url: "",
  state: { id: "", name: "", type: "", color: "" },
  teamId: "",
  priority: 0,
  priorityLabel: "",
  assignee: null,
  labels: [],
  milestone: null,
  project: null,
  dueDate: null,
  createdAt: "",
  updatedAt: "",
  enteredStartedStatusAt: null,
  completedAt: null,
  description: "",
  blockedBy: [],
  blocks: [],
};

/** The assignee choices before the team members are known. */
const NO_TEAM_MEMBERS: readonly LinearTeamMember[] = [];

/** A workflow state together with the team that owns it. */
interface TeamWorkflowState extends LinearWorkflowState {
  teamId: string;
}

/**
 * The workflow states of every team of a project.
 *
 * A project can span teams, and every team names its states on its own. The
 * team is kept, so the Status filter can tell two states with the same name
 * apart.
 */
async function fetchProjectTeamStates(projectId: string): Promise<TeamWorkflowState[]> {
  const states: TeamWorkflowState[] = [];
  for (const teamId of await fetchProjectTeamIds(projectId)) {
    for (const state of await fetchTeamWorkflowStates(teamId)) {
      states.push({ ...state, teamId });
    }
  }
  return states;
}

/**
 * The Status filter options.
 *
 * The option id is the workflow state id, so the filter selects the concrete
 * state and not its internal type. Two teams can name a state the same way;
 * those options carry the team key, so the names stay apart.
 */
function buildStatusOptions(states: StatusState[]): StatusOption[] {
  const nameCount = new Map<string, number>();
  for (const state of states) nameCount.set(state.name, (nameCount.get(state.name) ?? 0) + 1);
  return states.map((state) => ({
    id: state.id,
    type: state.type,
    label:
      (nameCount.get(state.name) ?? 0) > 1 && state.teamKey !== ""
        ? `${state.name} · ${state.teamKey}`
        : state.name,
  }));
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [mode, setMode] = useState<Mode>("dates");
  const [drawCrossMilestoneDeps, setDrawCrossMilestoneDeps] = useState(false);
  const [includeDoneIssuesTree, setIncludeDoneIssuesTree] = useState(true);
  const [includeDoneIssuesTreeGlobal, setIncludeDoneIssuesTreeGlobal] = useState(true);
  const [doneStateIds, setDoneStateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [scopeError, setScopeError] = useState<unknown>(null);
  const [autoRefresh, setAutoRefreshState] = useState(isAutoRefreshEnabled());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [projectIssues, setProjectIssues] = useState<LinearIssue[]>([]);
  const [overviewIssues, setOverviewIssues] = useState<OverviewIssue[]>([]);
  const [plannerQuery, setPlannerQuery] = useState(() => normalizePlannerQuery(loadPlannerQuery()));
  const [activeViewId, setActiveViewId] = useState<string | null>(() => loadActiveViewId());
  const [activeView, setActiveView] = useState<SavedView | null>(null);
  const [projectMilestones, setProjectMilestones] = useState<LinearMilestone[]>([]);
  const [teamStates, setTeamStates] = useState<TeamWorkflowState[]>([]);
  // The issue the shared quick-look shows. One issue, one quick-look, every surface.
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  const loadGen = useRef(0);

  // Timestamp of the last data load (manual or auto), used to throttle auto-refresh.
  const lastRefreshAtRef = useRef(0);

  // Empty projects have nothing to plan, so they are not offered in the picker. They stay in
  // `projects` though, so an existing /p/<id> URL for one still restores.
  const selectableProjects = useMemo(() => projects.filter((p) => p.hasIssues), [projects]);

  // The workflow states of the loaded projects. A state can be reached through
  // more than one project, so every state is kept once.
  const uniqueTeamStates = useMemo(() => {
    const seen = new Set<string>();
    return teamStates.filter((state) => {
      if (seen.has(state.id)) return false;
      seen.add(state.id);
      return true;
    });
  }, [teamStates]);

  // The workflow states the project runs on.
  const workflowStates = useMemo<LinearWorkflowState[]>(
    () =>
      uniqueTeamStates
        .map((state) => ({ id: state.id, name: state.name, type: state.type, position: state.position, color: state.color }))
        .sort((left, right) => left.position - right.position),
    [uniqueTeamStates],
  );

  // The started states of the workflow: the states a project can treat as terminal
  // on top of the completed ones, and the states the tree reads a card's progress from.
  const startedStates = useMemo(
    () => sortStates(workflowStates.filter((s) => s.type === "started")),
    [workflowStates],
  );

  // The workflow state ids the project treats as terminal. Ids the workflow no
  // longer knows are dropped.
  const effectiveDoneStateIds = useMemo(
    () => computeEffectiveDoneStateIds(doneStateIds, workflowStates),
    [doneStateIds, workflowStates],
  );
  const doneStateIdSet = useMemo(() => new Set(effectiveDoneStateIds), [effectiveDoneStateIds]);

  /** The current calendar day (`YYYY-MM-DD`). */
  const today = localToday(new Date());

  // The full issues of the project, so a surface that shows a narrow issue can
  // still find the issue behind it.
  const issuesById = useMemo(
    () => new Map(projectIssues.map((issue) => [issue.id, issue])),
    [projectIssues],
  );

  // The issue the shared quick-look shows, projected with the one canonical mapping.
  const selectedIssue = selectedIssueId === null ? null : issuesById.get(selectedIssueId) ?? null;
  const quickLookData = useMemo(
    () => (selectedIssue ? toIssueQuickLookData(selectedIssue) : NO_ISSUE),
    [selectedIssue],
  );

  // The team of the selected issue. The assignee choices are scoped to it, the
  // same scope the status choices use.
  const selectedTeamId = selectedIssue?.team.id ?? null;

  // The members of the selected issue's team.
  const [teamMembers, setTeamMembers] = useState<{ teamId: string; members: LinearTeamMember[] } | null>(null);

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    (async () => {
      try {
        const members = await fetchTeamMembers(selectedTeamId);
        if (!cancelled) setTeamMembers({ teamId: selectedTeamId, members });
      } catch {
        if (!cancelled) setTeamMembers({ teamId: selectedTeamId, members: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  // The members of the team of the issue that is shown right now.
  const issueTeamMembers = teamMembers && teamMembers.teamId === selectedTeamId
    ? teamMembers.members
    : NO_TEAM_MEMBERS;

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
            const ps = loadDisplaySettings(match ? urlProjectId : null);
            setMode(ps.mode);
            setDrawCrossMilestoneDeps(ps.drawCrossMilestoneDeps);
            setIncludeDoneIssuesTree(ps.includeDoneIssuesTree);
            setIncludeDoneIssuesTreeGlobal(ps.includeDoneIssuesTreeGlobal);
            setDoneStateIds(ps.doneStateIds);
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
      const timeoutId = window.setTimeout(() => setRestoring(false), 0);
      return () => window.clearTimeout(timeoutId);
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
        const ps = loadDisplaySettings(match ? urlProjectId : null);
        setMode(ps.mode);
        setDrawCrossMilestoneDeps(ps.drawCrossMilestoneDeps);
        setIncludeDoneIssuesTree(ps.includeDoneIssuesTree);
        setIncludeDoneIssuesTreeGlobal(ps.includeDoneIssuesTreeGlobal);
        setDoneStateIds(ps.doneStateIds);

        if (match && urlProjectId) {
          const stored = normalizePlannerQuery(loadPlannerQuery());
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
    saveDisplaySettings({ mode, drawCrossMilestoneDeps, includeDoneIssuesTree, includeDoneIssuesTreeGlobal, doneStateIds });
  }, [connected, mode, drawCrossMilestoneDeps, includeDoneIssuesTree, includeDoneIssuesTreeGlobal, doneStateIds]);

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
    const query = normalizePlannerQuery(loadPlannerQuery());
    const selectableIds = projectsRef.current.filter((project) => project.hasIssues).map((project) => project.id);
    const ids = projectIdsToLoad(query, selectableIds);
    if (ids.length === 0) {
      setProjectIssues([]);
      setOverviewIssues([]);
      setProjectMilestones([]);
      setTeamStates([]);
      return;
    }
    setError(null);
    setLoading(true);
    setOverviewIssues([]);
    lastRefreshAtRef.current = Date.now();
    try {
      const [stamped, milestones, states] = await Promise.all([
        fetchScopedIssues(ids, projectsRef.current),
        fetchScopedById(ids, fetchProjectMilestones),
        fetchScopedById(ids, fetchProjectTeamStates),
      ]);
      if (gen !== loadGen.current) return;
      const matched = filterMatchingIssues(stamped, query, localToday(new Date()));
      setOverviewIssues(matched.map(toOverviewIssue));
      setTeamStates(states);
      if (stamped.length === 0) {
        setProjectIssues([]);
        setOverviewIssues([]);
        setProjectMilestones([]);
        setError("No issues found in this project.");
        setLoading(false);
        return;
      }
      if (matched.length === 0) {
        setProjectIssues([]);
        setProjectMilestones(milestones);
        setLoading(false);
        return;
      }
      if (gen !== loadGen.current) return;
      setProjectIssues(matched);
      setProjectMilestones(milestones);
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
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
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
    setProjectMilestones([]);
    setTeamStates([]);
    setProjects([]);
    navigateToProject(null);
  }, []);

  const handleCreateBlockingRelation = useCallback(async (blockerId: string, blockedId: string) => {
    let relationId: string;
    try {
      relationId = await createBlockingRelation(blockerId, blockedId);
    } catch (err) {
      if (isOAuthScopeError(err)) setScopeError(err);
      // The write failed — fall back to a full refetch so the tree reflects the true state.
      await loadProject();
      throw err;
    }
    // Optimistic update: patch the local issue data in place instead of refetching everything.
    // The tree is derived from projectIssues via useMemo, so the tree redraws without
    // unmounting — the container keeps its scroll position.
    setProjectIssues((prev) => addBlocksRelation(prev, blockerId, blockedId, relationId));
  }, [loadProject]);

  const handleDeleteRelation = useCallback(async (relationId: string) => {
    try {
      await deleteIssueRelation(relationId);
    } catch (err) {
      if (isOAuthScopeError(err)) setScopeError(err);
      // The delete failed — fall back to a full refetch so the tree reflects the true state.
      await loadProject();
      throw err;
    }
    // Optimistic update: drop the relation node from local issue data instead of refetching. The
    // tree redraws from projectIssues without unmounting, keeping the scroll position.
    setProjectIssues((prev) => removeRelationEverywhere(prev, relationId));
  }, [loadProject]);

  const handleStatusChange = useCallback(async (issueId: string, stateId: string) => {
    try {
      await issueUpdate(issueId, stateId);
    } catch (err) {
      if (isOAuthScopeError(err)) setScopeError(err);
      throw err;
    }
    // The write succeeded, so the local issue data moves to the new state as well.
    const state = workflowStates.find((candidate) => candidate.id === stateId);
    if (!state) return;
    setProjectIssues((prev) => prev.map((issue) => (
      issue.id === issueId
        ? {
            ...issue,
            state: {
              id: state.id,
              name: state.name,
              type: state.type,
              color: state.color,
              position: state.position,
            },
          }
        : issue
    )));
    // A finished issue gets its completion time from Linear, so that one issue
    // is read again instead of guessing the time.
    if (!isClosingStateType(state.type)) return;
    try {
      const fresh = await fetchIssue(issueId);
      if (fresh) setProjectIssues((prev) => prev.map((issue) => (issue.id === issueId ? fresh : issue)));
    } catch {
      // The status change stands; only the read of the issue did not work out.
    }
  }, [workflowStates]);

  /**
   * Change the priority, the assignee, or the due date of an issue.
   *
   * The issue moves to the new values right away and falls back to the values
   * it had when the write fails.
   */
  const handleQuickLookAction = useCallback(async (issueId: string, action: IssueQuickLookAction) => {
    const before = projectIssues.find((issue) => issue.id === issueId);
    if (!before) return;
    setProjectIssues((prev) => prev.map((issue) => (
      issue.id === issueId ? applyQuickLookActionToIssue(issue, action) : issue
    )));
    try {
      await issueUpdateFields(issueId, toIssueUpdateFields(action));
    } catch (err) {
      if (isOAuthScopeError(err)) setScopeError(err);
      setProjectIssues((prev) => prev.map((issue) => (issue.id === issueId ? before : issue)));
      throw err;
    }
  }, [projectIssues]);

  const rememberView = useCallback((view: SavedView | null) => {
    setActiveViewId(view?.id ?? null);
    setActiveView(view);
    saveActiveViewId(view?.id ?? null);
  }, []);

  const editQuery = useCallback((next: PlannerQuery) => {
    const normalized = normalizePlannerQuery(next);
    setPlannerQuery(normalized);
    savePlannerQuery(normalized);
    rememberView(null);
  }, [rememberView]);

  const selectMode = useCallback((next: Mode) => {
    setMode(next);
    rememberView(null);
  }, [rememberView]);

  const applySavedView = useCallback((view: SavedView) => {
    const normalized = normalizePlannerQuery(view.query);
    setPlannerQuery(normalized);
    savePlannerQuery(normalized);
    setMode(readSavedViewMode(view.mode) ?? "dates");
    rememberView(view);
  }, [rememberView]);

  const filterProjects = useMemo(() => selectableProjects.map((project) => ({ id: project.id, label: project.name })), [selectableProjects]);
  // The Status filter offers the concrete workflow states, not their internal
  // types. Two teams can name a state the same way, so those options carry the
  // team key and stay apart.
  const teamKeys = useMemo(() => {
    const keys = new Map<string, string>();
    for (const project of projects) {
      for (const team of project.teams.nodes) keys.set(team.id, team.key || team.name || team.id);
    }
    return keys;
  }, [projects]);
  const filterStatuses = useMemo<StatusOption[]>(
    () =>
      buildStatusOptions(
        uniqueTeamStates.map((state) => ({
          id: state.id,
          name: state.name,
          type: state.type,
          teamKey: teamKeys.get(state.teamId) ?? "",
        })),
      ),
    [uniqueTeamStates, teamKeys],
  );
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

  // One gesture for the whole app: every issue row of every surface shares it.
  const longPressController = useIssueLongPressController();

  const toggleDoneState = useCallback((stateId: string, checked: boolean) => {
    setDoneStateIds((current) => (
      checked
        ? (current.includes(stateId) ? current : [...current, stateId])
        : current.filter((id) => id !== stateId)
    ));
  }, []);

  const settingsFields = (
    <>
      {startedStates.length > 0 && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <span>Done states</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
              {startedStates.map((state) => (
                <label
                  key={state.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  title={`Issues in ${state.name} count as completed`}
                >
                  <input
                    type="checkbox"
                    checked={doneStateIds.includes(state.id)}
                    onChange={(e) => toggleDoneState(state.id, e.target.checked)}
                  />
                  {state.name}
                </label>
              ))}
            </div>
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
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Linear dashboard</h1>
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
            {projectIssues.length > 0 && <GlobalStatus issues={projectIssues} doneStateIds={doneStateIdSet} today={today} />}
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
      {connected && scopeError !== null && (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", fontSize: 13,
          }}
        >
          <span>Your Linear session needs write access to make changes.</span>
          <button
            type="button"
            onClick={() => { void reauthorizeWithWriteScope(scopeError); }}
            style={{ ...buttonStyle, padding: "6px 12px", fontSize: 13 }}
          >
            Reconnect to update Linear
          </button>
        </div>
      )}
      {connected && (
        <FilterChips
          query={plannerQuery}
          mode={mode}
          activeView={activeView}
          projects={filterProjects}
          statuses={filterStatuses}
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
              <span style={{ fontSize: 12, display: "block", marginTop: 4 }}>Read and write access to your workspace projects.</span>
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
                  <button aria-label="Dates" onClick={() => selectMode("dates")} style={{ ...tabButtonStyle, ...(narrow ? { flex: 1, padding: "8px 2px", whiteSpace: "nowrap" as const } : {}), background: mode === "dates" ? "var(--accent)" : "var(--bg)", color: mode === "dates" ? "var(--accent-text)" : "var(--text-muted)" }}>
                    Dates
                  </button>
                  <button aria-label="Tree" onClick={() => selectMode("tree")} style={{ ...tabButtonStyle, ...(narrow ? { flex: 1, padding: "8px 2px", whiteSpace: "nowrap" as const } : {}), background: mode === "tree" ? "var(--accent)" : "var(--bg)", color: mode === "tree" ? "var(--accent-text)" : "var(--text-muted)" }}>
                    Tree
                  </button>
                </div>
                {mode === "tree" && (narrow ? (
                  <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                    <FilterChip pressed={drawCrossMilestoneDeps} onClick={() => setDrawCrossMilestoneDeps((v) => !v)}>Cross-milestone</FilterChip>
                    <FilterChip pressed={includeDoneIssuesTree} onClick={() => setIncludeDoneIssuesTree((v) => !v)}>Done issues</FilterChip>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <label style={modeSettingStyle}>
                      <input type="checkbox" checked={drawCrossMilestoneDeps} onChange={(e) => setDrawCrossMilestoneDeps(e.target.checked)} />
                      Draw dependencies between milestones
                    </label>
                    <label style={modeSettingStyle}>
                      <input type="checkbox" checked={includeDoneIssuesTree} onChange={(e) => setIncludeDoneIssuesTree(e.target.checked)} />
                      Include done issues
                    </label>
                  </div>
                ))}
              </div>
            )}
            {/*
              The app owns one quick-look. Its trigger content is the surface
              contract every issue surface reads, so a plain click opens the
              same quick-look on the dates, tree, overview, and undated rows.
            */}
            <IssueQuickLook
              data={quickLookData}
              teamStates={workflowStates}
              startedStates={startedStates}
              onStatusChange={handleStatusChange}
              onRemoveBlocker={handleDeleteRelation}
              secondaryActions={(
                <IssueQuickLookActions
                  data={quickLookData}
                  teamMembers={issueTeamMembers}
                  onAction={handleQuickLookAction}
                />
              )}
              trigger={(triggerProps) => (
                <IssueLongPressContext.Provider value={longPressController}>
                  <IssueQuickLookSurfaceContext.Provider
                    value={{
                      trigger: triggerProps,
                      selectedIssueId,
                      openIssue: (issueId: string, event: ReactMouseEvent<HTMLElement>) => {
                        setSelectedIssueId(issueId);
                        triggerProps.onClick(event);
                      },
                      issueById: (issueId: string) => issuesById.get(issueId),
                    }}
                  >
                    {!loading && !error && mode === "dates" && (
                      <DeadlineTimeline issues={projectIssues} />
                    )}
                    {!loading && !error && mode === "tree" && (
                      <DependencyTree
                        issues={projectIssues}
                        milestones={projectMilestones}
                        doneStateIds={doneStateIdSet}
                        startedStates={startedStates}
                        today={today}
                        variant={drawCrossMilestoneDeps ? "split" : "individual"}
                        includeDone={includeDoneIssuesTree}
                        onCreateBlockingRelation={handleCreateBlockingRelation}
                      />
                    )}
                    {mode === "overview" && (
                      <Overview issues={overviewIssues} />
                    )}
                  </IssueQuickLookSurfaceContext.Provider>
                </IssueLongPressContext.Provider>
              )}
            />
          </div>
        )}
      </main>
    </div>
  );
}
