// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OverviewIssue } from "./cards/shell/contract";
import { Overview } from "./Overview";

const issue: OverviewIssue = {
  id: "i1",
  identifier: "SII-1",
  title: "Ship the planner",
  url: "https://linear.app/issue/SII-1",
  dueDate: "2026-10-22",
  priority: 2,
  priorityLabel: "High",
  updatedAt: "2026-10-01T00:00:00.000Z",
  state: { name: "Todo", type: "unstarted" },
  project: { id: "p1", name: "Planner" },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 22, 23, 59, 30));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Overview", () => {
  it("groups the issues by the local day and follows the clock past midnight", async () => {
    render(<Overview issues={[issue]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole("heading", { name: "Next" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Overdue" })).toBeNull();

    // The local day turns over at midnight, so the issue due that day is late.
    vi.setSystemTime(new Date(2026, 9, 23, 0, 0, 30));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByRole("heading", { name: "Overdue" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Next" })).toBeNull();
  });
});
