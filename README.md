# HexDev-Gamify

A multitenant platform that serves embeddable games to any website.

Tenants embed a widget with a single `<script>` tag. The widget opens on a game
selection screen, shows only the games that tenant's contract enables, and adopts
the tenant's brand colors.

## Status

Greenfield. The `platform-foundation-truco` change is in progress: it delivers the
platform skeleton plus the first game, Truco Argentino.

## First game: Truco Argentino

Version 1 ships head-to-head Truco (two players), without flor, to 15 or 30 points
at the player's choice. Every match can be played against another person or against
a bot at one of three difficulty levels, so a player is never blocked when no
opponent is waiting.

## Architecture

The rules of each game live in a pure, deterministic engine with no I/O. The same
engine code runs on the authoritative server and in the browser, so there is exactly
one implementation of the rules and no way for the two to disagree.

Architectural boundaries are enforced by the compiler and the package manager rather
than by convention: the engine's TypeScript configuration excludes DOM and Node types,
so reaching for `document` or `process` fails to compile, and transport dependencies
resolve in exactly one package.

Clients never receive an opponent's cards. The engine projects a per-player view whose
type cannot structurally hold hidden information.

## Requirements

- Node.js 24+
- pnpm 11+

This project uses pnpm exclusively.

## Getting started

```sh
pnpm install
pnpm test
```

## License

Proprietary.
