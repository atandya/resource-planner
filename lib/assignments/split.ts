import { eachMonthOfInterval, endOfMonth, format, isValid, startOfDay, startOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";

export type MonthHours = { month: string /* yyyy-MM-01 */; plannedHours: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Equal split of `total` across every calendar month touched by [startDate, endDate]. */
export function splitTotalAcrossMonths(total: number, startDate: string, endDate: string): MonthHours[] {
  const start = startOfMonth(new Date(`${startDate}T00:00:00`));
  const end = startOfMonth(new Date(`${endDate}T00:00:00`));
  if (end < start) return [];
  const months = eachMonthOfInterval({ start, end });
  if (months.length === 0) return [];
  const per = round2(total / months.length);
  const result = months.map((m) => ({ month: format(m, "yyyy-MM-01"), plannedHours: per }));
  // Put the rounding drift on the last month so the parts sum exactly to `total`.
  const remainder = round2(total - round2(per * months.length));
  if (remainder !== 0) {
    const last = result[result.length - 1];
    last.plannedHours = round2(last.plannedHours + remainder);
  }
  return result;
}

/** Even split as a `{ "yyyy-MM-01": hours }` map — the shape `upsertAssignment` wants. */
export function splitTotalAcrossMonthsMap(
  total: number,
  startDate: string,
  endDate: string,
): Record<string, number> {
  return Object.fromEntries(
    splitTotalAcrossMonths(total, startDate, endDate).map((m) => [m.month, m.plannedHours]),
  );
}

/** Flat fill: write `perMonth` to every calendar month touched by [startDate, endDate].
 *  Unlike splitTotalAcrossMonths (which divides a TOTAL across the span), this treats the
 *  number as an hours-PER-MONTH rate — the same value lands on each month. Returns the
 *  `{ "yyyy-MM-01": hours }` map shape `upsertAssignment` wants. Invalid or reversed dates
 *  yield {} — a STRICTER guard than splitTotalAcrossMonths, additionally rejecting invalid
 *  dates (via isValid) that splitTotalAcrossMonths does not. */
export function fillMonthsWithValue(
  perMonth: number,
  startDate: string,
  endDate: string,
): Record<string, number> {
  const start = startOfMonth(new Date(`${startDate}T00:00:00`));
  const end = startOfMonth(new Date(`${endDate}T00:00:00`));
  if (!isValid(start) || !isValid(end) || end < start) return {};
  const months = eachMonthOfInterval({ start, end });
  return Object.fromEntries(months.map((m) => [format(m, "yyyy-MM-01"), perMonth]));
}

/** Sanitize a man-hours text input to whole numbers only — strips every non-digit
 *  character. Planning is in whole hours; decimals are not allowed (a typed "7.5"
 *  becomes "75" as the dot is dropped). Mirrors the sanitization already used by the
 *  project-setup and add-project hour inputs; centralized here so all hour inputs match. */
export function toWholeHoursInput(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** Parse a whole-number man-hours string. Returns null when the value is blank or non-integer. */
export function parseManHoursInput(value: string | number | null | undefined): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

// ─── Date-range utilities used by project assignment forms ───────────────────

export type ProjectAssignmentProjectType = "pitch" | "campaign";
export type MissingAssignmentPlanningDateReason = "campaign_date_range" | "pitch_submit_date";

/** Coerce a stored date value (ISO, "yyyy-MM-dd HH:mm:ss", verbose) to the strict
 *  "yyyy-MM-dd" form that <input type="date"> requires. Returns "" on failure. */
export function toDateInputValue(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  const leading = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (leading) return `${leading[1]}-${leading[2]}-${leading[3]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateLike(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day);
}

export function countWeekdaysInclusive(start: Date, end: Date): number {
  let count = 0;
  const cursor = startOfDay(start);
  const final = startOfDay(end);
  while (cursor.getTime() <= final.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Number of working (Mon–Fri) days between two "yyyy-MM-dd" strings inclusive. */
export function countAssignmentWorkingDays(range: { startDate: string; endDate: string }): number {
  return countWeekdaysInclusive(parseDateLike(range.startDate), parseDateLike(range.endDate));
}

/** Default span for enrolling someone on a project: a pitch spans exactly the
 *  month of its submit date; otherwise the project's own start/end when both
 *  are known, otherwise today through one month out. */
export function getDefaultAssignmentRange(
  project: {
    startDate?: string | null;
    endDate?: string | null;
    projectType?: "pitch" | "campaign";
    submitDate?: string | null;
  },
  today: Date = new Date(),
): { startDate: string; endDate: string } {
  if (project.projectType === "pitch" && project.submitDate) {
    const submitDate = parseDateLike(project.submitDate);
    return {
      startDate: format(startOfMonth(submitDate), "yyyy-MM-dd"),
      endDate: format(endOfMonth(submitDate), "yyyy-MM-dd"),
    };
  }
  const startDate = toDateInputValue(project.startDate);
  const endDate = toDateInputValue(project.endDate);
  if (startDate && endDate) return { startDate, endDate };
  const start = startOfDay(today);
  const oneMonthOut = new Date(start);
  oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(oneMonthOut, "yyyy-MM-dd"),
  };
}

export function getAssignmentDateStrings(dateRange: DateRange | undefined, fallbackDate = new Date()): { startDate: string; endDate: string } {
  const start = dateRange?.from ?? fallbackDate;
  const end = dateRange?.to ?? start;
  return {
    startDate: format(startOfDay(start), "yyyy-MM-dd"),
    endDate: format(startOfDay(end), "yyyy-MM-dd"),
  };
}

export function getFallbackAssignmentDateRange(
  assignments: Array<{ startDate: string | Date; endDate: string | Date }>,
): DateRange | undefined {
  const startDates = assignments
    .map((a) => parseDateLike(a.startDate).getTime())
    .filter(Number.isFinite);
  const endDates = assignments
    .map((a) => parseDateLike(a.endDate).getTime())
    .filter(Number.isFinite);
  if (startDates.length === 0 || endDates.length === 0) return undefined;
  return {
    from: startOfDay(new Date(Math.min(...startDates))),
    to: startOfDay(new Date(Math.max(...endDates))),
  };
}

export function getProjectAssignmentDateRange(project: {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  submitDate?: string | Date | null;
}): DateRange | undefined {
  if (project.startDate && project.endDate) {
    return {
      from: startOfDay(parseDateLike(project.startDate)),
      to: startOfDay(parseDateLike(project.endDate)),
    };
  }
  if (project.submitDate) {
    const d = startOfDay(parseDateLike(project.submitDate));
    return { from: d, to: d };
  }
  return undefined;
}

export function getMissingAssignmentPlanningDateReason(
  projectType: ProjectAssignmentProjectType,
  dateRange: DateRange | undefined,
): MissingAssignmentPlanningDateReason | null {
  if (projectType === "pitch") {
    return dateRange?.from && dateRange?.to ? null : "pitch_submit_date";
  }
  return dateRange?.from && dateRange?.to ? null : "campaign_date_range";
}

export function formatProjectDateForDisplay(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = parseDateLike(value instanceof Date ? value : String(value));
  if (!isValid(parsed)) return "";
  return format(parsed, "MMM d, yyyy");
}
