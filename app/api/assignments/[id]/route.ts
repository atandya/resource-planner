import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assignmentsDb } from "@/lib/mysql-assignments/db";
import { removeAllocationMonth } from "@/lib/assignments/assignment-commands";

const MONTH_RE = /^\d{4}-\d{2}-01$/;

/**
 * DELETE /api/assignments/[id]
 * With ?month=yyyy-MM-01 (optional &kind=plan|adjustment): removes just that
 * month's allocation, deleting the engagement too if it was the last one.
 * Without ?month: removes the whole engagement (planner_assignments row);
 * monthly allocations cascade via the FK ON DELETE CASCADE.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.access.can_view_all)
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });

  const { id } = await params;
  const searchParams = new URL(request.url).searchParams;
  const month = searchParams.get("month");

  if (month) {
    if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month must be yyyy-MM-01" }, { status: 400 });
    const kind = (searchParams.get("kind") ?? "plan") as "plan" | "adjustment";
    const result = await removeAllocationMonth(id, month, kind);
    return NextResponse.json({ success: true, ...result });
  }

  await assignmentsDb.execute(`DELETE FROM planner_assignments WHERE assignment_uuid = $1`, [id]);
  return NextResponse.json({ success: true });
}
