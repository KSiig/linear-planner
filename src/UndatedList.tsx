import type { ScheduledIssue, MilestoneInfo } from "./scheduler";
import { StatusCircle } from "./StatusCircle";
import { isBlockedDisplay } from "./cardStyle";
import { groupUndatedIssues } from "./undatedGroups";

export function UndatedList({
  issues,
  milestones,
}: {
  issues: ScheduledIssue[];
  milestones: MilestoneInfo[];
}) {
  const groups = groupUndatedIssues(issues, milestones);
  const count = groups.reduce((sum, group) => sum + group.issues.length, 0);
  if (count === 0) return null;

  return (
    <section
      aria-label="No due date"
      style={{
        marginTop: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--iteration-line)" }}>
            No due date
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{count}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          These issues are not placed on the timeline.
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {groups.map((group) => (
          <div key={group.id ?? "none"}>
            <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", background: "rgba(128,128,128,0.08)" }}>
              {group.name}
            </div>
            {group.issues.map((issue) => (
              <a
                key={issue.id}
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px",
                  borderTop: "1px solid var(--border)",
                  color: "var(--text)",
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                <StatusCircle stateType={issue.stateType} color={issue.stateColor} progress={issue.stateProgress} size={12} />
                <span style={{ fontWeight: 600, flexShrink: 0 }}>{issue.identifier}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{issue.title}</span>
                {isBlockedDisplay(issue) && <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>Blocked</span>}
              </a>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
