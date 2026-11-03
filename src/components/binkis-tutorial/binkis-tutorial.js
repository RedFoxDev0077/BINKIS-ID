/* ==========================================================================
 * BINKIS ID — "How to register your Binki" tutorial.
 *
 * No dependencies, no build. Load binkis-tutorial.css + this file, then:
 *
 *   BinkisTutorial.init({ lang: "es", autoOpen: true });
 *
 * and any element with `data-binkis-tutorial` opens it on click. Full
 * integration notes are in README.md.
 *
 * The on-screen wording of the site (button labels, error messages) is
 * quoted from id.binkis.com's own dictionary, so the tutorial names things
 * exactly as the user will see them. If the site renames a label, update it
 * here too.
 * ========================================================================== */
/* eslint-disable */
(function () {
  "use strict";

  const SCRIPT_SRC = document.currentScript && document.currentScript.src;
  const DEFAULT_ASSETS = SCRIPT_SRC ? new URL("img/", SCRIPT_SRC).href : "img/";
  const STORE_KEY = "binkis-tutorial-visto";
  const STEPS = 6; // numbered steps; scene 0 is the hello
  const EXAMPLE_CODE = "PZPGCXZAP"; // the code printed on the illustration
  const POSES = ["saludo", "senalar", "alcanzar", "pensar", "alerta", "mirar-arriba", "celebrar"];

  const ICON = {
    close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 22 20.5H2z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
    link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
    lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
    shield: '<svg width="40" height="44" viewBox="0 0 40 44" aria-hidden="true"><path d="M20 2 36 8v12c0 11-7 18.5-16 22C11 38.5 4 31 4 20V8z" fill="currentColor"/><path d="M12.5 22.5 18 28l10-11" fill="none" stroke="#0b1a12" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5 5 9.5 10 3"/></svg>',
    spark: '<svg viewBox="-1 -1 2 2" width="100%" height="100%" aria-hidden="true"><path d="M0-1C.1-.1.1-.1 1 0 .1.1.1.1 0 1-.1.1-.1.1-1 0-.1-.1-.1-.1 0-1Z" fill="currentColor"/></svg>',
    finder: '<svg viewBox="0 0 104 104" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M3 24V3h21M80 3h21v21M101 80v21H80M24 101H3V80"/></svg>',
  };

  const COPY = {
    es: {
      dialog: "Cómo registrar tu Binki",
      close: "Cerrar",
      back: "Atrás",
      next: "Siguiente",
      start: "Empezar",
      later: "Ahora no",
      done: "¡Entendido!",
      intro: "Tutorial · Binkis ID",
      stepOf: (n) => `Paso ${n} de ${STEPS}`,
      goTo: (n) => `Ir al paso ${n}`,
      steps: [
        {
          title: "Haz tuyo tu Binki",
          text: "En 6 pasos rápidos lo registras a tu nombre. Ten a la mano <b>la caja de tu Binki</b> y tu celular.",
          bubble: "¡Hola! Soy Águila. Yo te guío.",
        },
        {
          short: "Holograma",
          title: "Busca el holograma",
          text: "Es la <b>estampa brillante</b> que viene en la caja de tu Binki. Tiene tres cosas que vas a usar: <b>tu número</b>, <b>el QR</b> y <b>el código secreto</b>, tapado con plata.",
          tags: ["Tu número", "QR", "Código secreto"],
        },
        {
          short: "Escanea",
          title: "Escanea el QR",
          text: "Abre la <b>cámara</b> de tu celular, apunta al QR y toca el enlace que aparece. Se abre la ficha de tu Binki.",
          note: ["info", "¿La cámara no lo lee? Entra a <b>id.binkis.com</b> y escribe tu número en «Buscar un BINKI»."],
          open: "Abrir",
        },
        {
          short: "Cuenta",
          title: "Entra a tu cuenta",
          text: "Tu Binki se registra <b>a tu nombre</b>, así que necesitas una cuenta. ¿Es tu primera vez? Toca <b>«Crear cuenta»</b>: solo pide correo, usuario y contraseña.",
          note: ["info", "Tu nombre real nunca es público: los demás coleccionistas solo ven tu usuario."],
          card: ["Inicia sesión para reclamar esta pieza", "Un BINKI se registra a nombre de un coleccionista, así que primero necesitas una cuenta.", "Crear cuenta", "Iniciar sesión"],
        },
        {
          short: "Raspa",
          title: "Raspa tu holograma",
          text: "Con una moneda o con la uña, raspa la <b>zona plateada de la estampa</b>. Debajo aparece tu código secreto. No se lo enseñes a nadie.",
          note: ["warn", "<b>Ojo:</b> en la página también hay un recuadro plateado para raspar. Ese <b>no trae tu código</b>: solo descubre la casilla donde lo escribes."],
        },
        {
          short: "Escribe",
          title: "Escribe tu código",
          text: "Cópialo tal cual en la casilla <b>«Código secreto del holograma»</b>. Los guiones se ponen solos. Luego toca <b>«Registrar mi Binkis»</b>.",
          note: ["info", "¿Sale «Ese código tiene un error»? Compáralo letra por letra con tu holograma y vuelve a intentarlo."],
          form: ["Código secreto del holograma", "Registrar mi Binkis", "Verificando…"],
        },
        {
          short: "¡Es tuyo!",
          title: "¡Listo, es tuyo!",
          text: "Tu Binki queda registrado <b>a tu nombre, para siempre</b>. Lo verás en <b>«Mi Colección»</b>, encendido en tu vitrina.",
          card: ["Es tuyo", "Este BINKI queda registrado a tu nombre, de forma permanente.", "Verificado"],
        },
      ],
    },
    en: {
      dialog: "How to register your Binki",
      close: "Close",
      back: "Back",
      next: "Next",
      start: "Let's go",
      later: "Not now",
      done: "Got it!",
      intro: "Tutorial · Binkis ID",
      stepOf: (n) => `Step ${n} of ${STEPS}`,
      goTo: (n) => `Go to step ${n}`,
      steps: [
        {
          title: "Make your Binki yours",
          text: "Six quick steps and it is registered to you. Keep <b>your Binki's box</b> and your phone handy.",
          bubble: "Hi! I'm Águila. I'll show you how.",
        },
        {
          short: "Hologram",
          title: "Find the hologram",
          text: "It is the <b>shiny sticker</b> on your Binki's box. It has three things you will use: <b>your number</b>, <b>the QR</b> and <b>the secret code</b>, hidden under silver.",
          tags: ["Your number", "QR", "Secret code"],
        },
        {
          short: "Scan",
          title: "Scan the QR",
          text: "Open your phone's <b>camera</b>, point it at the QR and tap the link that pops up. Your Binki's page opens.",
          note: ["info", "Camera won't read it? Go to <b>id.binkis.com</b> and type your number in “Find a BINKI”."],
          open: "Open",
        },
        {
          short: "Account",
          title: "Sign in",
          text: "Your Binki is registered <b>to your name</b>, so you need an account. First time? Tap <b>“Create account”</b>: it only asks for an email, a handle and a password.",
          note: ["info", "Your real name is never public: other collectors only see your handle."],
          card: ["Sign in to claim this piece", "A BINKI is registered to a collector, so you need an account first.", "Create account", "Sign in"],
        },
        {
          short: "Scratch",
          title: "Scratch your hologram",
          text: "With a coin or a fingernail, scratch the <b>silver panel on the sticker</b>. Your secret code is underneath. Don't show it to anyone.",
          note: ["warn", "<b>Heads up:</b> the page also has a silver panel to rub. That one <b>does not hold your code</b>: it only uncovers the box where you type it."],
        },
        {
          short: "Type",
          title: "Type your code",
          text: "Copy it exactly into <b>“Secret code from the hologram”</b>. The dashes go in by themselves. Then tap <b>“Register my Binkis”</b>.",
          note: ["info", "Seeing “That code has a typo”? Check it letter by letter against your hologram and try again."],
          form: ["Secret code from the hologram", "Register my Binkis", "Checking…"],
        },
        {
          short: "It's yours!",
          title: "Done, it's yours!",
          text: "Your Binki is registered <b>to you, for good</b>. You will find it in <b>“My Collection”</b>, lit up in your display case.",
          card: ["It is yours", "This BINKI is now registered to you, permanently.", "Verified"],
        },
      ],
    },
  };

  /* ------------------------------- scenes -------------------------------- */

  const SPARKS = [
    ["left:42%;top:10%", 0],
    ["right:3%;top:6%", 0.5],
    ["right:5%;bottom:12%", 1.1],
    ["left:39%;bottom:20%", 1.6],
    ["left:60%;top:2%", 0.9],
  ];

  function sceneHTML(i, s, A) {
    const guide = (pose) => `<img class="bkt-guide" src="${A}aguila-${pose}.webp" alt="" draggable="false">`;
    const patch = (extra) => `<div class="bkt-rasca${extra}" style="background-image:url('${A}holograma-rasca.webp')"></div>`;
    // until step 4 the hologram is shown as it comes out of the box: covered
    const holo = (inner = patch(" bkt-rasca--tapada")) => `<div class="bkt-holo"><img src="${A}holograma.webp" alt="" draggable="false">${inner}</div>`;
    switch (i) {
      case 0:
        return `${holo()}${guide("saludo")}<div class="bkt-bubble">${s.bubble}</div>`;
      case 1:
        return (
          holo(
            patch(" bkt-rasca--tapada") +
              `<div class="bkt-ring bkt-ring--id"><span>${s.tags[0]}</span></div>` +
              `<div class="bkt-ring bkt-ring--qr"><span>${s.tags[1]}</span></div>` +
              `<div class="bkt-ring bkt-ring--code"><span>${s.tags[2]}</span></div>`,
          ) + guide("senalar")
        );
      case 2:
        return (
          `<div class="bkt-phone"><div class="bkt-screen">${holo()}<div class="bkt-finder">${ICON.finder}</div>` +
          `<div class="bkt-notif">${ICON.link}<span>id.binkis.com</span><em>${s.open}</em></div><i class="bkt-tap"></i></div></div>` +
          guide("alcanzar")
        );
      case 3:
        return (
          `<div class="bkt-card">${ICON.lock}<h4>${s.card[0]}</h4><p>${s.card[1]}</p>` +
          `<div class="bkt-card-btns"><span>${s.card[2]}<i class="bkt-tap"></i></span><span>${s.card[3]}</span></div></div>` +
          guide("pensar")
        );
      case 4:
        return holo(patch("") + '<div class="bkt-coin"><i></i></div>') + guide("alerta");
      case 5:
        return (
          `<div class="bkt-form"><label>${s.form[0]}</label><div class="bkt-field"></div>` +
          `<div class="bkt-submit"><span>${s.form[1]}</span><span>${s.form[2]}</span><i class="bkt-tap"></i></div></div>` +
          guide("mirar-arriba")
        );
      case 6:
        return (
          SPARKS.map(([pos, d]) => `<span class="bkt-spark" style="${pos};animation-delay:${d}s">${ICON.spark}</span>`).join("") +
          `<div class="bkt-card bkt-card--win">${ICON.shield}<h4>${s.card[0]}</h4><p>${s.card[1]}</p>` +
          `<span class="bkt-badge">${ICON.check}${s.card[2]}</span></div>` +
          guide("celebrar")
        );
    }
    return "";
  }

  // the site's field: dashes go in on their own after the 3rd and 6th char
  function fieldHTML(n) {
    if (n === 0) return '<i class="bkt-caret"></i><span class="bkt-ph">XXX-XXX-XXX</span>';
    let out = "";
    for (let k = 0; k < n; k++) {
      if (k === 3 || k === 6) out += '<span class="bkt-auto">-</span>';
      out += EXAMPLE_CODE[k];
    }
    return out + (n < EXAMPLE_CODE.length ? '<i class="bkt-caret"></i>' : "");
  }

  /* ------------------------------ controller ----------------------------- */

  const state = {
    opts: null,
    lang: "es",
    step: 0,
    open: false,
    auto: false,
    opener: null,
    timers: [],
    autoTimer: 0,
    htmlOverflow: "",
  };
  let el = null;

  const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSheet = () => !window.matchMedia || window.matchMedia("(max-width: 639px)").matches;
  const t = () => COPY[state.lang];

  function emit(type, extra) {
    window.dispatchEvent(new CustomEvent("binkis-tutorial", { detail: Object.assign({ type, step: state.step }, extra) }));
  }
  function seen() {
    try {
      return window.localStorage.getItem(state.opts.storageKey) === "1";
    } catch (e) {
      return false;
    }
  }
  function markSeen() {
    try {
      window.localStorage.setItem(state.opts.storageKey, "1");
    } catch (e) {
      /* private mode or blocked storage: it will simply show again */
    }
  }
  function detectLang() {
    const l = (document.documentElement.lang || navigator.language || "en").toLowerCase();
    return l.startsWith("es") ? "es" : "en";
  }

  function build() {
    const root = document.createElement("div");
    root.className = "bkt-root";
    root.innerHTML =
      '<div class="bkt-backdrop"></div>' +
      '<section class="bkt-sheet" role="dialog" aria-modal="true" aria-labelledby="bkt-title" tabindex="-1">' +
      '<header class="bkt-head"><div class="bkt-grab"></div><p class="bkt-kicker"></p>' +
      `<button type="button" class="bkt-x">${ICON.close}</button></header>` +
      '<div class="bkt-body"><div class="bkt-stage" aria-hidden="true"></div>' +
      '<h2 class="bkt-title" id="bkt-title" tabindex="-1"></h2><p class="bkt-text"></p>' +
      '<div class="bkt-note" hidden></div></div>' +
      '<footer class="bkt-foot"><div class="bkt-dots"></div><div class="bkt-nav">' +
      '<button type="button" class="bkt-btn bkt-btn--ghost"></button>' +
      '<button type="button" class="bkt-btn bkt-btn--primary"></button></div></footer>' +
      '<p class="bkt-sr" aria-live="polite"></p></section>';
    document.body.appendChild(root);

    const q = (s) => root.querySelector(s);
    el = {
      root,
      sheet: q(".bkt-sheet"),
      head: q(".bkt-head"),
      kicker: q(".bkt-kicker"),
      x: q(".bkt-x"),
      body: q(".bkt-body"),
      stage: q(".bkt-stage"),
      title: q(".bkt-title"),
      text: q(".bkt-text"),
      note: q(".bkt-note"),
      dots: q(".bkt-dots"),
      back: q(".bkt-btn--ghost"),
      next: q(".bkt-btn--primary"),
      live: q(".bkt-sr"),
    };
    for (let n = 1; n <= STEPS; n++) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "bkt-dot";
      d.dataset.step = String(n);
      el.dots.appendChild(d);
    }

    el.root.querySelector(".bkt-backdrop").addEventListener("click", () => close("backdrop"));
    el.x.addEventListener("click", () => close("button"));
    el.back.addEventListener("click", () => (state.step === 0 ? close("later") : go(state.step - 1)));
    el.next.addEventListener("click", () => (state.step === STEPS ? finish() : go(state.step + 1)));
    el.dots.addEventListener("click", (e) => {
      const d = e.target.closest(".bkt-dot");
      if (d) go(Number(d.dataset.step));
    });
    root.addEventListener("keydown", onKey);
    el.body.addEventListener("scroll", updateMore, { passive: true });
    window.addEventListener("resize", onResize);
    bindSwipe();
    bindDragToClose();
    applyLang();
  }

  function applyLang() {
    const c = t();
    el.x.setAttribute("aria-label", c.close);
    [...el.dots.children].forEach((d, k) => d.setAttribute("aria-label", c.goTo(k + 1)));
  }

  function render(dir) {
    stopScene();
    const c = t();
    const s = c.steps[state.step];
    const i = state.step;

    el.kicker.textContent = i === 0 ? c.intro : `${c.stepOf(i)} · ${s.short}`;
    el.title.textContent = s.title;
    el.text.innerHTML = s.text;
    if (s.note) {
      el.note.hidden = false;
      el.note.className = `bkt-note bkt-note--${s.note[0]}`;
      el.note.innerHTML = ICON[s.note[0]] + `<span>${s.note[1]}</span>`;
    } else {
      el.note.hidden = true;
      el.note.innerHTML = "";
    }

    const scene = document.createElement("div");
    scene.className = `bkt-scene bkt-s${i}` + (dir ? ` is-in-${dir}` : "");
    scene.innerHTML = sceneHTML(i, s, state.opts.assets);
    el.stage.replaceChildren(scene);
    el.body.scrollTop = 0;

    el.dots.hidden = i === 0;
    [...el.dots.children].forEach((d, k) => {
      const n = k + 1;
      d.classList.toggle("is-done", n < i);
      if (n === i) d.setAttribute("aria-current", "step");
      else d.removeAttribute("aria-current");
    });
    el.back.textContent = i === 0 ? c.later : c.back;
    el.next.textContent = i === 0 ? c.start : i === STEPS ? c.done : c.next;
    el.live.textContent = i === 0 ? s.title : `${c.stepOf(i)}: ${s.title}`;

    if (i === 5) runTyping(scene);
    window.requestAnimationFrame(updateMore);
  }

  // on short phones a step can run below the fold: shade the footer until
  // the reader has scrolled to the end
  function updateMore() {
    if (!el) return;
    const b = el.body;
    el.root.classList.toggle("has-more", b.scrollHeight - b.clientHeight - b.scrollTop > 6);
  }

  // scene 5 types the example code into the mock field, presses the button,
  // shows "Checking…", and starts over — driven here so the loop is exact
  function runTyping(scene) {
    const field = scene.querySelector(".bkt-field");
    const btn = scene.querySelector(".bkt-submit");
    if (reducedMotion()) {
      field.innerHTML = fieldHTML(EXAMPLE_CODE.length);
      return;
    }
    const at = (ms, fn) => state.timers.push(window.setTimeout(fn, ms));
    const cycle = () => {
      btn.classList.remove("is-pressed", "is-working");
      field.innerHTML = fieldHTML(0);
      let ms = 700;
      for (let n = 1; n <= EXAMPLE_CODE.length; n++) {
        at(ms, () => (field.innerHTML = fieldHTML(n)));
        ms += 160;
      }
      ms += 650;
      at(ms, () => btn.classList.add("is-pressed"));
      at(ms + 170, () => {
        btn.classList.remove("is-pressed");
        btn.classList.add("is-working");
      });
      at(ms + 2100, cycle);
    };
    cycle();
  }
  function stopScene() {
    state.timers.forEach((id) => window.clearTimeout(id));
    state.timers = [];
  }

  function go(n) {
    n = Math.max(0, Math.min(STEPS, n));
    if (n === state.step) return;
    const dir = n > state.step ? "next" : "prev";
    state.step = n;
    render(dir);
    emit("step");
  }

  function open(step, opener, auto) {
    if (!state.opts || !el) init(state.opts ? { lang: state.lang, assetsPath: state.opts.assets, storageKey: state.opts.storageKey } : undefined);
    window.clearTimeout(state.autoTimer);
    state.step = Math.max(0, Math.min(STEPS, step || 0));
    state.auto = !!auto;
    if (state.open) {
      render("next");
      return;
    }
    state.open = true;
    state.opener = opener || document.activeElement;
    state.htmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    el.root.setAttribute("data-mounted", "");
    render(null);
    void el.root.offsetHeight; // commit the closed position before animating
    el.root.classList.add("is-open");
    el.sheet.focus({ preventScroll: true });
    emit("open", { auto: state.auto });
  }

  function close(reason) {
    if (!state.open) return;
    state.open = false;
    stopScene();
    el.root.classList.remove("is-open");
    el.sheet.style.transform = "";
    window.setTimeout(() => {
      if (!state.open && el) {
        el.root.removeAttribute("data-mounted");
        el.stage.replaceChildren();
      }
    }, 360);
    document.documentElement.style.overflow = state.htmlOverflow;
    markSeen();
    if (state.opener && document.contains(state.opener)) state.opener.focus({ preventScroll: true });
    emit("close", { reason: reason || "api" });
  }

  function finish() {
    emit("complete");
    close("complete");
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close("escape");
    } else if (e.key === "ArrowRight" && !e.target.closest("input,textarea")) {
      go(state.step + 1);
    } else if (e.key === "ArrowLeft" && !e.target.closest("input,textarea")) {
      go(state.step - 1);
    } else if (e.key === "Tab") {
      // keep focus inside the dialog
      const f = [...el.sheet.querySelectorAll("button:not([hidden])")].filter((b) => b.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el.sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // swipe left / right on the content to change step (touch and pen only)
  function bindSwipe() {
    let x0 = 0;
    let y0 = 0;
    let id = null;
    el.body.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
    });
    el.body.addEventListener("pointerup", (e) => {
      if (e.pointerId !== id) return;
      id = null;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) go(state.step + (dx < 0 ? 1 : -1));
    });
    el.body.addEventListener("pointercancel", () => (id = null));
  }

  // on phones the sheet can be pulled down by its header to dismiss it
  function bindDragToClose() {
    let y0 = 0;
    let dy = 0;
    let id = null;
    el.head.addEventListener("pointerdown", (e) => {
      if (!isSheet() || e.target.closest(".bkt-x")) return;
      id = e.pointerId;
      y0 = e.clientY;
      dy = 0;
      el.head.setPointerCapture(id);
      el.root.classList.add("is-dragging");
    });
    el.head.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      dy = Math.max(0, e.clientY - y0);
      el.sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.root.classList.remove("is-dragging");
      if (dy > 90) close("swipe");
      else el.sheet.style.transform = "";
    };
    el.head.addEventListener("pointerup", end);
    el.head.addEventListener("pointercancel", end);
  }

  function preload(A) {
    ["holograma", "holograma-rasca", ...POSES.map((p) => `aguila-${p}`)].forEach((n) => {
      const img = new Image();
      img.decoding = "async";
      img.src = `${A}${n}.webp`;
    });
  }

  function onResize() {
    if (state.open) updateMore();
  }
  function onTriggerClick(e) {
    const trigger = e.target.closest && e.target.closest("[data-binkis-tutorial]");
    if (!trigger) return;
    e.preventDefault();
    open(Number(trigger.getAttribute("data-binkis-tutorial")) || 0, trigger, false);
  }

  // undoes init() completely. A single-page app needs this: the root lives on
  // <body>, outside the framework's tree, so it would otherwise outlive the
  // page that created it, and a pending auto-open would fire on the next page
  function destroy() {
    window.clearTimeout(state.autoTimer);
    if (state.open) close("unmount");
    stopScene();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("click", onTriggerClick);
    if (el) el.root.remove();
    el = null;
  }

  function init(options) {
    const o = options || {};
    let assets = o.assetsPath || DEFAULT_ASSETS;
    if (!assets.endsWith("/")) assets += "/";
    state.opts = {
      assets,
      storageKey: o.storageKey || STORE_KEY,
      autoOpen: !!o.autoOpen,
      delay: typeof o.delay === "number" ? o.delay : 800,
    };
    state.lang = COPY[o.lang] ? o.lang : detectLang();
    if (!el) {
      build();
      document.addEventListener("click", onTriggerClick);
    } else {
      applyLang();
    }
    preload(assets);
    window.clearTimeout(state.autoTimer);
    if (state.opts.autoOpen && !seen()) {
      state.autoTimer = window.setTimeout(() => {
        if (!state.open) open(0, null, true);
      }, state.opts.delay);
    }
    return api;
  }

  function setLang(lang) {
    if (!COPY[lang]) return;
    state.lang = lang;
    if (!el) return;
    applyLang();
    if (state.open) render(null);
  }

  const api = {
    init,
    open: (step) => open(step || 0, null, false),
    close: () => close("api"),
    setLang,
    destroy,
    hasSeen: () => (state.opts ? seen() : false),
    reset: () => {
      try {
        window.localStorage.removeItem((state.opts && state.opts.storageKey) || STORE_KEY);
      } catch (e) {
        /* nothing stored, nothing to clear */
      }
    },
  };
  window.BinkisTutorial = api;
})();
