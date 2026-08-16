import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/regenerate — regenerate a single social post asset via the
 * montage worker (Google Imagen/Veo fallback when keyed, else FFmpeg/static
 * recruitment). Also accepts an upload payload to swap the asset with a
 * client image/video.
 *
 * Body:
 *   { id, topic?, angle?, caption? }              → trigger worker regen
 *   { id, image?, filename?, video? }             → swap with a user upload
 *
 * This is a thin orchestration shim. When the worker/exec environment isn't
 * available (static hosting), it returns { ok:false, error:"..." } so the
 * dashboard's Regenerate button degrades gracefully to "Swap image".
 */
type RegenBody = {
  id?: string;
  topic?: string;
  angle?: string;
  caption?: string;
  image?: string; // data URI (upload swap)
  filename?: string;
  video?: boolean;
};

export async function POST(req: Request) {
  let body: RegenBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: "A post id is required." }, { status: 400 });
  }

  // Upload swap is a self-contained data mutation (no worker needed).
  if (body.image && body.image.startsWith("data:")) {
    return NextResponse.json({
      ok: true,
      id,
      mediaUrl: body.video ? body.image : undefined,
      image: body.video ? undefined : body.image,
      note: "Asset replaced with uploaded media.",
    });
  }

  // Worker-driven regeneration. Attempt local Python worker; if unavailable
  // (static/read-only server), let the caller know politely.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const pexec = promisify(execFile);

  const script = "scripts/montage_worker/worker.py";
  const args = ["-3", script, "--on-demand", "--dry-run", "--json"];
  try {
    const { stdout } = await pexec("py", args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      timeout: 120000,
    });
    const firstBrace = stdout.indexOf("{");
    const lastBrace = stdout.lastIndexOf("}");
    const payload = stdout.slice(firstBrace, lastBrace < 0 ? undefined : lastBrace + 1);
    const parsed = JSON.parse(payload || "{}");
    return NextResponse.json({
      ok: !(parsed.errors && parsed.errors.length),
      id,
      regenerated: (parsed.images || []).length,
      assets: { images: parsed.images || [], videos: parsed.videos || [] },
      errors: parsed.errors || [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      id,
      error: `Regeneration worker unavailable: ${msg}`,
    });
  }
}