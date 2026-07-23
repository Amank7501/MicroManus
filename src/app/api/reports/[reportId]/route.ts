import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: report } = await supabase
    .from("reports")
    .select("title, storage_path")
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from("reports").download(report.storage_path);

  if (error || !file) {
    return NextResponse.json({ error: "Could not load report" }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = report.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "report";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Content-Length": String(buffer.length),
    },
  });
}
