'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
// Type-only, so this client component never pulls the i18n entry point's
// cookies() and headers() into the browser bundle. See fill.ts for the same
// problem solved the other way.
import type { Locale } from '@/lib/i18n';

/**
 * Language toggle.
 *
 * Writes a cookie and refreshes, rather than navigating to a locale-prefixed
 * URL. The passport address is printed inside 137,000 holograms and cannot
 * carry a /es/ segment, so locale lives in a cookie for the whole site rather
 * than only for the pages where a prefix would have been harmless.
 *
 * A SEGMENTED CONTROL, NOT A ONE-WORD BUTTON, since 12 November 2026. It was
 * a bordered "ES" in muted grey, and the client circled it on his own phone:
 * "casi no se nota boton para traducir. Podriamos ponerle. Espanol. Ingles.
 * Fondo color acua igual que coleccion". Both of his asks are in here, and
 * both are improvements rather than taste:
 *
 * NAMING BOTH LANGUAGES REMOVES A REAL AMBIGUITY. A single button reading
 * "ES" has to be guessed at: it can mean "this page is Spanish" or "press for
 * Spanish", and the two readings send a visitor opposite ways. Showing both
 * with the current one filled says which language you are in and which you
 * would get, in one glance and with nothing to learn.
 *
 * THE NAMES ARE ENDONYMS AND DO NOT TRANSLATE. "Espanol" and "English", in
 * both interfaces, never "Spanish" or "Ingles". Someone hunting for their own
 * language scans for the word as they write it, and that word is the one piece
 * of this interface they are guaranteed to recognise before they can read the
 * rest of it. It is also what the client is after elsewhere: the English
 * reader is never shown the Spanish word for their own language.
 *
 * THE ACCENT IS ON THE ACTIVE HALF ONLY. He asked for the aqua of "Mi
 * coleccion", and a second pill that solid would have been a second call to
 * action competing with it in a header that is already four items wide on a
 * phone. Filling one half carries the colour he wanted, marks the state, and
 * leaves the collection button the loudest thing up there, which is the order
 * he set when he asked for that button.
 *
 * AND IT IS MARKED notranslate, WHICH IS THE WHOLE POINT OF THE TWO LINES
 * BELOW. The client photographed this control reading "Espanol | Espanol" on
 * 12 November 2026 and asked for one of them to say "Ingles". The server was
 * sending the right two words: his browser was translating the page into
 * Spanish and rewrote "English" along with everything else. His own screenshot
 * proves it twice over, because the nav beside it read "Mi coleccion" while
 * the active half was English, and the English page has never sent that.
 *
 * A language switcher is the one piece of furniture on a page that a machine
 * translator must not touch. Translating it destroys the only thing it is for:
 * the name of the language you are not reading, written so that someone who
 * cannot read this page recognises it. Marked here rather than fixed by
 * renaming the buttons, because renaming them would have left the next
 * translated visitor seeing two of whatever word their translator preferred.
 */

/**
 * Every language, named in itself. A Record rather than a lookup with a
 * fallback, so adding a locale to LOCALES is a compile error here until it has
 * a name: a language that reached the toggle unnamed would render as a blank
 * half of a two-part control.
 */
const ENDONYM: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

// Spanish first, which is the order he reads them in and the order he asked
// for. Declared rather than imported from the i18n entry point, which is
// server-only; ENDONYM above is what keeps the set honest.
const ORDER: readonly Locale[] = ['es', 'en'];

export function LocaleSwitch({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === current) return;
    document.cookie = `binkis_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      // Labelled in English because the label names the control, not a
      // language, and a screen reader user who has not switched yet is in the
      // English interface by definition.
      aria-label="Language"
      role="group"
      // Both forms on purpose: the attribute is the HTML standard one, the
      // class is what Google's page translator has always honoured, and the
      // client is reading this site through exactly that translator.
      translate="no"
      className="notranslate ml-1 flex shrink-0 items-center rounded-lg bg-ink-900 p-0.5 ring-1 ring-ink-800"
    >
      {ORDER.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            disabled={pending}
            aria-pressed={active}
            onClick={() => choose(loc)}
            /* 11px and tight on phones, stepping up at sm. Measured, not
               chosen: at the full size this control is 125px wide, and on a
               360px screen that squeezed "Mi coleccion" into two lines and
               made the client's own main button twice as tall. At 85px the
               pill is back on one line with both language names still spelt
               out, which is the thing he asked for. The vertical padding does
               not step down with the type, so the tap target stays the size
               of the button this replaced. */
            className={`press rounded-[7px] px-1.5 py-2 text-[11px] font-semibold transition disabled:opacity-50 sm:px-2.5 sm:py-1.5 sm:text-[13px] ${
              active
                ? 'bg-accent text-ink-950'
                : 'text-ink-400 hover:bg-ink-850 hover:text-ink-100'
            }`}
          >
            {ENDONYM[loc]}
          </button>
        );
      })}
    </div>
  );
}
