/**
 * The set of things this app can export.
 *
 * Lives in lib/ rather than in the export components so that non-component
 * code (route helpers, the live-count decision module) can depend on the
 * union without importing React. Renaming a member is a compile error in
 * every consumer, which is the point — a stringly-typed export type lets a
 * rename silently disable features that switch on it.
 */

export type ExportType = "assignments" | "utilization" | "projects" | "conflicts" | "brand" | "detailed";
