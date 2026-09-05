/**
 * The panel's own Spanish-language copy table (launch prompt §4: "the panel
 * is a Spanish-language tool. Its visible copy is a task artifact, not
 * persona text"), mirroring `apps/widget-app/src/i18n.ts`'s own convention —
 * a flat, typed object under one export, identifiers/comments in English,
 * only what an operator actually reads lives here. Grown incrementally
 * across this slice's own chained PRs, exactly like that file's own
 * `STRINGS` table grew across its slices: this PR (login) adds only the
 * login-form entries; later PRs in this same slice (app shell, tenant list)
 * extend the same object rather than creating a second table.
 */
export const COPY = {
  appName: "Convite — Panel de administración",
  loginTitle: "Iniciar sesión",
  usernameLabel: "Usuario",
  passwordLabel: "Contraseña",
  loginSubmit: "Ingresar",
  loginSubmitting: "Ingresando…",
  /**
   * ONE message for BOTH "unknown username" and "wrong password" (task
   * 14.1, spec Domain E's own "identically to a wrong password" scenario) —
   * the server's own `POST /login` response is already uniform
   * (`invalid-credentials`, `login-handler.ts`'s own docstring: "no field
   * here names which of the three refusal causes fired"), so this copy
   * table has no SECOND string to accidentally reach for. Naming the two
   * causes apart in the UI, even by choosing which of two existing strings
   * to show, would leak exactly what the server's own timing-safe design
   * (design §11.1's dummy-hash comparison) works to hide.
   */
  loginInvalidCredentials: "Usuario o contraseña incorrectos.",
  loginRateLimited: "Demasiados intentos. Probá de nuevo en unos minutos.",
  loginMissingFields: "Ingresá tu usuario y tu contraseña.",
  loginGenericError: "No se pudo iniciar sesión. Probá de nuevo.",
  tenantListTitle: "Inquilinos",
  tenantListEmpty: "Todavía no hay inquilinos cargados.",
  tenantListLoading: "Cargando…",
  tenantListMissingPermission: "Tu cuenta no tiene permiso para ver la lista de inquilinos.",
  tenantListGenericError: "No se pudo cargar la lista de inquilinos. Probá de nuevo.",
  logout: "Cerrar sesión",
  retry: "Reintentar",
  tenantEmbedKeyLabel: "Clave de inserción",
  // Tenant detail screen (slice 15, task 15a) — origins/games/window
  // editors, embed-key rotation, and theme editing all render inside this
  // one screen, grown incrementally across this slice's own chained PRs,
  // the identical "extend the same table" convention `copy.ts`'s own header
  // already establishes.
  tenantDetailBack: "← Volver a la lista",
  tenantDetailLoading: "Cargando inquilino…",
  tenantDetailNotFound: "Este inquilino ya no existe.",
  tenantDetailMissingPermission: "Tu cuenta no tiene permiso para ver este inquilino.",
  tenantDetailGenericError: "No se pudo cargar el inquilino. Probá de nuevo.",
  tenantDetailOriginsLabel: "Orígenes permitidos",
  tenantDetailOriginsEmpty: "Sin orígenes configurados todavía.",
  tenantDetailGamesLabel: "Juegos habilitados",
  tenantDetailGamesEmpty: "Sin juegos habilitados todavía.",
  tenantDetailValidUntilLabel: "Pagado hasta",
  tenantDetailValidUntilEmpty: "Sin período configurado.",
  tenantDetailSave: "Guardar",
  tenantDetailSaving: "Guardando…",
  tenantDetailEditMissingPermission: "Tu cuenta no tiene permiso para editar este campo.",
  tenantDetailEditUnknownTenant: "Este inquilino ya no existe.",
  tenantDetailEditGenericError: "No se pudo guardar. Probá de nuevo.",
  tenantDetailWindowPlaceholder: "DD/MM/AAAA",
  tenantDetailWindowInvalidFormat: "Ingresá la fecha como DD/MM/AAAA.",
  tenantDetailSnippetLabel: "Fragmento para insertar",
  tenantDetailCopySnippet: "Copiar fragmento",
  tenantDetailCopied: "¡Copiado!",
  tenantDetailRotateButton: "Rotar clave",
  tenantDetailRotateWarning:
    "Rotar la clave rompe la página en vivo del inquilino de inmediato: el fragmento que tienen instalado deja de funcionar hasta que lo actualicen con la clave nueva. Esta acción no se puede deshacer.",
  tenantDetailRotateConfirm: "Confirmar rotación",
  tenantDetailRotateCancel: "Cancelar",
  tenantDetailRotateSuccess: "Clave rotada. Copiá el fragmento nuevo antes de salir de esta pantalla.",
  tenantDetailRotating: "Rotando…",
  tenantDetailThemeLabel: "Tema visual",
  tenantDetailThemeHint: "Dejá un campo vacío para usar el color/valor por defecto del widget.",
} as const;
