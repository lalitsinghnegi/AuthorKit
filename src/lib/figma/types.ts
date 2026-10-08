/** The subset of the Figma REST API that AuthorKit reads. Unknown fields are passed through. */

export type FigmaColor = { r: number; g: number; b: number; a: number };

export type FigmaPaint = {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  boundVariables?: Record<string, unknown>;
};

export type FigmaTypeStyle = {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  lineHeightPercentFontSize?: number;
  lineHeightUnit?: string;
  letterSpacing?: number;
  textCase?: string;
};

export type FigmaEffect = {
  type: string;
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
};

export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: FigmaEffect[];
  style?: FigmaTypeStyle;
  characters?: string;
  styles?: Record<string, string>;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  [key: string]: unknown;
};

export type FigmaStyleMeta = { key: string; name: string; styleType: string; description?: string };

export type FigmaFile = {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
  styles: Record<string, FigmaStyleMeta>;
};

export type FigmaNodesResponse = {
  name: string;
  nodes: Record<string, { document: FigmaNode; styles?: Record<string, FigmaStyleMeta> } | null>;
};

export type FigmaPublishedStyle = {
  key: string;
  file_key: string;
  node_id: string;
  style_type: string;
  name: string;
  description?: string;
};

export type FigmaStylesResponse = { meta: { styles: FigmaPublishedStyle[] } };

export type FigmaVariable = {
  id: string;
  name: string;
  resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  variableCollectionId: string;
  valuesByMode: Record<string, unknown>;
};

export type FigmaVariableCollection = {
  id: string;
  name: string;
  defaultModeId: string;
  modes: { modeId: string; name: string }[];
};

export type FigmaVariablesResponse = {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
};

export type FigmaImagesResponse = { err: string | null; images: Record<string, string | null> };

export type FigmaMe = { id: string; email?: string; handle: string; img_url?: string };
