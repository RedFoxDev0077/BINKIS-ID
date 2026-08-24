import Image from 'next/image';

/**
 * Full-bleed hero with a cinematic backdrop.
 *
 * The image sits behind a two-stop gradient scrim rather than being tinted
 * directly, so the headline keeps its contrast no matter how bright the
 * artwork behind it is. That matters here because the backdrop is meant to be
 * swappable: drop a real BINKIS photograph at public/art/hero.jpg and it takes
 * over with no code change and no contrast surprise.
 *
 * The shipped default is a procedural SVG, not stock photography. There is no
 * BINKIS artwork available yet, and putting a photograph of somebody else's
 * product on the client's landing page would be worse than a clean abstract.
 */
export function Hero({
  eyebrow,
  title,
  accent,
  subtitle,
  children,
  image = '/art/hero.svg',
  height = 'tall',
}: {
  eyebrow?: string;
  title: string;
  /** Rendered in the accent colour, after the title. */
  accent?: string;
  subtitle?: string;
  children?: React.ReactNode;
  image?: string;
  height?: 'tall' | 'short';
}) {
  return (
    <section
      className={`relative isolate flex items-center justify-center overflow-hidden ${
        height === 'tall' ? 'min-h-[76vh] py-24' : 'min-h-[46vh] py-16'
      }`}
    >
      <Image
        src={image}
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />

      {/* Scrim. Vertical for text contrast, plus a floor fade so the hero
          dissolves into the page instead of ending on a hard edge. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/72 via-ink-950/55 to-ink-950"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-ink-950 to-transparent"
      />

      <div className="stagger relative mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-accent/85">
            {eyebrow}
          </p>
        ) : null}

        <h1 className="mt-5 font-display text-6xl leading-[0.86] tracking-wide text-ink-50 sm:text-8xl">
          {title}
          {accent ? <span className="text-accent"> {accent}</span> : null}
        </h1>

        {subtitle ? (
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
            {subtitle}
          </p>
        ) : null}

        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </section>
  );
}
