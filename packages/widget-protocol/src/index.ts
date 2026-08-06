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
  sanitizeThemeOverride,
  THEME_TOKEN_NAMES,
  type ThemeOverride,
  type ThemeTokenName,
} from "./theme-tokens.js";

export {
  createProtocolMessageListener,
  postProtocolMessage,
  type MessageEventLike,
  type MessageTarget,
} from "./safe-post-message.js";
