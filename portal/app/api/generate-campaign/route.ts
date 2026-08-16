import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/generate-campaign
 *
 * Drives the "campaign graphic" generator behind the dashboard's GraphicCanvas.
 * Two calls are chained:
 *   1. Gemini (structured-generation JSON schema) — turns a free-form Topic into
 *        { campaign_type, copy_layer:{headline,subheadline,checklist,cta,phone,
 *          email}, background_image_prompt }.
 *   2. Imagen 3 (`imagen-3.0-generate-002`) — the `background_image_prompt` is
 *        passed to retrieve a RAW 1:1 background photo (no text / logos baked).
 *
 * Key handling is Google-standard:
 *   - `GOOGLE_API_KEY` (explicit Google/Vertex AI Studio key) is preferred.
 *   - `GEMINI_API_KEY` (shared Gemini key) is used as a fallback.
 * No real key ships in the repo — the route returns a graceful, structured
 * error and the frontend falls back to its static brand background whenever a
 * key isn't configured. Zero-maintenance, same gating the montage worker uses.
 */

const GENERATION_ENDPOINT =
  process.env.GEMINI_REST_ENDPOINT || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.0-flash"; // JSON-schema-capable
const IMAGEN_MODEL = "imagen-3.0-generate-002";
const BRAND_PHONE = process.env.BRAND_PHONE || "0449 252 963";
const BRAND_EMAIL = process.env.BRAND_EMAIL || "coffscoastpc@gmail.com";
const BRAND_NAME = process.env.BRAND_NAME || "Coffs Coast Pest Control";

/** Typed shape returned by the Gemini structured-generation step. */
type CampaignConcept = {
  campaign_type: string;
  copy_layer: {
    headline: string;
    subheadline: string;
    checklist: string[];
    cta: string;
    phone: string;
    email: string;
  };
  background_image_prompt: string;
};

/** Google key: explicit GOOGLE_API_KEY wins, else the shared GEMINI key. */
function getGoogleKey(): string {
  return (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
}

/** Call Gemini with a responseSchema; returns parsed concept or null (graceful). */
async function geminiStructured(topic: string, key: string): Promise<CampaignConcept | null> {
  const schema = {
    type: "object",
    properties: {
      campaign_type: {
        type: "string",
        enum: ["promo", "awareness", "seasonal", "testimonial", "educational"],
      },
      copy_layer: {
        type: "object",
        properties: {
          headline: { type: "string" },
          subheadline: { type: "string" },
          checklist: { type: "array", items: { type: "string" } },
          cta: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
        },
        required: ["headline", "subheadline", "checklist", "cta", "phone", "email"],
      },
      background_image_prompt: { type: "string" },
    },
    required: ["campaign_type", "copy_layer", "background_image_prompt"],
  };

  const prompt =
    `You are the creative director for ${BRAND_NAME} (${BRAND_PHONE}, ${BRAND_EMAIL}). ` +
    `For the social-media campaign topic "${topic}", produce structured copy and an ` +
    `AI image-generation prompt. The background image prompt must describe a RAW ` +
    `1:1 (square) photo background with NO text and NO logos. Write concise, ` +
    `landscape-friendly copy with a clear call-to-action.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  try {
    const resp = await fetch(
      `${GENERATION_ENDPOINT.replace(/\/$/, "")}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    // Defensive: the model may wrap JSON in markdown fences.
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(cleaned) as CampaignConcept;
    } catch {
      // Try to salvage a JSON object substring.
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) {
        return JSON.parse(cleaned.slice(first, last + 1)) as CampaignConcept;
      }
      return null;
    }
  } catch {
    return null;
  }
}

/** Imagen 3 -> base64 PNG background. Returns a data URI or null. */
async function imagenBackground(
  prompt: string,
  key: string
): Promise<string | null> {
  try {
    const resp = await fetch(
      `${GENERATION_ENDPOINT.replace(/\/$/, "")}/models/${IMAGEN_MODEL}:predict?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" },
        }),
        cache: "no-store",
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const base64 = data?.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) return null;
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { topic?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const topic = (body.topic || "").trim();
  if (!topic) {
    return NextResponse.json(
      { ok: false, error: "A campaign topic is required (e.g. \"Summer Kitchen Ant Control\")." },
      { status: 400 }
    );
  }

  const key = getGoogleKey();
  const imagesConfigured = !!process.env.GOOGLE_API_KEY || !!process.env.GEMINI_API_KEY;

  // Concept from Gemini (structured JSON schema).
  const concept = key ? await geminiStructured(topic, key) : null;

  // Structured defaults so the canvas always has a full copy layer even when
  // Generative AI isn't configured (graceful zero-key fallback).
  const copy_layer = {
    headline: String(concept?.copy_layer?.headline || topic),
    subheadline: String(
      concept?.copy_layer?.subheadline ||
        `Trusted pest protection across the Coffs Coast.`
    ),
    checklist: Array.isArray(concept?.copy_layer?.checklist)
      ? concept.copy_layer.checklist.map(String)
      : ["Free local quote", "Family & pet-safe options", "Treated & guaranteed"],
    cta: String(concept?.copy_layer?.cta || "Book your treatment today"),
    phone: String(concept?.copy_layer?.phone || BRAND_PHONE),
    email: String(concept?.copy_layer?.email || BRAND_EMAIL),
  };

  // Background image via Imagen.
  const imagenPrompt = String(concept?.background_image_prompt || "");
  const background =
    imagesConfigured && imagenPrompt ? await imagenBackground(imagenPrompt, key) : null;

  return NextResponse.json({
    ok: true,
    topic,
    campaign_type: String(concept?.campaign_type || "promotional"),
    copy_layer,
    background_image_prompt: imagenPrompt,
    // Frontend layer-1 source: AI raw background (if generated), else a
    // static brand stock placeholder.
    background_image_url: background || "/images/on-demand-1.jpg",
    generated: {
      copy: !!concept,
      background: imagesConfigured ? !!background : false,
      source: imagesConfigured ? (background ? "imagen" : "gemini-only") : "static",
    },
  });
}