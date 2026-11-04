import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDictionary } from '../../src/lib/i18n/index.ts';

/**
 * The claim tutorial names buttons that have to still exist.
 *
 * Delivered by the client's animator on 2 November 2026: a six-step guide
 * that sits under the register button and walks a collector through scratching
 * the hologram and typing the code. It is a good package, and it has one
 * structural weakness worth guarding.
 *
 * It carries its own copy of our wording rather than reading the dictionary.
 * That is a reasonable choice for a drop-in component, and it means the
 * tutorial says things like "toca «Registrar mi Binkis»" with that label
 * written out as a literal. Rename the button in es.ts and nothing breaks,
 * nothing fails, and the guide quietly instructs people to press something
 * that is not on the screen any more.
 *
 * Nobody would notice until a collector wrote in. So the agreement is checked
 * here instead: every label the tutorial puts in quotation marks must still be
 * a label the site actually uses.
 *
 * Fixing a failure means editing COPY in binkis-tutorial.js to match the new
 * wording. It does not mean reverting the dictionary.
 */

const TUTORIAL = resolve(process.cwd(), 'src/components/binkis-tutorial/binkis-tutorial.js');

/** Everything the tutorial quotes, and where that string comes from. */
const QUOTED = {
  es: [
    ['claim.submit', (t: ReturnType<typeof getDictionary>) => t.claim.submit],
    ['claim.codeLabel', (t: ReturnType<typeof getDictionary>) => t.claim.codeLabel],
    ['lookup.label', (t: ReturnType<typeof getDictionary>) => t.lookup.label],
    ['nav.collection', (t: ReturnType<typeof getDictionary>) => t.nav.collection],
    ['auth.submitSignUp', (t: ReturnType<typeof getDictionary>) => t.auth.submitSignUp],
  ],
  en: [
    ['claim.submit', (t: ReturnType<typeof getDictionary>) => t.claim.submit],
    ['claim.codeLabel', (t: ReturnType<typeof getDictionary>) => t.claim.codeLabel],
    ['claim.signInFirst', (t: ReturnType<typeof getDictionary>) => t.claim.signInFirst],
    ['auth.submitSignUp', (t: ReturnType<typeof getDictionary>) => t.auth.submitSignUp],
    ['auth.submitSignIn', (t: ReturnType<typeof getDictionary>) => t.auth.submitSignIn],
  ],
} as const;

const source = readFileSync(TUTORIAL, 'utf8');

describe('the tutorial quotes labels that still exist', () => {
  for (const [locale, entries] of Object.entries(QUOTED) as [
    'es' | 'en',
    (typeof QUOTED)['es'],
  ][]) {
    describe(locale, () => {
      const t = getDictionary(locale);

      for (const [key, read] of entries) {
        it(`still says ${key}`, () => {
          const label = read(t);
          expect(
            source.includes(label),
            `The tutorial quotes a label for ${key} that no longer matches the ` +
              `dictionary. es.ts/en.ts now says "${label}". Update COPY in ` +
              `src/components/binkis-tutorial/binkis-tutorial.js to match, or the ` +
              `guide will tell collectors to press a button that is not there.`,
          ).toBe(true);
        });
      }
    });
  }

  it('warns about the scratch panel that is not the hologram', () => {
    // Step 4 exists because the page has its own silver panel, and it only
    // uncovers the input. Someone who scratches the screen expecting a code
    // has misunderstood the product, so if that panel is ever removed this
    // warning becomes a lie and has to go with it.
    expect(getDictionary('es').claim.scratchTitle).toBeTruthy();
    expect(source).toMatch(/no\s+trae\s+tu\s+c[oó]digo/i);
  });
});

describe('what the tutorial must never do', () => {
  it('makes no network calls', () => {
    // It ships as a black box on the one page where a claim code is typed.
    // Nothing in it should ever talk to anything.
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/navigator\.sendBeacon/);
    expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('does not evaluate strings as code', () => {
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/new\s+Function\s*\(/);
  });

  it('touches storage only for its own "already seen" flag', () => {
    const keys = [...source.matchAll(/localStorage\.\w+\(([^)]*)\)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key, `localStorage key: ${key}`).toMatch(/storageKey|STORE_KEY/);
    }
    expect(source).not.toMatch(/document\.cookie/);
  });
});

describe('the launcher card', () => {
  /**
   * The package ships a small underlined link. The client asked on
   * 4 November 2026 for a full-width card above the register button, so the
   * launcher is now ours: src/components/ClaimGuideButton.tsx, with its own
   * two lines of copy in the dictionary.
   *
   * These cases exist because that card sits immediately above the one
   * button this screen is for. If its wording ever drifts into sounding like
   * the primary action, a collector taps help when they meant to register.
   */
  for (const locale of ['es', 'en'] as const) {
    const t = getDictionary(locale);

    it(`has both lines in ${locale}`, () => {
      expect(t.claim.guideTitle.length).toBeGreaterThan(10);
      expect(t.claim.guideCta.length).toBeGreaterThan(5);
    });

    it(`does not read like the register button in ${locale}`, () => {
      expect(t.claim.guideTitle).not.toBe(t.claim.submit);
      expect(t.claim.guideCta).not.toBe(t.claim.submit);
    });

    it(`names Aguila in ${locale}, because the character is the invitation`, () => {
      expect(t.claim.guideTitle.normalize('NFD').replace(/\p{M}/gu, '')).toMatch(/Aguila/i);
    });
  }
});
