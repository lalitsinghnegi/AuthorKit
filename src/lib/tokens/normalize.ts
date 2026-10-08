import type { FigmaColor, FigmaEffect } from "@/lib/figma/types";

/** Base font size used to convert px to rem. */
export const REM_BASE = 16;

/** Round to at most `digits` decimals and drop trailing zeros: 1.2000 → "1.2". */
export function num(value: number, digits = 3): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

const channel = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** Figma 0–1 RGBA → "#rrggbb", or "rgb(r g b / a%)" when not fully opaque. */
export function colorToCss(color: FigmaColor, opacity = 1): string {
  const [r, g, b] = [channel(color.r), channel(color.g), channel(color.b)];
  const alpha = Math.min(1, Math.max(0, (color.a ?? 1) * opacity));
  if (alpha >= 0.999) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return `rgb(${r} ${g} ${b} / ${num(alpha * 100, 1)}%)`;
}

export const pxToRem = (px: number) => (px === 0 ? "0" : `${num(px / REM_BASE, 4)}rem`);
export const px = (value: number) => (value === 0 ? "0" : `${num(value, 2)}px`);

/** Line height as a unitless ratio of the font size (e.g. 48px on 40px → "1.2"). */
export function lineHeightRatio(lineHeightPx: number, fontSize: number): string {
  return num(lineHeightPx / fontSize, 2);
}

/** Letter spacing in em relative to the font size (e.g. -0.4px on 40px → "-0.01em"). */
export function letterSpacingEm(letterSpacingPx: number, fontSize: number): string {
  if (!letterSpacingPx) return "0";
  return `${num(letterSpacingPx / fontSize, 3)}em`;
}

/** Fallback stack appended to every Figma font family. */
export const FONT_FALLBACK =
  'system-ui, -apple-system, "Segoe UI", "Roboto", "Helvetica Neue", arial, sans-serif';

export function fontFamilyStack(family: string): string {
  const clean = family.replace(/["\\;{}<>]/g, "").trim();
  return `"${clean}", ${FONT_FALLBACK}`;
}

export function shadowToCss(effect: FigmaEffect): string {
  const { x = 0, y = 0 } = effect.offset ?? {};
  const color = effect.color ? colorToCss(effect.color) : "rgb(0 0 0 / 25%)";
  const spread = effect.spread ? ` ${px(effect.spread)}` : "";
  return `${px(x)} ${px(y)} ${px(effect.radius ?? 0)}${spread} ${color}`;
}

/** "Brand / Primary Dark" → "brand-primary-dark". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
