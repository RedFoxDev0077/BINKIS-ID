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
    unclaimedTitle: 'Este BINKI aún no ha sido reclamado',
    unclaimedBody:
      'Raspa el panel plateado del holograma e ingresa el Código de Reclamo para registrar esta pieza en tu colección.',
    claimAction: 'RECLAMA TU BINKI',
    verified: 'Verificado',
    unverified: 'Sin verificar',
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
    history: 'Historial',
    historyEmpty: 'A esta pieza todavía no le ha pasado nada.',
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
    title: 'Reclama este BINKI',
    subtitle: 'Raspa el panel de tu holograma para descubrir el Código de Reclamo.',
    scratchHint: 'Raspa aquí',
    scratchHintShort: 'Desliza para revelar',
    codeLabel: 'Código de Reclamo',
    codePlaceholder: 'XXXX-XXXX-XXX',
    submit: 'Reclamar',
    working: 'Verificando',
    invalidFormat: 'Ese código todavía no está completo.',
    checkFailed: 'Ese código tiene un error. Revísalo contra el holograma.',
    signInFirst: 'Inicia sesión para reclamar esta pieza',
    signInFirstBody: 'Un BINKI se registra a nombre de un coleccionista, así que primero necesitas una cuenta.',
    successTitle: 'Es tuyo',
    successBody: 'Este BINKI queda registrado a tu nombre, de forma permanente.',
    viewCollection: 'Ver mi colección',
  },

  auth: {
    signUpTitle: 'Crea tu Collector ID',
    signInTitle: 'Bienvenido de vuelta',
    email: 'Correo',
    handle: 'Usuario',
    handleHint: 'Esto es lo que ven otros coleccionistas. Tu nombre real nunca es público.',
    displayName: 'Nombre para mostrar',
    password: 'Contraseña',
    passwordHint: 'Al menos 10 caracteres.',
    submitSignUp: 'Crear cuenta',
    submitSignIn: 'Iniciar sesión',
    haveAccount: '¿Ya tienes cuenta?',
    noAccount: '¿Todavía no tienes cuenta?',
    failed: 'El correo o la contraseña no son correctos.',
    emailTaken: 'Ese correo ya está registrado.',
    handleTaken: 'Ese usuario ya está ocupado.',
  },

  common: {
    back: 'Volver',
    loading: 'Cargando',
    somethingWrong: 'Algo salió mal. Inténtalo de nuevo.',
  },
};
