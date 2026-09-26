'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The character animation on the passport hero.
 *
 * Renders the poster first and only fetches the clip after mount, for two
 * reasons. The visitor has just scanned a hologram in a shop, so the first
 * thing on screen should be the character, not a loading frame; and someone
 * who asked their system for reduced motion never downloads the video at all.
 *
 * Silent, looping and decorative: the character's name is already on the page,
 * so this is aria-hidden rather than described twice.
 */
export function CharacterAnimation({
  video,
  poster,
  alt,
}: {
  video: string;
  poster: string;
  alt: string;
}) {
  const [play, setPlay] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPlay(true);
  }, []);

  if (!play) {
    // eslint-disable-next-line @next/next/no-img-element -- poster frame, already sized
    return <img src={poster} alt={alt} className="h-full w-full object-cover" />;
  }

  return (
    <video
      ref={ref}
      src={video}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      // A clip that fails to load leaves its own poster on screen, which is
      // the still we would have shown anyway.
      className="h-full w-full object-cover"
    />
  );
}
