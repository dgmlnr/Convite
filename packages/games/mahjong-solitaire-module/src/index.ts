export type { DealBoardAction, GeneratedDeal, SolutionStep } from "./deal.js";
export { SYSTEM_ACTOR_ID, chooseFreePosition, dealBoard, generateDeal } from "./deal.js";
export type { AbandonBoardAction, MahjongSolitaireAction, MahjongSolitaireConfig, SolitaireMatchState, SolitairePlayerView } from "./module.js";
export { getAbandonedSeatAction, mahjongSolitaireModule, requestMahjongSolitaireSystemAction } from "./module.js";
export { idsByMatchKey, pairKeys } from "./wall.js";
