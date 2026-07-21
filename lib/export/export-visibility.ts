import type { ExportType } from "./export-types";

/** Single source of truth for which exports appear in the menu.
 *  Everything else is parked, definitions intact — add a type here to revive
 *  it. (Replaces the single-purpose BRAND_REPORT_EXPORT_ENABLED flag.) */
export const VISIBLE_EXPORT_TYPES: readonly ExportType[] = ["detailed"];
