function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function localToday(now: Date): string {
  return formatLocal(now);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return formatLocal(new Date(year, month - 1, day + days));
}

export function shortDay(isoDate: string): string {
  const date = localDate(isoDate);
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return `${date.getDate()} ${month}`;
}

export function shortMonthYear(isoDate: string): string {
  const date = localDate(isoDate);
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return `${month} ${date.getFullYear()}`;
}
