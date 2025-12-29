import { toISODate } from '../tasks/date';

export type CalendarDay = {
  date: Date;
  iso: string;
  inMonth: boolean;
};

const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const addDays = (value: Date, days: number) => {
  const next = new Date(value.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

export const isValidISODate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) {
    return false;
  }
  return toISODate(date) === value;
};

export const getMonthMatrix = (
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 0,
) => {
  const firstOfMonth = new Date(year, month, 1);
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
  let current = addDays(firstOfMonth, -offset);
  const weeks: CalendarDay[][] = [];

  for (let w = 0; w < 6; w += 1) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = startOfDay(current);
      week.push({
        date,
        iso: toISODate(date),
        inMonth: date.getMonth() === month,
      });
      current = addDays(current, 1);
    }
    weeks.push(week);
  }

  while (weeks.length > 5 && weeks[weeks.length - 1].every((day) => !day.inMonth)) {
    weeks.pop();
  }

  return weeks;
};
