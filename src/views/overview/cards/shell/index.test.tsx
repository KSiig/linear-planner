// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defineCard, type CardModel, type CardRow } from "./contract";
import { CardShell } from "./index";

afterEach(() => {
  cleanup();
});

function row(id: string): CardRow {
  return {
    id,
    identifier: id.toUpperCase(),
    title: `Title ${id}`,
    url: `https://example.test/${id}`,
    trailing: "trail",
    projectName: "Project",
  };
}

function model(count: number): CardModel {
  return {
    title: "Open",
    subtitle: "this week",
    sections: [{ title: "First", rows: Array.from({ length: count }, (_, index) => row(`row-${index + 1}`)) }],
  };
}

describe("CardShell", () => {
  it("renders nothing for a null model", () => {
    const card = defineCard({ id: "empty", load: async () => null });
    const view = render(<CardShell card={card} model={null} />);
    expect(view.container.childElementCount).toBe(0);
  });

  it("collapses after the configured row count and expands on the more button", () => {
    const card = defineCard({ id: "open", appearance: { collapseAfter: 4 }, load: async () => null });
    render(<CardShell card={card} model={model(5)} />);
    expect(screen.getByText("Title row-4")).toBeTruthy();
    expect(screen.queryByText("Title row-5")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 more" }));
    expect(screen.getByText("Title row-5")).toBeTruthy();
  });

  it("keeps the shell border when a module replaces the body", () => {
    const card = defineCard({
      id: "custom",
      load: async () => null,
      renderBody: () => <p>Custom body</p>,
    });
    const view = render(<CardShell card={card} model={model(1)} />);
    const shell = view.container.querySelector(".overview-card");
    expect(shell).toBeTruthy();
    expect(getComputedStyle(shell as Element).borderTopWidth).toBe("1px");
    expect(screen.getByText("Custom body")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Open" })).toBeTruthy();
  });
});
