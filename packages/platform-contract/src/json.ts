/**
 * A value serializable as JSON with no loss — what a generic room can
 * persist and later restore without understanding the game that produced it.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
