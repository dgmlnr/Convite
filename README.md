# HexDev-Gamify

Plataforma multitenant de juegos embebibles en cualquier sitio web.

El tenant integra un widget con una sola etiqueta `<script>`. El widget abre en una
pantalla de selección de juego, muestra únicamente los juegos que su contrato habilita
y adopta los colores de identidad del sitio.

## Estado

En desarrollo. El cambio `platform-foundation-truco` entrega la base de la plataforma
junto con el primer juego, el Truco Argentino.

Ya funciona: el motor de reglas completo, el contrato genérico de juegos, el transporte
con autenticación por tenant, el servidor, el lobby con emparejamiento y los bots.
Falta el widget embebible.

## Primer juego: Truco Argentino

La primera versión es mano a mano, sin flor, a 15 o 30 puntos según elija el jugador.
Toda partida puede jugarse contra otra persona o contra un bot en tres niveles de
dificultad, de modo que nadie quede bloqueado cuando no hay rival esperando.

Si un jugador se desconecta se abre una ventana de reconexión; si no vuelve, un bot
ocupa su lugar en nivel normal y la partida continúa.

## Próximos juegos

Escoba de 15 y Generala. La plataforma está construida para que ambos entren sin
modificar el núcleo: el mazo español vive en su propio paquete —no dentro del truco—
y el lobby deriva sus modalidades de la configuración que declara cada juego.

## Arquitectura

Las reglas de cada juego viven en un motor puro y determinístico, sin entrada ni salida.
El mismo código corre en el servidor autoritativo y en el navegador, así que existe una
sola implementación de las reglas y ninguna posibilidad de que ambas discrepen.

El motor nunca genera aleatoriedad: recibe el reparto ya materializado. Eso hace que el
determinismo sea estructural y permite, por ejemplo, medir la fuerza de un bot con un
torneo reproducible en lugar de un test que depende de la suerte.

### Las fronteras no se documentan: no compilan

La configuración de TypeScript del motor excluye los tipos de DOM y de Node, de modo que
usar `document` o `process` es un error de compilación, no una advertencia que alguien
pueda desactivar. Las dependencias de transporte resuelven en un solo paquete: un import
no declarado directamente no resuelve. Y la dirección del grafo de dependencias la
verifica dependency-cruiser en cada build.

### Los clientes nunca reciben las cartas del rival

El motor proyecta una vista por jugador cuyo tipo no puede contener información oculta.
Filtrar las cartas del oponente no es un error que se escape a producción: es un error
de compilación.

En el modo contra bot dentro del navegador no existe una frontera de seguridad real —el
estado autoritativo comparte el proceso con el jugador— y así está documentado. En
multijugador el servidor es autoritativo y sí lo es.

## Requisitos

- Node.js 24 o superior
- pnpm 11 o superior

Este proyecto usa pnpm exclusivamente. No usar `npm` ni `npx`.

## Cómo empezar

```sh
pnpm install
pnpm test
```

`pnpm test` compila antes de correr, así que no hace falta un paso previo.

### Levantar el servidor en desarrollo

```sh
HEXDEV_ALLOW_DEV_DEFAULTS=true pnpm --filter @hexdev/server start
```

La variable es deliberada: sin un secreto de sesión configurado, el servidor se niega a
arrancar. El modo de desarrollo hay que pedirlo de forma explícita, nunca se asume.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm test` | Compila y corre toda la suite, en Node y en un navegador real |
| `pnpm typecheck` | Verificación de tipos de todo el workspace |
| `pnpm check:boundaries` | Verifica que ningún paquete viole la dirección de dependencias |
| `pnpm exec eslint .` | Linter, incluidas las reglas de determinismo del motor |

## Estructura

| Paquete | Responsabilidad |
| --- | --- |
| `platform-contract` | El puerto `GameModule` y su suite de conformidad. Cero dependencias |
| `platform-core` | Registro de juegos, autenticación de tenants, presencia y emparejamiento |
| `spanish-deck-ui` | El mazo español. Fuera del truco, porque la escoba usa el mismo |
| `games/truco-engine` | Reglas del truco. Puro, sin entrada ni salida |
| `games/truco-module` | Adaptador que implementa el puerto sobre el motor |
| `games/truco-bot` | Los tres niveles de bot |
| `transport-colyseus` | Sala de partida genérica y sala de presencia |
| `widget-sdk`, `widget-protocol` | Superficie de embebido para el tenant |
| `apps/server` | Composition root: cablea todo y escucha |

## Créditos

Las cartas reproducen el mazo español de Heraclio Fournier de 1878, del Museo Fournier
de Naipes de Vitoria-Gasteiz, digitalizado en Wikimedia Commons. La obra está en dominio
público. La atribución no es legalmente exigible: se incluye por procedencia y respeto a
la fuente.

## Licencia

Propietaria.
