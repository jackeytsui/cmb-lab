export type CalendarMonth = {
  year: number;
  month: number;
};

export type CalendarDate = CalendarMonth & {
  day: number;
};

export type CalendarDay = CalendarDate & {
  key: string;
  isCurrentMonth: boolean;
  isToday: boolean;
};

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function calendarDateKey(date: Date, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calendarMonthInTimeZone(
  date: Date,
  timeZone: string,
): CalendarMonth {
  const { year, month } = datePartsInTimeZone(date, timeZone);
  return { year, month };
}

export function calendarDateInTimeZone(
  date: Date,
  timeZone: string,
): CalendarDate {
  return datePartsInTimeZone(date, timeZone);
}

export function shiftCalendarDate(
  current: CalendarDate,
  offset: number,
): CalendarDate {
  const shifted = new Date(
    Date.UTC(current.year, current.month - 1, current.day + offset),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function shiftCalendarMonth(
  current: CalendarMonth,
  offset: number,
): CalendarMonth {
  const shifted = new Date(Date.UTC(current.year, current.month - 1 + offset, 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
  };
}

export function buildCalendarMonth(
  current: CalendarMonth,
  todayKey: string,
): CalendarDay[] {
  const firstDay = new Date(Date.UTC(current.year, current.month - 1, 1));
  const leadingDays = firstDay.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(current.year, current.month, 0),
  ).getUTCDate();
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(
      Date.UTC(current.year, current.month - 1, 1 - leadingDays + index),
    );
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      year,
      month,
      day,
      key,
      isCurrentMonth: year === current.year && month === current.month,
      isToday: key === todayKey,
    };
  });
}

export function buildCalendarWeek(
  current: CalendarDate,
  todayKey: string,
): CalendarDay[] {
  const currentDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day),
  );
  const firstDay = shiftCalendarDate(current, -currentDate.getUTCDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftCalendarDate(firstDay, index);
    const key = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    return {
      ...date,
      key,
      isCurrentMonth:
        date.year === current.year && date.month === current.month,
      isToday: key === todayKey,
    };
  });
}
