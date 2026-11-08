import type { en } from './en.ts';

/**
 * Typed against the English dictionary, so a missing or renamed key is a
 * compile error rather than a blank space on a page in production.
 */
export const es: typeof en = {
  locale: 'es',
  localeName: 'Español',

  brand: {
    name: 'BINKIS ID',
    tagline: 'La identidad permanente de cada BINKI físico.',
  },

  nav: {
    collection: 'Mi Colección',
    signIn: 'Iniciar sesión',
    signUp: 'Crear cuenta',
    signOut: 'Cerrar sesión',
  },

  passport: {
    unclaimedTitle: 'Este BINKIS aún no tiene propietario registrado',
    unclaimedBody:
      'Raspa tu holograma y usa el código secreto para registrar esta pieza en tu colección.',
    claimAction: 'REGISTRAR MI BINKIS',
    verified: 'Verificado',
    unverified: 'Sin verificar',
    /** Antes de registrarse. Distinto de "Sin verificar", que es un problema
        de verificación de una pieza ya registrada. */
    pendingRegistration: 'Pendiente de registro',
    certificate: 'Certificado y detalles',
    certificateSubtitle: 'Identidad y datos de tu pieza.',
    universe: 'Universo',
    noOwnerYet: 'Esta pieza aún no tiene propietario registrado.',
    original: 'Original',
    ownedBy: 'Propiedad de',
    edition: 'Edición',
    series: 'Serie',
    character: 'Personaje',
    rarity: 'Rareza',
    country: 'País de producción',
    year: 'Año de producción',
    batch: 'Lote',
    pieceNumber: 'Número de pieza',
    editionPosition: '{number} de {total}',
    provenance: 'Procedencia',
    history: 'Historial',
    historyEmpty: 'Su historia contigo está por comenzar.',
    notFoundTitle: 'Aquí no hay ningún BINKI',
    notFoundBody:
      'Este código no corresponde a ninguna pieza del registro. Revisa el QR de tu holograma.',
    voidTitle: 'Esta pieza fue anulada',
    voidBody: 'Fue retirada del registro y ya no puede reclamarse.',
  },

  events: {
    BORN: 'Fabricado',
    CLAIMED: 'Reclamado',
    TRANSFERRED: 'Transferido',
    MILESTONE: 'Hito',
    OFFICIAL_EVENT: 'Evento oficial',
    VERIFICATION: 'Verificación',
    VOIDED: 'Anulado',
  },

  claim: {
    title: 'Registra tu Binkis',
    subtitle: 'Esta pieza aún no tiene propietario registrado.',
    scratchTitle: 'DESLIZA PARA REVELAR',
    scratchSubtitle: 'Frota esta área con tu dedo',
    scratchSkip: 'Revelar sin raspar',
    codeLabel: 'Código secreto del holograma',
    codePlaceholder: 'XXX-XXX-XXX',
    submit: 'Registrar mi Binkis',
    helper: 'Raspa tu holograma y usa el código secreto para registrar esta pieza en tu colección.',
    guideTitle: 'Águila te enseña a registrar tu Binkis',
    guideCta: 'Ver tutorial paso a paso',
    working: 'Verificando',
    invalidFormat: 'Ese código todavía no está completo.',
    checkFailed: 'Ese código tiene un error. Revísalo contra el holograma.',
    signInFirst: 'Inicia sesión para reclamar esta pieza',
    signInFirstBody: 'Un BINKI se registra a nombre de un coleccionista, así que primero necesitas una cuenta.',
    tooManyAttempts: 'Demasiados intentos. Inténtalo de nuevo en {wait}.',
    successTitle: 'Es tuyo',
    successBody: 'Este BINKI queda registrado a tu nombre, de forma permanente.',
    viewCollection: 'Ver mi colección',
  },

  auth: {
    signUpTitle: 'Crea tu Collector ID',
    signInTitle: 'Bienvenido de vuelta',
    signUpBlurb: 'Tus piezas, su historial y cada transferencia, en un solo lugar.',
    signInBlurb: 'Tu colección te está esperando.',
    email: 'Correo',
    handle: 'Usuario',
    handleHint: 'Esto es lo que ven otros coleccionistas. Tu nombre real nunca es público.',
    displayName: 'Nombre para mostrar',
    password: 'Contraseña',
    passwordHint: 'Al menos 6 caracteres.',
    // Zod speaks English. These are the same rules, in the page's language.
    passwordTooShort: 'La contraseña debe tener al menos {min} caracteres.',
    passwordTooLong: 'La contraseña es demasiado larga.',
    emailInvalid: 'Eso no parece un correo electrónico.',
    handleTooShort: 'El usuario debe tener al menos {min} caracteres.',
    handleTooLong: 'El usuario no puede pasar de {max} caracteres.',
    handleInvalid: 'Usa solo letras, números, guion y guion bajo.',
    handleReserved: 'Ese usuario está reservado.',
    submitSignUp: 'Crear cuenta',
    submitSignIn: 'Iniciar sesión',
    haveAccount: '¿Ya tienes cuenta?',
    noAccount: '¿Todavía no tienes cuenta?',
    failed: 'El correo o la contraseña no son correctos.',
    emailTaken: 'Ese correo ya está registrado.',
    handleTaken: 'Ese usuario ya está ocupado.',
  },

  transfer: {
    title: 'Transferir este BINKI',
    subtitle: 'La pieza conserva su identidad y su historial. Solo cambia el dueño.',
    recipient: 'Destinatario',
    recipientHint: 'Su usuario, o el correo que usa. Si todavía no tiene cuenta, la transferencia lo espera.',
    messageLabel: 'Mensaje (opcional)',
    send: 'Enviar transferencia',
    sent: 'Transferencia enviada. Se mueve cuando la acepten.',
    incoming: 'Vienen hacia ti',
    outgoing: 'Esperando respuesta',
    accept: 'Aceptar',
    decline: 'Rechazar',
    cancel: 'Cancelar',
    none: 'No hay transferencias en curso.',
    from: 'De',
    to: 'Para',
    expires: 'Vence',
    errors: {
      not_owner: 'No eres el dueño actual de esta pieza.',
      piece_not_transferable: 'Esta pieza no se puede transferir en este momento.',
      already_pending: 'Esta pieza ya tiene una transferencia en espera.',
      to_self: 'Esa es tu propia cuenta.',
      recipient_unknown: 'No hay ningún coleccionista con ese usuario. Prueba con su correo.',
      not_found: 'Esa transferencia ya no existe.',
      not_yours_to_accept: 'Esa transferencia no te fue enviada.',
      expired: 'Esa transferencia ya venció.',
    },
  },

  admin: {
    title: 'Administración',
    overview: 'Resumen',
    products: 'Productos',
    batches: 'Lotes',
    pieces: 'Piezas',
    users: 'Coleccionistas',
    claims: 'Reclamos',
    transfers: 'Transferencias',
    audit: 'Auditoría',
    importExport: 'Importar / Exportar',
    totalPieces: 'Piezas',
    claimedPieces: 'Reclamadas',
    unclaimedPieces: 'Sin reclamar',
    voidPieces: 'Anuladas',
    search: 'Buscar por serie, token o usuario',
    void: 'Anular pieza',
    verify: 'Marcar verificada',
    unverify: 'Quitar verificación',
    reason: 'Motivo',
    confirm: 'Confirmar',
    exportCsv: 'Exportar CSV',
    exportXlsx: 'Exportar Excel',
    noResults: 'No hay coincidencias.',
    forbidden: 'Esta zona es para administradores.',
  },
  lookup: {
    label: 'Buscar un BINKI',
    placeholder: 'SP-000001',
    action: 'Abrir',
    hint: 'Escribe el número impreso en el holograma, o su código QR, si la cámara no lo lee.',
    notFound: 'No hay nada en el registro que coincida con',
  },
  home: {
    identityTitle: 'Una pieza, una identidad',
    identityBody:
      'Cada Binki tiene su propio número de serie y una identidad digital. Puede haber otros del mismo personaje, pero el tuyo tiene una historia propia. Y tú formas parte de ella.',
    proofTitle: 'Regístralo como tuyo',
    proofBody:
      'El QR te permite conocer la ficha pública de tu Binki. Para registrarlo en tu colección, descubre el código secreto bajo la zona para raspar. No lo compartas: es la clave para su primer registro.',
    historyTitle: 'Su historia continúa',
    historyBody:
      'Tu Binki conserva su identidad aunque cambie de dueño. Cada transferencia registrada suma un nuevo capítulo a su historia. Un regalo, un intercambio, un nuevo coleccionista… la aventura continúa.',
  },
  set: {
    title: 'Serie 1 · Classic',
    progress: '{owned} de {total}',
    missing: 'Aún no está en tu colección',
    completeTitle: 'Serie completa',
    completeBody: 'Tienes los ocho personajes Classic de la Serie 1.',
    matchedTitle: 'Colección alineada',
    matchedBody: 'Los ocho personajes, todos con el número {number}.',
    matchedExtra: 'y también el número {number}',
    viewPassport: 'Ver pasaporte',
    celebrate: 'Ver la animación',
    dismiss: 'Cerrar',
  },
  comic: {
    // Wording from the client, 6 November 2026, kept as he wrote it.
    tagline: 'Los héroes originales de Binkis.',
    // Aguila and EVA were named here until 7 November 2026, when the client
    // asked to drop them "por lo pronto". Only KROX has pages drawn, and
    // promising two characters the reader cannot reach is the one thing this
    // block was built not to do.
    blurb:
      'KROX tiene una historia que contar. Descubre su origen y los secretos de su universo.',
    // Shown over the artwork. The client asked on 6 Nov 2026 for an entry
    // that is unmissable and obviously tappable; a badge does that without
    // motion, which the reduced-motion rule would otherwise have to carry.
    badge: 'NUEVO',
    count: 'Capítulo 1 · 28 páginas',
    cta: 'Leer el cómic',
    // Replaced 'Gratis / Sin registro' on 7 November 2026, his words exactly.
    // He wanted the line under the button to open the series rather than
    // price it: UNIVERSALS is meant to read as a story that keeps growing.
    teaser: 'La aventura apenas comienza.',
    teaserNext: 'Nuevas aventuras y héroes, próximamente.',
    chapter: 'Capítulo {number}',
    back: 'Volver a BINKIS ID',
    chapters: 'Capítulos',
    page: 'Página {numbers}',
    closing: 'UNIVERSALS, la Liga completa',
    // The same drawing before it was coloured, added 8 November 2026 at the
    // client's request to show both.
    closingInk: 'UNIVERSALS, la Liga completa, a tinta',
    spreadHint: 'Pellizca o toca dos veces para agrandar una página.',
  },

  common: {
    back: 'Volver',
    loading: 'Cargando',
    somethingWrong: 'Algo salió mal. Inténtalo de nuevo.',
  },
};
