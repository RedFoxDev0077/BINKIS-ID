'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The matched-set film, with the collector's own number drawn over it.
 *
 * The client asked whether the animator could render the number into the
 * video, one version per collection. He could not, and he should not: there
 * are 777 numbers in a Limited run and the Classic run goes to 30,000, so
 * that is a render farm's worth of files to produce a line of text. The video
 * is rendered once with the space under the logo left empty, and the number is
 * drawn here, in the same face and the same gold as the logo it sits under.
 *
 * Every measurement below is the animator's, and every one of them is relative
 * to the video rather than to the screen, so the number lands in the same
 * place whatever size the box ends up. They are in globals.css under
 * `.celebracion`; what this component owns is only the timing.
 */

/** When the number joins the logo, in seconds. Never before 21.0. */
const ENTERS_AT = 22.0;

export function MatchedSetVideo({
  src,
  number,
  label,
}: {
  src: string;
  /**
   * Already padded: this draws exactly what it is given.
   *
   * Null for the eight-different-numbers film, which has no single number to
   * show. That is the whole difference between the two films, so the overlay
   * is skipped rather than filled with a zero.
   */
  number: string | null;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showNumber, setShowNumber] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reduced motion: no 24 seconds of camera move. The last frame is the
    // signature with the number under it, which is the part worth seeing.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShowNumber(number !== null);
      video.currentTime = video.duration || ENTERS_AT;
      return;
    }

    // currentTime is polled rather than watched through timeupdate, which
    // fires about four times a second: a quarter of a second late is visible
    // when the number is supposed to land with the logo.
    let frame = 0;
    const watch = () => {
      setShowNumber(number !== null && video.currentTime >= ENTERS_AT);
      if (!video.ended) frame = requestAnimationFrame(watch);
    };
    frame = requestAnimationFrame(watch);

    // Muted, because a browser blocks a video that asks for sound without a
    // gesture, and being blocked would cost the whole animation rather than
    // just its soundtrack.
    video.play().catch(() => {
      // Autoplay refused anyway: leave the number showing so there is
      // something to look at.
      setShowNumber(number !== null);
    });

    return () => cancelAnimationFrame(frame);
  }, [number]);

  // A file that will not load. The number alone is still worth showing;
  // without one there is nothing here and the banner already says it.
  if (failed) {
    if (number === null) return null;
    return (
      <p className="mono py-10 text-center text-6xl leading-none text-white">{number}</p>
    );
  }

  return (
    <div className="celebracion overflow-hidden rounded-2xl bg-ink-950">
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        aria-label={label}
        onError={() => setFailed(true)}
        onEnded={() => setShowNumber(number !== null)}
      />
      {/* aria-hidden: the number is already in the dialog's own heading, and
          a screen reader should not hear it twice. */}
      {number === null ? null : (
        <span className="cl-numero" data-visible={showNumber ? '1' : '0'} aria-hidden>
          N° {number}
        </span>
      )}
    </div>
  );
}
