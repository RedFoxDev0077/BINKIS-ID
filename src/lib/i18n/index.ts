import { cookies, headers } from 'next/headers';
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
 * to be fast on a phone in a shop. So locale comes from an explicit cookie,
 * falling back to Accept-Language, and the printed URL stays untouched.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

// Spanish first: the client is in Mexico and so are the first collectors.
export const DEFAULT_LOCALE: Locale = 'es';
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

  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
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
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
