'use client';

import { useState } from 'react';

/**
 * Share this page.
 *
 * A client component because sharing is an interaction and there is no way to
 * do it from the server, but a small one: it holds one boolean and reads
 * window.location, and the reader stays a server component around it.
 *
 * Two behaviours, not one. On a phone navigator.share opens the real OS share
 * sheet, which is what the client is actually asking for - WhatsApp, Messages,
 * whatever he uses - and it is the only way to reach those apps from a web
 * page. On a desktop browser that has no share sheet it copies the link
 * instead and says so, rather than showing a button that does nothing.
 *
 * A cancelled share is not a failure. Dismissing the sheet rejects the promise
 * with AbortError, and treating that as "sharing is broken, copy instead"
 * would quietly put something on the clipboard that the person just decided
 * not to send. So AbortError returns and anything else falls back.
 */
export function ShareButton({
  title,
  label,
  copiedLabel,
  busyLabel,
  url,
  text,
  file,
  className = '',
}: {
  title: string;
  label: string;
  copiedLabel: string;
  /** Shown while a file is being fetched. Falls back to the plain label. */
  busyLabel?: string;
  /** What to send. Defaults to the page the button is on. */
  url?: string;
  /** A line above the link, for the sheet that shows one. */
  text?: string;
  /**
   * An attachment to send instead of a bare link, built on demand.
   *
   * A function rather than a File, because building one means downloading it,
   * and that must not happen on a page the collector may never share from.
   * Returning null means "could not build it", and the link goes alone.
   */
  file?: () => Promise<File | null>;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function share() {
    const target = url ?? window.location.href;
    // Both in one string. A sheet that takes `url` shows it as a link, but
    // the ones that take a file mostly drop every other field, and a clip
    // arriving with no way back to the site is a dead end.
    const body = text ? `${text}\n${target}` : target;

    if (file) {
      setBusy(true);
      try {
        const attachment = await file();
        if (attachment && navigator.canShare?.({ files: [attachment] })) {
          try {
            await navigator.share({ files: [attachment], text: body, title });
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            // Anything else: fall through to sharing the link on its own,
            // which is still better than telling them it failed.
          }
        }
      } catch {
        // Offline, or the file moved. The link below still works.
      } finally {
        setBusy(false);
      }
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url: target });
        return;
      } catch (error) {
        // They opened the sheet and changed their mind. Nothing to repair.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // No share sheet and no clipboard permission. Rather than fail silently,
      // select the address bar's job for them: nothing sensible is left, so
      // leave the button unchanged instead of claiming success.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className={`press inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-ink-700 px-6 text-base font-semibold text-ink-100 transition hover:border-ink-600 hover:text-white disabled:opacity-60 ${className}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v13M12 3L8 7M12 3l4 4" />
        <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
      </svg>
      {/* The label swaps to a confirmation rather than a toast appearing
          somewhere else on the page: the finger is already here. aria-live
          announces it for a screen reader, which otherwise gets no signal
          that anything happened at all. */}
      <span aria-live="polite">{copied ? copiedLabel : busy ? (busyLabel ?? label) : label}</span>
    </button>
  );
}
