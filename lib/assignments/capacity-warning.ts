import { format, parseISO } from "date-fns";
import { MONTH_CAPACITY_HOURS, sumByMonth, type MonthHoursEntry } from "./allocation";

export type OverCapacityMonth = {
  month: string; // yyyy-MM-01
  monthLabel: string; // "Mar 2026"
  existingHours: number;
  proposedHours: number;
  totalHours: number;
  overPercentage: number; // how far past 160h, e.g. 184h -> 15
};

/**
 * Months (drawn from proposedByMonth's keys only) where existing + proposed
 * hours round to more than MONTH_CAPACITY_HOURS. Rounds before comparing so
 * splitTotalAcrossMonthsMap's 2dp drift doesn't trip a false positive at
 * exactly 160.
 */
export function getOverCapacityMonths(input: {
  existingByMonth: Record<string, number>;
  proposedByMonth: Record<string, number>;
}): OverCapacityMonth[] {
  const { existingByMonth, proposedByMonth } = input;
  const result: OverCapacityMonth[] = [];
  for (const month of Object.keys(proposedByMonth).sort()) {
    const existingHours = Math.round(existingByMonth[month] ?? 0);
    const proposedHours = Math.round(proposedByMonth[month] ?? 0);
    const totalHours = existingHours + proposedHours;
    if (totalHours > MONTH_CAPACITY_HOURS) {
      result.push({
        month,
        monthLabel: format(parseISO(month), "MMM yyyy"),
        existingHours,
        proposedHours,
        totalHours,
        overPercentage: Math.round(((totalHours - MONTH_CAPACITY_HOURS) / MONTH_CAPACITY_HOURS) * 100),
      });
    }
  }
  return result;
}

/**
 * Sums an employee's existing assignments into a month -> hours map,
 * excluding the project currently being assigned so its own (about to be
 * overwritten, mode: "merge") months aren't double-counted.
 */
export function sumExistingMonthlyHours(
  assignments: Array<{ projectKey: string; allocations: Array<{ month: string; plannedHours: number }> }>,
  excludeProjectKey: string,
): Record<string, number> {
  const entries: MonthHoursEntry[] = assignments
    .filter((a) => a.projectKey !== excludeProjectKey)
    .flatMap((a) => a.allocations.map((alloc) => ({ month: alloc.month, hours: alloc.plannedHours })));
  return Object.fromEntries(sumByMonth(entries));
}
