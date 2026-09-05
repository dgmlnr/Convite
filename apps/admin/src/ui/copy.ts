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
  tenantListCreateButton: "Crear inquilino",
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
  // Tenant creation screen (the gap slice 15 flagged but never built) — a
  // minimal form, on purpose: only the tenant id, since the embed key is
  // system-generated and origins/games/window are configured afterward, on
  // the tenant's own detail screen this form hands off to.
  tenantCreateTitle: "Crear inquilino",
  tenantCreateHint: "La clave de inserción se genera sola. Los orígenes, los juegos y el período de pago se configuran después, en el detalle del inquilino.",
  tenantCreateIdLabel: "Identificador del inquilino",
  tenantCreateIdPlaceholder: "por-ejemplo-acme",
  tenantCreateSubmit: "Crear",
  tenantCreateSubmitting: "Creando…",
  tenantCreateMissingId: "Ingresá un identificador para el inquilino.",
  tenantCreateIdTaken: "Ese identificador ya está en uso. Probá con otro.",
  tenantCreateEmbedKeyTaken: "Se generó una clave que ya está en uso. Probá crear el inquilino de nuevo.",
  tenantCreateMissingPermission: "Tu cuenta no tiene permiso para crear inquilinos.",
  tenantCreateGenericError: "No se pudo crear el inquilino. Probá de nuevo.",
  // Shared top nav (slice 16, phases 16a/16b) — every destination is ALWAYS
  // shown, client-side gating is UX only (same discipline "Crear inquilino"
  // already establishes): the single authorization checkpoint refuses
  // server-side exactly as it always has, and each destination's own screen
  // renders its own honest missing-permission message once requested.
  navTenants: "Inquilinos",
  navOperators: "Operadores",
  navAudit: "Auditoría",
  // Operators + permission matrix screen (phase 16a) — ONE screen, not
  // four, since the operator list, the create form, the disable/enable
  // actions and the permission matrix all operate on the SAME small
  // dataset (`GET /operators`, design §7's own "single-digit operators"
  // scale).
  operatorsTitle: "Operadores",
  operatorsLoading: "Cargando operadores…",
  operatorsMissingPermission: "Tu cuenta no tiene permiso para gestionar operadores.",
  operatorsGenericError: "No se pudieron cargar los operadores. Probá de nuevo.",
  operatorsEmpty: "Todavía no hay operadores cargados.",
  operatorsCreateTitle: "Crear operador",
  operatorsUsernameLabel: "Usuario",
  operatorsPasswordLabel: "Contraseña inicial",
  operatorsCreateSubmit: "Crear",
  operatorsCreateSubmitting: "Creando…",
  operatorsCreateMissingFields: "Ingresá un usuario y una contraseña.",
  operatorsCreateUsernameTaken: "Ese usuario ya existe. Probá con otro.",
  operatorsCreateMissingPermission: "Tu cuenta no tiene permiso para crear operadores.",
  operatorsCreateGenericError: "No se pudo crear el operador. Probá de nuevo.",
  operatorsColumnUsername: "Usuario",
  operatorsColumnStatus: "Estado",
  operatorsEnabledLabel: "Habilitado",
  operatorsDisabledLabel: "Deshabilitado",
  operatorsDisableButton: "Deshabilitar",
  operatorsEnableButton: "Habilitar",
  operatorsPermissionsTitle: "Permisos",
  /**
   * ONE hint sentence for BOTH the disable button and the operators.manage
   * checkbox on the SOLE account manager's own row (launch prompt: "make
   * the constraint legible in the UI before it fires, not only after") —
   * `permission-matrix.ts`'s own `wouldTripLastAccountManagerGuard` and
   * `OperatorsScreen.tsx`'s own disable-button guard both point at this
   * SAME string, since both actions trip the identical server-side
   * `withLastAccountManagerGuard`.
   */
  operatorsSoleAccountManagerHint: "Es el único operador habilitado que puede gestionar cuentas. Deshabilitarlo o quitarle este permiso sería rechazado por el servidor.",
  operatorsLastAccountManagerRefused: "El servidor rechazó la acción: dejaría sin ningún operador habilitado para gestionar cuentas.",
  // The seven real permissions (design §6.1) — NO eighth, NO fake "role"
  // grouping (launch prompt §1): this is a flat translation of the closed
  // vocabulary `apps/admin/src/permissions.ts` already fixes, never a
  // second taxonomy invented for display.
  permissionLabels: {
    "tenant.create": "Crear inquilinos",
    "tenant.origins.edit": "Editar orígenes",
    "tenant.games.edit": "Editar juegos",
    "tenant.window.edit": "Editar período de pago",
    "tenant.embed-key.rotate": "Rotar clave de inserción",
    "operators.manage": "Gestionar operadores",
    "audit.view": "Ver auditoría",
  },
} as const;
