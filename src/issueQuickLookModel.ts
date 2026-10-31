import type { LinearIssue } from "./linear";

/** The workflow state shown by the quick-look. */
export interface IssueQuickLookState {
  id: string;
  name: string;
  type: string;
  color: string;
}

/** The assignee shown by the quick-look. */
export interface IssueQuickLookAssignee {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** A label shown by the quick-look. */
export interface IssueQuickLookLabel {
  name: string;
  color: string;
}

/** The milestone or project shown by the quick-look. */
export interface IssueQuickLookNamedItem {
  id: string;
  name: string;
}

/** The other issue at the other end of a blocking relationship. */
export interface IssueQuickLookRelatedIssue {
  id: string;
  identifier: string;
  title: string;
  stateType: string;
  /** True when the related issue is neither completed nor canceled. */
  isOpen: boolean;
}

/** One blocking relationship and the relation id used to remove it. */
export interface IssueQuickLookRelationship {
  /** Id of the Linear relation node. */
  relationId: string;
  /** The other issue in the relationship. */
  issue: IssueQuickLookRelatedIssue;
}

/**
 * The canonical, UI-facing projection of an issue.
 *
 * Every surface that shows issue details uses this shape, so the quick-look
 * does not need a surface-specific issue model.
 */
export interface IssueQuickLookData {
  id: string;
  identifier: string;
  title: string;
  /** The issue's Linear URL. */
  url: string;
  state: IssueQuickLookState;
  /** Id of the team that owns the issue. */
  teamId: string;
  priority: number;
  priorityLabel: string;
  assignee: IssueQuickLookAssignee | null;
  labels: IssueQuickLookLabel[];
  milestone: IssueQuickLookNamedItem | null;
  project: IssueQuickLookNamedItem | null;
  /** Linear due date as `YYYY-MM-DD`, or null when the issue has none. */
  dueDate: string | null;
  /** The time the issue was created. */
  createdAt: string;
  /** The time the issue was last updated. */
  updatedAt: string;
  /** The time the issue entered a started workflow state. */
  enteredStartedStatusAt: string | null;
  /** The time the issue was completed. */
  completedAt: string | null;
  /** Sanitized plain text from the issue description. */
  description: string;
  /** Issues that block this issue, including their relation ids. */
  blockedBy: IssueQuickLookRelationship[];
  /** Issues that this issue blocks, including their relation ids. */
  blocks: IssueQuickLookRelationship[];
}

const COMPLETED_STATE_TYPE = "completed";
const CANCELED_STATE_TYPE = "canceled";

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/** Decode the small set of HTML entities that commonly occur in issue bodies. */
function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return NAMED_HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/**
 * Turn an issue body into plain text.
 *
 * Script and style contents are discarded, remaining tags become whitespace,
 * HTML entities are decoded, and all whitespace is collapsed. The result is
 * safe to render as text and never contains markup from the original body.
 */
export function toPlainText(source: string | null): string {
  if (!source) return "";
  const withoutUnsafeContent = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  const withoutTags = withoutUnsafeContent.replace(/<[^>]*>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/** True for the same workflow state types the shared issue facts treat as open. */
function isOpenStateType(stateType: string): boolean {
  return stateType !== COMPLETED_STATE_TYPE && stateType !== CANCELED_STATE_TYPE;
}

function toRelationship(
  relationId: string,
  relatedIssue: {
    id: string;
    identifier: string;
    title: string;
    state: { type: string };
  },
): IssueQuickLookRelationship {
  return {
    relationId,
    issue: {
      id: relatedIssue.id,
      identifier: relatedIssue.identifier,
      title: relatedIssue.title,
      stateType: relatedIssue.state.type,
      isOpen: isOpenStateType(relatedIssue.state.type),
    },
  };
}

/**
 * Project a Linear issue into the canonical quick-look model.
 *
 * A `blocks` relation in `relations` points from this issue to the issue it
 * blocks. The inverse relation points back to the blocker. Both directions
 * retain the relation node id so a blocking relationship can be removed.
 */
export function toIssueQuickLookData(issue: LinearIssue): IssueQuickLookData {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: {
      id: issue.state.id,
      name: issue.state.name,
      type: issue.state.type,
      color: issue.state.color,
    },
    teamId: issue.team.id,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    assignee: issue.assignee
      ? {
          id: issue.assignee.id,
          name: issue.assignee.name,
          avatarUrl: issue.assignee.avatarUrl,
        }
      : null,
    labels: issue.labels.nodes.map((label) => ({ name: label.name, color: label.color })),
    milestone: issue.projectMilestone
      ? { id: issue.projectMilestone.id, name: issue.projectMilestone.name }
      : null,
    project: issue.project ? { id: issue.project.id, name: issue.project.name } : null,
    dueDate: issue.dueDate,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    enteredStartedStatusAt: issue.startedAt,
    completedAt: issue.completedAt,
    description: toPlainText(issue.description),
    blockedBy: issue.inverseRelations.nodes
      .filter((relation) => relation.type === "blocks")
      .map((relation) => toRelationship(relation.id, relation.relatedIssue)),
    blocks: issue.relations.nodes
      .filter((relation) => relation.type === "blocks")
      .map((relation) => toRelationship(relation.id, relation.relatedIssue)),
  };
}
