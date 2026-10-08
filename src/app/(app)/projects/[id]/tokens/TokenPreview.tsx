import type { CSSProperties } from "react";
import type { TokenType } from "@/lib/model";
import { contrastRatio } from "@/lib/templates/contrast";
import { validateTokenValue } from "@/lib/tokens/validateValue";
import styles from "./TokenReview.module.css";

/**
 * A small visual sample of a token. Values only reach the style object
 * after passing validation; React applies them through the CSSOM, never
 * as raw CSS text.
 */
export function TokenPreview({
  type,
  value,
  background,
}: {
  type: TokenType;
  value: string;
  background: string;
}) {
  if (validateTokenValue(type, value))
    return (
      <span className={styles.previewInvalid} aria-hidden="true">
        ?
      </span>
    );

  const style: CSSProperties = {};
  switch (type) {
    case "color": {
      const ratio =
        value.startsWith("#") && background.startsWith("#")
          ? safeContrast(value, background)
          : null;
      return (
        <span className={styles.previewColor}>
          <span className={styles.swatch} style={{ background: value }} aria-hidden="true" />
          {ratio !== null && (
            <span className={styles.previewMeta} title="Contrast against the page background">
              {ratio.toFixed(1)}:1
            </span>
          )}
        </span>
      );
    }
    case "fontFamily":
      style.fontFamily = value;
      return (
        <span className={styles.previewText} style={style}>
          Aa Bb
        </span>
      );
    case "fontSize":
      style.fontSize = value;
      return (
        <span className={styles.previewText} style={style}>
          Aa
        </span>
      );
    case "fontWeight":
      style.fontWeight = value as CSSProperties["fontWeight"];
      return (
        <span className={styles.previewText} style={style}>
          Aa
        </span>
      );
    case "lineHeight":
      style.lineHeight = value;
      return (
        <span className={`${styles.previewText} ${styles.previewLines}`} style={style}>
          Line one
          <br />
          Line two
        </span>
      );
    case "letterSpacing":
      style.letterSpacing = value;
      return (
        <span className={styles.previewText} style={style}>
          Spacing
        </span>
      );
    case "spacing":
    case "size":
      return (
        <span
          className={styles.previewBar}
          style={{ width: `min(${value}, 160px)` }}
          aria-hidden="true"
        />
      );
    case "radius":
      return (
        <span className={styles.previewBox} style={{ borderRadius: value }} aria-hidden="true" />
      );
    case "border":
      return (
        <span
          className={styles.previewBox}
          style={{ borderWidth: value, borderStyle: "solid" }}
          aria-hidden="true"
        />
      );
    case "shadow":
      return (
        <span
          className={styles.previewBox}
          style={{ boxShadow: value, borderColor: "transparent" }}
          aria-hidden="true"
        />
      );
    default:
      return <span className={styles.previewMeta}>{value}</span>;
  }
}

function safeContrast(a: string, b: string): number | null {
  try {
    return contrastRatio(a, b);
  } catch {
    return null;
  }
}
