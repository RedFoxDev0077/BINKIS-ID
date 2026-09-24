#!/usr/bin/env node
/**
 * Hologram artwork specification, drawn to scale.
 *
 * Produces a 50 x 20 mm SVG at 1:1, carrying a real QR from the batch and the
 * real claim-code geometry. The designer can open it, measure it, and place
 * their own artwork against it.
 *
 * A drawing rather than a list of numbers because the problem is dimensional:
 * the mockup we were sent is drawn at roughly 5:1, and the stated label is
 * 2.5:1. Everything looks comfortable at the wrong aspect ratio and nothing
 * fits at the right one. Numbers in a message do not make that obvious. A
 * template at 1:1 does.
 *
 *   node scripts/artwork-spec.ts > artwork/binkis-hologram-60x20.svg
 *   node scripts/artwork-spec.ts --width 60 --qr 10 --code-pt 8
 *
 * The label, the QR and the claim code size are all options, because the two
 * of them trade against each other inside a fixed width and the only honest
 * way to answer "can the scratch panel be bigger" is to draw it and see what
 * is left for the serial. The summary says what each choice costs.
 */

import { parseArgs } from 'node:util';

import { encodeQr } from '../src/lib/qr/encode.ts';
import { qrPayload } from '../src/lib/codes/qr-token.ts';
import { getModule } from '../src/lib/qr/matrix.ts';

const { values } = parseArgs({
  options: {
    width: { type: 'string', default: '60' },
    height: { type: 'string', default: '20' },
    qr: { type: 'string', default: '10' },
    'code-pt': { type: 'string', default: '8' },
    layout: { type: 'string', default: 'row' },
  },
});

// ---------------------------------------------------------------------------
// Geometry, all in millimetres.
// ---------------------------------------------------------------------------

const LABEL_W = Number(values.width);
const LABEL_H = Number(values.height);
const MARGIN = 1.0;

/**
 * QR symbol size.
 *
 * Our payload is 36 characters, which is a version 3 symbol: 29 x 29 modules.
 * At 8 mm each module is 0.276 mm, which is the factory's own stated minimum
 * and leaves no margin for foil. At 9 mm it is 0.310 mm and comfortable.
 *
 * 8 mm is what actually fits beside a 13.2 mm code panel inside 50 mm. If the
 * label can grow to 55 mm the QR goes to 9 mm, and that is the single change
 * that most improves scanning off holographic foil.
 */
const QR_SYMBOL = Number(values.qr);
const QUIET_MODULES = 4; // required by ISO/IEC 18004; scanners fail without it

/**
 * XXX-XXX-XXX at CODE_PT monospace: 11 glyphs at ~0.6 em advance.
 *
 * 5 pt was what fitted on the 50 mm label, and the first physical run proved
 * it too small: the client could not read his own code with glasses on, and
 * the foil tore before the whole code was uncovered. A code that cannot be
 * read is a piece that cannot be claimed, so the panel is now sized first and
 * the rest of the label works around it.
 */
const CODE_PT = Number(values['code-pt']);
const CODE_GLYPHS = 11;
const CODE_TEXT_W = CODE_GLYPHS * CODE_PT * 0.352778 * 0.6; // 11.64 mm
const PANEL_W = CODE_TEXT_W + 1.6;

/**
 * Panel height scales with the code, with a floor.
 *
 * The panel is not just a box around the text: it is the area a thumbnail has
 * to scrape. Too shallow and the scratching runs off the top of the code and
 * takes a character with it, which is what happened on the first run.
 */
const PANEL_H = Math.max(5.0, CODE_PT * 0.352778 * 2.4);

const TOKEN = 'G55JT7ECRC4P'; // a real token from batch B-2026-01
const payload = qrPayload(TOKEN, 'https://id.binkis.com');
const qr = encodeQr(payload, 'M');

const modulePx = QR_SYMBOL / qr.matrix.size;
const quiet = QUIET_MODULES * modulePx;
const patch = QR_SYMBOL + 2 * quiet;

// Column layout, left to right.
const logoW = 9.5;
const gap = 0.4;
/**
 * Two ways to arrange the right-hand side.
 *
 * "row" puts logo, serial, QR and claim panel in four columns. It is what the
 * first run used, and inside 60 mm it forces a choice: a serial big enough to
 * be the hero leaves the claim code at about 4 pt, which is the size that just
 * failed in the client's hands.
 *
 * "stacked" puts the QR above the claim panel in one column. The column is as
 * wide as the panel and about 18 mm tall, so it fits the label height, and it
 * hands the width it saves back to the serial. That is the whole trade: the
 * serial and the code are both fighting for the same 60 mm, and only one of
 * them has to be on the same line as the QR.
 */
const STACKED = values.layout === 'stacked';
const columnW = STACKED ? Math.max(PANEL_W, patch) : 0;

const centreW = STACKED
  ? LABEL_W - 2 * MARGIN - logoW - columnW - 2 * gap
  : LABEL_W - 2 * MARGIN - logoW - patch - PANEL_W - 3 * gap;

