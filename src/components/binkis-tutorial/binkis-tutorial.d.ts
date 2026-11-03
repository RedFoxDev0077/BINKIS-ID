export interface BinkisTutorialOptions {
  lang?: "es" | "en";
  /** Open by itself the first time on this browser. */
  autoOpen?: boolean;
  /** Milliseconds before opening by itself. Default: 800. */
  delay?: number;
  assetsPath?: string;
  /** The localStorage key of the "already seen" mark. */
  storageKey?: string;
}

export interface BinkisTutorialApi {
  init(options?: BinkisTutorialOptions): BinkisTutorialApi;
  /** 0 = the hello, 1 to 6 = the steps. */
  open(step?: number): void;
  close(): void;
  setLang(lang: "es" | "en"): void;
  /** Removes everything init() added to the page. */
  destroy(): void;
  hasSeen(): boolean;
  /** Clears the "already seen" mark. */
  reset(): void;
}

export interface BinkisTutorialEventDetail {
  type: "open" | "step" | "complete" | "close";
  /** 0 = the hello, 1 to 6 = the steps. */
  step: number;
  /** On "open": it opened by itself. */
  auto?: boolean;
  /** On "close". */
  reason?: "button" | "backdrop" | "escape" | "swipe" | "later" | "complete" | "api" | "unmount";
}

declare global {
  interface Window {
    BinkisTutorial: BinkisTutorialApi;
  }
}
