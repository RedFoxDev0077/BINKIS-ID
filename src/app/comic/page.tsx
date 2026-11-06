import { notFound, redirect } from 'next/navigation';
import { getTranslations } from '@/lib/i18n';
import { chapterHref, firstReadable } from '@/lib/comics/catalog';

/**
 * /comic exists only to get out of the way.
 *
 * The client was explicit on 6 November 2026: one tap should land on the
 * reading, not on a presentation page that asks for a second tap to begin.
 * So this resolves the first readable chapter in the visitor's language and
 * redirects. There is no landing page to maintain and no second decision to
 * make.
 *
 * With nothing readable it is a real 404 rather than a "coming soon", because
 * the promo block that links here hides itself in exactly the same condition:
 * if this page is reachable at all, something is wrong, and a styled apology
 * would hide that.
 */
export default async function ComicEntry() {
  const { locale } = await getTranslations();
  const opening = firstReadable(locale);
  if (!opening) notFound();
  redirect(chapterHref(opening.comic, opening.chapter) as never);
}
