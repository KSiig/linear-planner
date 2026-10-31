// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinearWorkflowState } from "./linear";
import { StatusCircle } from "./StatusCircle";
import { StatusSelect } from "./StatusSelect";

afterEach(() => {
  cleanup();
});

const states: LinearWorkflowState[] = [
  { id: "state-todo", name: "Todo", type: "unstarted", position: 1, color: "#888888" },
  { id: "state-started", name: "In Progress", type: "started", position: 2, color: "#f2994a" },
  { id: "state-done", name: "Done", type: "completed", position: 3, color: "#5e6ad2" },
];

describe("StatusSelect", () => {
  it("exposes its expanded state and listbox option semantics", () => {
    render(
      <StatusSelect
        states={states}
        value="state-todo"
        onChange={() => {}}
        label="Status"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Status: Todo" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Todo" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "In Progress" }).getAttribute("aria-selected")).toBe("false");
  });

  it("navigates options with the keyboard and returns the selected id and state", () => {
    const onChange = vi.fn();
    render(
      <StatusSelect
        states={states}
        value="state-todo"
        onChange={onChange}
        label="Status"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Status: Todo" });
    trigger.focus();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("state-started", states[1]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape without selecting a state", () => {
    const onChange = vi.fn();
    render(
      <StatusSelect
        states={states}
        value="state-todo"
        onChange={onChange}
        label="Status"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Status: Todo" });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("sorts the workflow states before showing them", () => {
    render(
      <StatusSelect
        states={[states[2], states[1], states[0]]}
        value="state-todo"
        onChange={() => {}}
        label="Status"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Status: Todo" }));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Todo",
      "In Progress",
      "Done",
    ]);
  });
});

describe("StatusCircle", () => {
  it("has a default accessible name", () => {
    render(<StatusCircle stateType="started" color="#f2994a" />);

    expect(screen.getByRole("img", { name: "Status: started" })).toBeTruthy();
  });

  it("accepts a more specific accessible name", () => {
    render(<StatusCircle stateType="started" color="#f2994a" accessibleName="In Progress status" />);

    expect(screen.getByRole("img", { name: "In Progress status" })).toBeTruthy();
  });
});
