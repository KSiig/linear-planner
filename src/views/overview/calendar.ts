import { parseLocalDate } from "../../dueWindows";

// The calendar days and their arithmetic live in the due-window module, so the
// windows and the days they count cannot drift apart. They are re-exported
// here because the overview still reads them from the calendar.
export { addCalendarDays, localToday } from "../../dueWindows";

export function shortDay(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return `${date.getDate()} ${month}`;
}

export function shortMonthYear(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return `${month} ${date.getFullYear()}`;
}
