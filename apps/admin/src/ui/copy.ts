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
} as const;
