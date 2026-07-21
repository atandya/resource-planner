/** Single source of truth for whether the Brand Report export is live.
 *  The report works end to end (route, live count, editable scope) but is
 *  parked while it's iterated on — same pattern as DASHBOARD_FEATURE_ENABLED.
 *  Flip to `true` to put it back in the export menu. */
export const BRAND_REPORT_EXPORT_ENABLED = false;
