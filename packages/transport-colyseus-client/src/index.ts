export type { ClientLike, RoomLike, Unsubscribe } from "./ports.js";
export { createTransportClient } from "./client.js";
export type { TransportClientOptions } from "./client.js";
export type { JoinMatchmakingQueueOptions, MatchmakingQueueConnection, PairedMatch, PresenceConnection, WatchPresenceOptions } from "./presence-connection.js";
export { joinMatchmakingQueue, watchPresence } from "./presence-connection.js";
export type {
  ConsultAdviceMessage,
  ConsultAnswerMessage,
  ConsultAskMessage,
  ErasedAction,
  MatchConnection,
  ReconnectMatchOptions,
  StartBotMatchOptions,
} from "./match-connection.js";
export { joinMatchFromReservation, reconnectMatch, startBotMatch } from "./match-connection.js";
