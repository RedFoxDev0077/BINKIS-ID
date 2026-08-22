import { createMatrix, getModule, setModule, versionForSize, type BitMatrix } from './matrix.ts';

export interface SvgOptions {
  /** Size of one module in SVG user units. */
  moduleSize?: number;
  /** Quiet zone in modules. The spec requires 4; going below that breaks scanners. */
  quietZone?: number;
  dark?: string;
  light?: string;
  title?: string;
}

const DEFAULTS = {
  moduleSize: 8,
  quietZone: 4,
  dark: '#000000',
  light: '#FFFFFF',
} as const;

/**
 * Render a module matrix to SVG.
 *
 * One <rect> per dark module, on an explicit light background. Not a single
 * merged <path>, deliberately: individual rects survive being opened, scaled
 * and re-exported by whatever the factory's prepress software is, and they
 * let the verification pass sample the artwork geometrically instead of
 * trusting metadata we wrote ourselves.
 */
export function renderQrSvg(matrix: BitMatrix, options: SvgOptions = {}): string {
  const moduleSize = options.moduleSize ?? DEFAULTS.moduleSize;
  const quietZone = options.quietZone ?? DEFAULTS.quietZone;
  const dark = options.dark ?? DEFAULTS.dark;
  const light = options.light ?? DEFAULTS.light;

  if (quietZone < 4) {
    throw new Error(
      `Quiet zone of ${quietZone} modules is below the 4 the QR spec requires. ` +
        'Scanners will fail on foil long before they fail on paper.',
    );
  }

  const extent = (matrix.size + quietZone * 2) * moduleSize;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
      `viewBox="0 0 ${extent} ${extent}" width="${extent}" height="${extent}" ` +
      `shape-rendering="crispEdges">`,
  );
  if (options.title) {
    parts.push(`<title>${escapeXml(options.title)}</title>`);
  }
  parts.push(`<rect x="0" y="0" width="${extent}" height="${extent}" fill="${light}"/>`);

  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!getModule(matrix, row, col)) continue;
      const x = (col + quietZone) * moduleSize;
      const y = (row + quietZone) * moduleSize;
      parts.push(
        `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${dark}"/>`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

const RECT_PATTERN = /<rect\b[^>]*\/?>/g;
const ATTR_PATTERN = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

/**
 * Recover a module matrix from rendered SVG, geometrically.
 *
 * This reads the artwork the way a scanner does rather than the way the
 * renderer wrote it: it takes the dark rectangles, infers the module pitch and
 * origin from their geometry alone, then samples the centre of each module
 * cell for containment. Nothing here trusts a data attribute or the order the
 * rects were emitted in, so a rendering bug - wrong offset, wrong scale, a
 * flipped axis, a dropped quiet zone - shows up as a decode failure instead of
 * cancelling itself out.
 */
export function parseQrSvg(svg: string): BitMatrix {
  const background = findBackgroundFill(svg);
  const rects: Rect[] = [];

  for (const match of svg.matchAll(RECT_PATTERN)) {
    const attrs = new Map<string, string>();
    for (const attr of match[0].matchAll(ATTR_PATTERN)) {
      attrs.set(attr[1]!, attr[2]!);
    }
    const rect: Rect = {
      x: Number(attrs.get('x') ?? 0),
      y: Number(attrs.get('y') ?? 0),
      width: Number(attrs.get('width') ?? 0),
      height: Number(attrs.get('height') ?? 0),
      fill: (attrs.get('fill') ?? '').toLowerCase(),
    };
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.fill === background) continue;
    rects.push(rect);
  }

  if (rects.length === 0) {
    throw new Error('SVG contains no dark modules');
  }

  // The module pitch is the size of the smallest dark rectangle: every dark
  // module is drawn as exactly one unit square.
  let moduleSize = Infinity;
  for (const rect of rects) {
    moduleSize = Math.min(moduleSize, rect.width, rect.height);
  }
  if (!Number.isFinite(moduleSize) || moduleSize <= 0) {
    throw new Error('Could not infer a module size from the SVG');
  }

  // The finder patterns pin the symbol to its own top-left corner, so the
  // extreme dark coordinates are the symbol bounds. The quiet zone falls out.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  const widthInModules = Math.round((maxX - minX) / moduleSize);
  const heightInModules = Math.round((maxY - minY) / moduleSize);
  if (widthInModules !== heightInModules) {
    throw new Error(
      `SVG symbol is ${widthInModules}x${heightInModules} modules; a QR symbol is square`,
    );
  }

  const size = widthInModules;
  versionForSize(size); // throws if this is not a real QR size

  const matrix = createMatrix(size);

  // Sample the centre of each module cell against the rectangles.
  const cells = new Map<string, true>();
  for (const rect of rects) {
    const startCol = Math.round((rect.x - minX) / moduleSize);
    const startRow = Math.round((rect.y - minY) / moduleSize);
    const spanCols = Math.round(rect.width / moduleSize);
    const spanRows = Math.round(rect.height / moduleSize);
    for (let r = 0; r < spanRows; r++) {
      for (let c = 0; c < spanCols; c++) {
        cells.set(`${startRow + r},${startCol + c}`, true);
      }
    }
  }

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      setModule(matrix, row, col, cells.has(`${row},${col}`) ? 1 : 0);
    }
  }

  return matrix;
}

function findBackgroundFill(svg: string): string {
  // The first rect covers the whole viewBox and is the light background.
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  if (!viewBox) return '#ffffff';
  const extent = Number(viewBox[1]);

  for (const match of svg.matchAll(RECT_PATTERN)) {
    const attrs = new Map<string, string>();
    for (const attr of match[0].matchAll(ATTR_PATTERN)) attrs.set(attr[1]!, attr[2]!);
    if (Number(attrs.get('width')) === extent && Number(attrs.get('height')) === extent) {
      return (attrs.get('fill') ?? '#ffffff').toLowerCase();
    }
  }
  return '#ffffff';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
