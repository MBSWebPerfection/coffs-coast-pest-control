"use client";

import { useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
 * GraphicCanvas — layered AI campaign graphic renderer.
 *
 * Renders a 1080x1080 social-square graphic by compositing four layers in a
 * fixed stack (bottom -> top), preserving brand rules (no crop/distort of the
 * logo, raw background, or copy; solid black shell behind the logo):
 *
 *   Layer 1   Raw AI background photo  (Imagen 3, 1:1, no text/logos)
 *   Layer 2   Vector wave ribbons + dark scrim (pure CSS/SVG, brand accent)
 *   Layer 3   Vector logo from /public (solid black shell, aspect-preserved)
 *   Layer 4   Dynamic copy with brand typefaces (Montserrat)
 *
 * The component is self-contained and needs no extra deps. If no AI background
 * is supplied it falls back to a static brand stock image so the canvas always
 * renders.
 * ------------------------------------------------------------------------ */

export type CampaignConcept = {
  campaign_type?: string;
  copy_layer?: {
    headline: string;
    subheadline: string;
    checklist: string[];
    cta: string;
    phone: string;
    email: string;
  };
  background_image_url?: string;
  background_image_prompt?: string;
  generated?: { copy: boolean; background: boolean; source: string };
};

const LOGO_SRC = "/images/logo-no-background.png";

export default function GraphicCanvas({
  concept,
  onDownload,
}: {
  concept: CampaignConcept | null;
  onDownload?: () => void;
}) {
  const copy = concept?.copy_layer ?? {
    headline: "Coffs Coast Pest Control",
    subheadline: "Trusted protection, coast to coast.",
    checklist: ["Free local quote", "Family & pet-safe options", "Treated & guaranteed"],
    cta: "Book your treatment today",
    phone: "0449 252 963",
    email: "coffscoastpc@gmail.com",
  };
  const bgUrl = concept?.background_image_url || "/images/on-demand-1.jpg";
  const bgConfigured = concept?.generated?.background ?? false;

  const [bgFailed, setBgFailed] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Reset failure state when the background source changes.
  useEffect(() => {
    setBgFailed(false);
  }, [bgUrl]);

  // Composite the current DOM graphic to a <canvas> at 1080x1080 for download.
  async function compositeDownload() {
    const node = canvasRef.current;
    if (!node) return;

    // Container must render off-screen at fixed scale for capture. Because
    // layout in the live card is responsive, build a dedicated capture canvas
    // at exactly 1080x1080, reusing the DOM layers via ref-less approach:
    // encode the node to an SVG foreignObject at 1080px target.
    const targetW = 1080;
    const targetH = 1080;

    // Use a foreignObject snapshot scaled to 1080x1080.
    const clone = node.cloneNode(true) as HTMLElement;
    const foreign = `<foreignObject width="100%" height="100%">${clone.outerHTML}</foreignObject>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}">${foreign}</svg>`;
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = targetW;
      c.height = targetH;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        URL.revokeObjectURL(svgUrl);
        const a = document.createElement("a");
        a.download = "campaign-graphic-1080.png";
        a.href = c.toDataURL("image/png");
        a.click();
        onDownload?.();
      }
    };
    img.src = svgUrl;
  }

  return (
    <div className="w-full max-w-[420px] mx-auto">
      {/* Live canvas — 1:1 aspect, 4 stacked layers */}
      <div
        ref={canvasRef}
        className="relative w-full aspect-square overflow-hidden rounded-2xl border border-neutral-800"
        style={{ background: "#000" }}
      >
        {/* Layer 1 — raw AI background photo (no text/logos) */}
        {!bgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgUrl}
            alt="Campaign background"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setBgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black" />
        )}

        {/* Layer 2 — subtle scrim + wave ribbons (SVG) for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <svg
          className="absolute -bottom-4 left-0 w-full h-1/3 opacity-80"
          viewBox="0 0 1080 360"
          preserveAspectRatio="none"
        >
          <path d="M0 260 Q270 120 540 220 T1080 180 V360 H0 Z" fill="#ffffff" opacity="0.12" />
          <path d="M0 310 Q360 180 720 260 T1080 240 V360 H0 Z" fill="#f5f5f5" opacity="0.20" />
        </svg>

        {/* Layer 3 — vector logo on solid black shell (bottom right) */}
        <div className="absolute bottom-3 right-3 w-14 h-14 rounded-xl bg-black flex items-center justify-center overflow-hidden p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_SRC}
            alt="Coffs Coast Pest Control"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Layer 4 — dynamic copy with brand typeface */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-300 mb-1">
            {concept?.campaign_type ?? "Promotional"}
          </p>
          <h2 className="text-2xl font-extrabold leading-tight font-montserrat">
            {copy.headline}
          </h2>
          <p className="mt-1 text-sm text-neutral-200/90">{copy.subheadline}</p>

          <ul className="mt-2 space-y-1 text-xs text-neutral-200">
            {copy.checklist.slice(0, 3).map((item, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-white">✦</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-2 text-sm font-bold">
            <span className="rounded-lg bg-white text-black px-3 py-1.5">{copy.cta}</span>
            <span className="rounded-lg bg-black/60 border border-white/20 px-3 py-1.5">
              {copy.phone}
            </span>
          </div>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={compositeDownload}
        className="mt-3 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition"
      >
        ⬇ Download 1080×1080 PNG
      </button>
    </div>
  );
}