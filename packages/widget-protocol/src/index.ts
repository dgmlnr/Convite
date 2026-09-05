export {
  isProtocolMessage,
  negotiateProtocolVersion,
  PROTOCOL_NAMESPACE,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ErrorMessage,
  type HostHelloMessage,
  type LayoutMessage,
  type ProtocolMessage,
  type ProtocolVersion,
  type ReadyMessage,
  type ResizeMessage,
  type VisibilityMessage,
} from "./messages.js";

export { parseTargetOrigin, type TargetOrigin } from "./target-origin.js";

export {
  AA_NORMAL_TEXT_CONTRAST,
  ACCENT_INK,
  contrastRatio,
  DEFAULT_THEME_TOKENS,
  describeThemeContrastViolation,
  sanitizeThemeOverride,
  THEME_TOKEN_NAMES,
  themeTokensToCss,
  validateThemeContrast,
  type ThemeContrastPair,
  type ThemeContrastResult,
  type ThemeContrastViolation,
  type ThemeOverride,
  type ThemeTokenName,
} from "./theme-tokens.js";

export {
  createProtocolMessageListener,
  postProtocolMessage,
  type MessageEventLike,
  type MessageTarget,
} from "./safe-post-message.js";
