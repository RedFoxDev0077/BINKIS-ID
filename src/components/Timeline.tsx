import type { PublicEvent } from '@/lib/passport';
import type { Dictionary } from '@/lib/i18n';

/**
 * The passport timeline.
 *
 * A vertical rail with typed icons and sequence numbers. Verified provenance
 * is the valuable thing here, so it is presented as a record rather than a
 * feed: every entry numbered, in order, nothing editable.
 *
 * Event types are strings, not an enum, so an eighth type needs no schema
 * change. Anything unrecognised still renders, with a neutral icon, rather
 * than breaking the page.
 */
const ICONS: Record<string, string> = {
  BORN: 'M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z',
  CLAIMED: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
  TRANSFERRED: 'M4 9h12l-3.3-3.3L14.1 4.3 19.8 10l-5.7 5.7-1.4-1.4L16 11H4V9z',
  MILESTONE: 'M5 3h14v2l-4 4 4 4v2H5v-2l4-4-4-4V3z',
  OFFICIAL_EVENT: 'M12 2l7 4v6c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6l7-4z',
  VERIFICATION: 'M12 1l9 4v6c0 5-3.8 9.7-9 11-5.2-1.3-9-6-9-11V5l9-4zm-1 14l6-6-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z',
  VOIDED: 'M12 2a10 10 0 100 20 10 10 0 000-20zM4.9 12a7.1 7.1 0 0111.2-5.8L6.2 16.1A7 7 0 014.9 12zm7.1 7.1c-1.5 0-2.9-.5-4-1.3L17.8 7.9a7.1 7.1 0 01-5.8 11.2z',
  DEFAULT: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
};

const ACCENT: Record<string, string> = {
  CLAIMED: 'text-accent',
  VERIFICATION: 'text-verified',
  VOIDED: 'text-danger',
};

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-MX' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function Timeline({
  events,
  t,
  locale,
}: {
  events: PublicEvent[];
  t: Dictionary;
  locale: string;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-500">{t.passport.historyEmpty}</p>;
  }

  return (
    <ol className="relative stagger">
      {/* The rail. Stops short of the last marker so the record reads as
          complete-so-far rather than trailing off. */}
      <span
        aria-hidden
        className="absolute left-[15px] top-3 bottom-6 w-px bg-gradient-to-b from-ink-700 via-ink-800 to-transparent"
      />
      {events.map((event, index) => {
        const label = t.events[event.type as keyof typeof t.events] ?? event.type;
        return (
          <li
            key={event.seq}
            className="relative flex gap-4 pb-7 last:pb-0"
            style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
          >
            <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-ink-700 bg-ink-900">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className={`size-4 ${ACCENT[event.type] ?? 'text-ink-400'}`}
                fill="currentColor"
              >
                <path d={ICONS[event.type] ?? ICONS.DEFAULT} />
              </svg>
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              {/* Date as a pill on the rail, so the eye can scan the timeline
                  by when rather than by reading each title. */}
              <div className="flex flex-wrap items-center gap-2">
                <time
                  dateTime={event.occurredAt.toISOString()}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    ACCENT[event.type]
                      ? 'border border-current/30 bg-current/10 ' + ACCENT[event.type]
                      : 'border border-ink-700 bg-ink-850 text-ink-400'
                  }`}
                >
                  {formatDate(event.occurredAt, locale)}
                </time>
                <span className="mono text-[11px] uppercase tracking-[0.14em] text-ink-600">
                  #{String(event.seq).padStart(2, '0')} · {label}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-semibold text-ink-50">{event.title}</h3>
              {event.body ? (
                <p className="mt-1 text-sm leading-relaxed text-ink-400">{event.body}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
