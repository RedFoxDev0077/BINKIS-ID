import { cookies } from 'next/headers';
import { en } from './en.ts';
import { es } from './es.ts';

/**
 * Language layer.
 *
 * Locale is NOT in the URL, deliberately.
 *
 * The passport address is https://id.binkis.com/p/{token} and it is printed
 * inside 137,000 holograms. A locale segment would either have to be chosen
 * at print time, freezing every physical piece to one language forever, or
 * be added by a redirect, which costs a round trip on the one page that has
 * to be fast on a phone in a shop. So locale comes from an explicit cookie
 * and the printed URL stays untouched.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * English first, and the browser's own preference is deliberately ignored.
 *
 * Asked for by the client on 10 November 2026: "cuando esté en inglés abra en
 * inglés y lo puedan abrir al español. Porque acá la gente es malinchista y
 * queremos piensen es una compañía extranjera." Whether that is the right read
 * of his market is his call; it is a brand decision, not a technical one.
 *
 * IT ONLY WORKS BECAUSE ACCEPT-LANGUAGE SNIFFING IS GONE, and that removal is
 * the whole substance of the change. Nearly every visitor he is describing is
 * on a phone that sends `es-MX`, so a chain of cookie, then browser, then
 * default handed them Spanish at the second step and never reached this
 * constant. Flipping the constant alone would have changed nothing for exactly
 * the audience it was flipped for.
 *
 * The cost is real and worth stating plainly: a genuinely Spanish-speaking
 * visitor now lands in English and has to press ES. That is the trade he
 * chose, and the toggle sits in the header of every page.
 */
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'binkis_locale';

const DICTIONARIES = { en, es } as const;
export type Dictionary = typeof en;

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  // No Accept-Language branch, on purpose. See DEFAULT_LOCALE above: honouring
  // the browser here would silently defeat the decision made there, because
  // the visitors it is aimed at are the ones whose browsers say Spanish.
  return DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export async function getTranslations(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}

/** Interpolates {name} placeholders. Kept trivial on purpose. */
export { fill } from './fill.ts';
