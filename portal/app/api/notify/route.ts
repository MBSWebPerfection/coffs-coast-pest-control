import { NextResponse } from "next/server";
import { notifyClientReady, notifyApproved } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/notify — trigger client/approval notifications.
 *
 * Body shapes:
 *   { } or { month?: string }                       → monthly "content ready"
 *   { event: "approved", id?, caption?, zipUrl? }  → approval alert to Dan
 *   { to?: string }                                 → override recipient
 *
 * Safe to call from a cron/Vercel schedule and custom manual buttons. Never
 * throws: unconfigured channels return a 200 with { skipped/sent:false }.
 */
export async function POST(req: Request) {
  let body: { to?: string; month?: string; event?: string; id?: string; caption?: string; zipUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  if (body.event === "approved") {
    const result = await notifyApproved({
      postId: body.id,
      caption: body.caption,
      zipUrl: body.zipUrl,
    });
    return NextResponse.json(result, { status: 200 });
  }

  const result = await notifyClientReady({
    to: body.to,
    month: body.month ? new Date(body.month) : undefined,
  });

  return NextResponse.json(result, { status: 200 });
}