const xLogo = MARGIN;
const xCentre = xLogo + logoW + gap;
const xPatch = STACKED
  ? LABEL_W - MARGIN - columnW + (columnW - patch) / 2
  : xCentre + centreW + gap;
const xPanel = STACKED
  ? LABEL_W - MARGIN - columnW + (columnW - PANEL_W) / 2
  : xPatch + patch + gap;

const stackGap = 0.5;
const stackH = patch + stackGap + PANEL_H;
const yPatch = STACKED ? (LABEL_H - stackH) / 2 : (LABEL_H - patch) / 2;
const yPanel = STACKED ? yPatch + patch + stackGap : LABEL_H - MARGIN - PANEL_H - 1.2;

if (STACKED && stackH > LABEL_H - 2 * MARGIN) {
  console.error(
    `
  WARNING: the stacked column is ${stackH.toFixed(2)} mm tall and only ` +
      `${(LABEL_H - 2 * MARGIN).toFixed(2)} mm fit inside the safe area.` +
      `
  Drop the QR a millimetre or the code a point.
`,
  );
}

// ---------------------------------------------------------------------------

const parts: string[] = [];
const push = (s: string) => parts.push(s);

push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LABEL_W}mm" height="${LABEL_H}mm" ` +
    `viewBox="0 0 ${LABEL_W} ${LABEL_H}" shape-rendering="geometricPrecision">`,
);
push(`<title>BINKIS ID hologram, 50 x 20 mm, 1:1</title>`);
push(`<desc>Payload ${payload}. QR version ${qr.version}, ${qr.matrix.size}x${qr.matrix.size} modules, ` +
  `${QR_SYMBOL}mm symbol, ${modulePx.toFixed(3)}mm module, ${quiet.toFixed(2)}mm quiet zone.</desc>`);

// Label body and trim.
push(`<rect x="0" y="0" width="${LABEL_W}" height="${LABEL_H}" rx="1.6" fill="#EDEDF2"/>`);
push(
  `<rect x="0.1" y="0.1" width="${LABEL_W - 0.2}" height="${LABEL_H - 0.2}" rx="1.5" ` +
    `fill="none" stroke="#B9BCC8" stroke-width="0.12"/>`,
);

// Safe area.
push(
  `<rect x="${MARGIN}" y="${MARGIN}" width="${LABEL_W - 2 * MARGIN}" height="${LABEL_H - 2 * MARGIN}" ` +
    `fill="none" stroke="#8E93A6" stroke-width="0.08" stroke-dasharray="0.5 0.4"/>`,
);

// --- logo block ---
push(
  `<rect x="${xLogo}" y="${MARGIN + 0.6}" width="${logoW}" height="${LABEL_H - 2 * MARGIN - 1.2}" ` +
    `fill="none" stroke="#C6021E" stroke-width="0.1" stroke-dasharray="0.4 0.3"/>`,
);
push(
  `<text x="${xLogo + logoW / 2}" y="${LABEL_H / 2}" font-family="Helvetica,Arial" font-size="1.5" ` +
    `font-weight="700" fill="#2A2D38" text-anchor="middle">LOGO</text>`,
);

// --- centre block: certificate text and the serial ---
push(
  `<text x="${xCentre + centreW / 2}" y="${MARGIN + 2.4}" font-family="Helvetica,Arial" font-size="1.7" ` +
    `font-weight="700" fill="#15171E" text-anchor="middle" letter-spacing="0.05">BINKIS ID</text>`,
);
push(
  `<text x="${xCentre + centreW / 2}" y="${MARGIN + 4.2}" font-family="Helvetica,Arial" font-size="1.0" ` +
    `fill="#4A4E5C" text-anchor="middle" letter-spacing="0.08">BIRTH CERTIFICATE</text>`,
);
// The serial is the piece's name. Boxed, monospaced, largest thing here.
push(
  `<rect x="${xCentre + 0.4}" y="${MARGIN + 5.2}" width="${centreW - 0.8}" height="3.6" rx="0.8" ` +
    `fill="#FFFFFF" stroke="#7C8henry" stroke-width="0.1"/>`.replace('#7C8henry', '#7C8196'),
);
push(
  `<text x="${xCentre + centreW / 2}" y="${MARGIN + 7.7}" font-family="Courier New,monospace" ` +
    `font-size="2.7" font-weight="700" fill="#15171E" text-anchor="middle">SP-000001</text>`,
);
push(
  `<text x="${xCentre + centreW / 2}" y="${MARGIN + 10.6}" font-family="Helvetica,Arial" font-size="0.95" ` +
    `fill="#4A4E5C" text-anchor="middle" letter-spacing="0.06">SERIES 01 &#183; EST. 2026</text>`,
);

// --- QR: white patch, quiet zone, then the symbol ---
push(`<rect x="${xPatch}" y="${yPatch}" width="${patch}" height="${patch}" rx="0.6" fill="#FFFFFF"/>`);

