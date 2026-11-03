"use client";

/* The "How do I register my Binki?" tutorial for the Next.js site.
 *
 * Place it under the "Register my Binkis" button of a piece nobody owns yet:
 *
 *   {claimable && <BinkisTutorial locale={t.locale} />}
 *
 * It renders the button where it is placed, opens by itself the first time
 * someone lands there, and cleans up after itself when the page goes away. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { BinkisTutorialApi, BinkisTutorialEventDetail } from "./binkis-tutorial";
import "./binkis-tutorial.css";

const LABEL = {
  es: "¿Cómo registro mi Binki?",
  en: "How do I register my Binki?",
};

// the core touches `document` as soon as it is evaluated, so it can only be
// loaded in the browser; this also keeps it out of the page's first bundle
const loadCore = (): Promise<BinkisTutorialApi> => import("./binkis-tutorial.js").then(() => window.BinkisTutorial);

type Props = {
  /** The page's language. Anything that does not start with "es" is English. */
  locale: string;
  /** Open by itself the first time on this browser. Default: true. */
  autoOpen?: boolean;
  /** Render the button. With false, open it from your own element with `data-binkis-tutorial`. Default: true. */
  showButton?: boolean;
  /** Class for the button. Default: the tutorial's own link style. */
  className?: string;
  /** Button content. Default: Águila's face and "How do I register my Binki?". */
  children?: ReactNode;
  /** Where `public/binkis-tutorial/img/` ended up. Default: /binkis-tutorial/img/ */
  assetsPath?: string;
  /** Every open, step change, completion and close; for analytics. */
  onEvent?: (detail: BinkisTutorialEventDetail) => void;
};

export default function BinkisTutorial({ locale, autoOpen = true, showButton = true, className = "bkt-launch", children, assetsPath = "/binkis-tutorial/img/", onEvent }: Props) {
  const lang: "es" | "en" = locale.toLowerCase().startsWith("es") ? "es" : "en";
  const [api, setApi] = useState<BinkisTutorialApi | null>(null);

  // read when the core finishes loading, without restarting it on a change
  const langRef = useRef(lang);
  langRef.current = lang;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let gone = false;
    let core: BinkisTutorialApi | null = null;
    loadCore().then((loaded) => {
      if (gone) return;
      core = loaded;
      core.init({ lang: langRef.current, autoOpen, assetsPath });
      setApi(core);
    });
    return () => {
      gone = true;
      core?.destroy();
      setApi(null);
    };
  }, [autoOpen, assetsPath]);

  // the site's language switch changes the prop without leaving the page
  useEffect(() => {
    api?.setLang(lang);
  }, [api, lang]);

  useEffect(() => {
    const listener = (e: Event) => onEventRef.current?.((e as CustomEvent<BinkisTutorialEventDetail>).detail);
    window.addEventListener("binkis-tutorial", listener);
    return () => window.removeEventListener("binkis-tutorial", listener);
  }, []);

  if (!showButton) return null;

  return (
    <button
      type="button"
      className={className}
      // a tap before the core has loaded still opens it, just a moment later
      onClick={() => {
        if (api) api.open();
        else loadCore().then((core) => core.open());
      }}
    >
      {children ?? (
        <>
          <Image src={`${assetsPath}aguila-saludo.webp`} alt="" width={30} height={30} unoptimized />
          {LABEL[lang]}
        </>
      )}
    </button>
  );
}
