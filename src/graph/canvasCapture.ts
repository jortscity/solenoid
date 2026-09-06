import { getView, getEditor } from "./process";
// Capture for STATIC EXPORT, deliberately separate from the live HTML-in-Canvas
// renderer, whose `drawElementImage` needs a Chrome flag a recipient won't have.

/** Inline every same-origin stylesheet rule — a rasterized foreignObject inherits no
 *  live stylesheets; an unreadable cross-origin sheet is skipped, not fatal. */
function inlineStylesheetText(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText);
    } catch {
      // cross-origin sheet — can't read its rules; skip it.
    }
  }
  return chunks.join("\n");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** Rasterizes the CURRENT viewport (not the whole world) to a PNG data URL; null
 *  when unmounted or the browser refuses the foreignObject, so export fails soft. */
export async function captureCanvasImage(): Promise<string | null> {
  const container = getView()?.container;
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const clone = container.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.style.transform = "none";
  clone.style.position = "static";

  const css = inlineStylesheetText();
  const xhtml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;">` +
    `<style>${css}</style>${xhtml}` +
    `</div></foreignObject></svg>`;

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The exported document ships no app stylesheet, so anything a chart takes from class
// rules or `var(--…)` must be baked in as computed inline style.
const SVG_STYLE_PROPS = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "opacity",
  "font-family", "font-size", "font-weight", "color",
] as const;

/** Serialize a live in-document SVG with its rendered styles inlined; original and
 *  clone are walked in lockstep because getComputedStyle is blank on a detached node. */
export function serializeSvgWithComputedStyles(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const origs: Element[] = [svgEl, ...Array.from(svgEl.querySelectorAll("*"))];
  const clones: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];
  for (let i = 0; i < origs.length; i++) {
    const target = clones[i] as Element & Partial<ElementCSSInlineStyle>;
    if (!target?.style) continue; // non-styleable node — nothing to inline
    const computed = getComputedStyle(origs[i]);
    for (const prop of SVG_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      if (target.getAttribute(prop) === value) continue; // already stated verbatim
      target.style.setProperty(prop, value);
    }
  }
  return clone.outerHTML;
}

/** A node's chart `<svg>` — its largest SVG that isn't card chrome (the frame
 *  overlays are the biggest SVGs on every card and paint nothing off-canvas) or
 *  glyph-sized furniture. Null when the node isn't on the live canvas or draws no chart. */
export function nodeChartSvg(nodeId: string): SVGSVGElement | null {
  const el = getView()?.nodeElement(nodeId);
  if (!el) return null;
  let best: SVGSVGElement | null = null;
  let bestArea = 40 * 40;
  for (const svg of Array.from(el.querySelectorAll("svg"))) {
    if (svg.classList.contains("solenoid-node__frame")) continue;
    const box = svg.getBoundingClientRect();
    const area = box.width * box.height;
    if (area > bestArea) { bestArea = area; best = svg; }
  }
  return best;
}

/** Every currently-rendered chart node's `<svg>` as self-contained markup with its
 *  node's display name; `includeNodeIds` narrows to the report-referenced set. */
export function captureChartSvgs(
  names: Map<string, string>,
  includeNodeIds?: ReadonlySet<string>,
): { name: string; svg: string }[] {
  const editor = getEditor();
  if (!editor) return [];
  const out: { name: string; svg: string }[] = [];
  for (const { id } of editor.getNodes()) {
    if (includeNodeIds && !includeNodeIds.has(id)) continue;
    const svgEl = nodeChartSvg(id);
    if (!svgEl) continue;
    out.push({ name: names.get(id) ?? "Chart", svg: serializeSvgWithComputedStyles(svgEl) });
  }
  return out;
}