const modules: string[] = [];
for (let r = 0; r < qr.matrix.size; r++) {
  for (let c = 0; c < qr.matrix.size; c++) {
    if (!getModule(qr.matrix, r, c)) continue;
    const x = xPatch + quiet + c * modulePx;
    const y = yPatch + quiet + r * modulePx;
    modules.push(
      `M${x.toFixed(4)} ${y.toFixed(4)}h${modulePx.toFixed(4)}v${modulePx.toFixed(4)}h-${modulePx.toFixed(4)}z`,
    );
  }
}
push(`<path d="${modules.join('')}" fill="#000000"/>`);

// Quiet-zone boundary, for measuring. Not printed.
push(
  `<rect x="${xPatch + quiet}" y="${yPatch + quiet}" width="${QR_SYMBOL}" height="${QR_SYMBOL}" ` +
    `fill="none" stroke="#0091FF" stroke-width="0.07" stroke-dasharray="0.3 0.25"/>`,
);

// --- claim code panel ---
if (STACKED) {
  // One thin strip, because the stacked column has no room for two lines.
  push(
    `<text x="${xPanel + PANEL_W / 2}" y="${yPanel - 0.9}" font-family="Helvetica,Arial" ` +
      `font-size="1.05" font-weight="700" fill="#15171E" text-anchor="middle" ` +
      `letter-spacing="0.06">SCRATCH HERE</text>`,
  );
} else {
  push(
    `<text x="${xPanel + PANEL_W / 2}" y="${MARGIN + 3.6}" font-family="Helvetica,Arial" font-size="1.15" ` +
      `font-weight="700" fill="#15171E" text-anchor="middle" letter-spacing="0.06">CLAIM CODE</text>`,
  );
  push(
    `<text x="${xPanel + PANEL_W / 2}" y="${MARGIN + 5.2}" font-family="Helvetica,Arial" font-size="0.85" ` +
      `fill="#4A4E5C" text-anchor="middle" letter-spacing="0.05">SCRATCH TO REVEAL</text>`,
  );
}
push(
  `<rect x="${xPanel}" y="${yPanel}" width="${PANEL_W}" height="${PANEL_H}" rx="0.7" ` +
    `fill="#FFFFFF" stroke="#7C8196" stroke-width="0.1"/>`,
);
push(
  `<text x="${xPanel + PANEL_W / 2}" y="${yPanel + PANEL_H / 2 + 0.62}" font-family="Courier New,monospace" ` +
    `font-size="${CODE_PT * 0.352778}" font-weight="700" fill="#15171E" text-anchor="middle" ` +
    `letter-spacing="0.02">XXX-XXX-XXX</text>`,
);
// Scratch coverage, which must be larger than the text box.
push(
  `<rect x="${xPanel - 0.3}" y="${yPanel - 0.3}" width="${PANEL_W + 0.6}" height="${PANEL_H + 0.6}" rx="0.9" ` +
    `fill="none" stroke="#C6021E" stroke-width="0.1" stroke-dasharray="0.4 0.3"/>`,
);

push('</svg>');

process.stdout.write(parts.join('\n') + '\n');

// Numbers to stderr so `> file.svg` still produces a clean SVG.
console.error(`
BINKIS ID hologram, ${LABEL_W} x ${LABEL_H} mm, drawn 1:1

  QR payload        ${payload}
                    ${payload.length} characters -> version ${qr.version}, ${qr.matrix.size} x ${qr.matrix.size} modules

  QR symbol         ${QR_SYMBOL.toFixed(2)} mm
  module size       ${modulePx.toFixed(3)} mm
  quiet zone        ${quiet.toFixed(2)} mm on all four sides, WHITE, nothing inside it
  white patch       ${patch.toFixed(2)} x ${patch.toFixed(2)} mm

  claim code        XXX-XXX-XXX, 9 characters, monospaced, ${CODE_PT} pt
  text width        ${CODE_TEXT_W.toFixed(2)} mm
  code box          ${PANEL_W.toFixed(2)} x ${PANEL_H.toFixed(2)} mm
  scratch coverage  ${(PANEL_W + 0.6).toFixed(2)} x ${(PANEL_H + 0.6).toFixed(2)} mm, larger than the box

  layout            ${STACKED ? 'stacked: QR above the claim panel, one column' : 'row: four columns'}
  columns           ${
    STACKED
      ? `logo ${logoW} | serial ${centreW.toFixed(2)} | QR+code ${columnW.toFixed(2)}`
      : `logo ${logoW} | serial ${centreW.toFixed(2)} | QR ${patch.toFixed(2)} | code ${PANEL_W.toFixed(2)}`
  }
  margins           ${MARGIN.toFixed(1)} mm, plus ${gap} mm between columns
${
  centreW < 12
    ? `
  WARNING: only ${centreW.toFixed(2)} mm left for the serial. It is the hero of the` +
      `
  label, so either widen the label or take a point off the claim code.
`
    : ''
}${
  modulePx < 0.3
    ? `
  WARNING: ${modulePx.toFixed(3)} mm modules. Below 0.30 mm scanning off holographic` +
      `
  foil gets unreliable. Give the QR another millimetre.
`
    : ''
}`);
