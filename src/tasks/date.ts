const pad = (value: number) => String(value).padStart(2, '0');

export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getTodayISO = () => toISODate(new Date());

const parseISODate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

const addWeeks = (date: Date, weeks: number) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + weeks * 7);
  return next;
};

const addMonths = (date: Date, months: number) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const nextMonth = month + months;
  const lastDay = new Date(year, nextMonth + 1, 0).getDate();
  const nextDay = Math.min(day, lastDay);
  return new Date(year, nextMonth, nextDay);
};

export const getNextRecurringDue = (
  due: string | null | undefined,
  recurrence: 'weekly' | 'monthly',
) => {
  const base = due ? parseISODate(due) : null;
  const start = base ?? new Date();
  const nextDate =
    recurrence === 'weekly' ? addWeeks(start, 1) : addMonths(start, 1);
  return toISODate(nextDate);
};

export const addDaysISO = (iso: string, days: number) => {
  const base = parseISODate(iso);
  if (!base) {
    return iso;
  }
  return toISODate(addDays(base, days));
};
