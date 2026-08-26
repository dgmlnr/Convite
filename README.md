# Convite

Plataforma multitenant de juegos embebibles en cualquier sitio web.

El tenant integra un widget con una sola etiqueta `<script>`. El widget abre en una
pantalla de selección de juego, muestra únicamente los juegos que su contrato habilita
y adopta los colores de identidad del sitio.

## Estado

En desarrollo, y jugable de punta a punta. Están el motor de reglas completo, el contrato
genérico de juegos, el transporte con autenticación por tenant, los dos roles de servidor,
el lobby con emparejamiento, los bots y el widget embebible.

Se juega mano a mano y también **2 contra 2**. La suite e2e levanta la topología real
—los dos roles detrás de un mismo origen— y juega partidas completas contra ella.

## Primer juego: Truco Argentino

Sin flor, a 15 o 30 puntos según elija el jugador, mano a mano o en parejas. Toda partida
puede jugarse contra otra persona o contra bots en tres niveles de dificultad, de modo que
nadie quede bloqueado cuando no hay rival esperando.

Si un jugador se desconecta se abre una ventana de reconexión; si no vuelve, un bot ocupa
su lugar en nivel normal y la partida continúa.

### Lo que trae el 2 contra 2

En parejas aparecen cosas que mano a mano no existen, y cada una es una regla, no un
adorno:

- **Señas.** Vocabulario cerrado —las dos matas, los dos sietes bravos, el tres y el dos—
  con un tope por mano. En una mesa real señalar de más te hace *leer*; acá ese costo no
  existe, así que lo pone el tope.
- **Consultar al compañero.** Preguntarle qué haría, y gasta de la misma cuota que las
  señas: preguntar y señalar compran lo mismo, así que pagan lo mismo.
- **Ronda de tantos, uno por uno.** El envido se canta por turno desde la mano, cada
  jugador con su propia mini card. Decir *"son buenas"* concede por **todo el equipo**,
  no sólo por uno.

### Una regla de la casa, elegida a propósito

**El envido lo abre el pie de cada equipo.** Tres reglamentos publicados se contradicen
entre sí sobre esto: Wikipedia dice los pie, trucoargentino.com.ar dice los dos a la
izquierda del repartidor —justo los otros dos— y el reglamento de juegosdesalon.com dice
que cualquiera en su turno. Convite juega la primera, y el motor lo deja escrito junto al
código para que nadie lo "corrija" contra el reglamento que le toque tener a mano.

Esa regla le saca el canto a dos de los cuatro asientos, y uno de ellos puede ser el que
tiene los tantos. Las señas nombran **cartas**, nunca tantos, así que un compañero con 33
no tenía cómo decirlo. Por eso el pie puede **preguntar** antes de cantar: misma ventana
que el canto, mismo precio que una seña.

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

### Probarlo a mano

Un solo comando. El widget vive embebido en un sitio ajeno, así que probarlo de verdad
necesita un sitio que lo embeba: servirlo suelto no ejercita el camino real.

```sh
pnpm dev:server
```

Después abrí <http://localhost:5173>.

Eso levanta **el producto entero**: los dos roles de servidor, el proxy que los pone
detrás de un mismo origen, y un sitio de prueba que embebe el widget. Es la misma
topología que arma la suite e2e, y es deliberado: un arranque de un solo proceso no es
una versión más chica del despliegue, es una distinta y rota.

Para abrirlo desde otro dispositivo de la red:

```sh
pnpm dev:lan            # detecta la dirección LAN de esta máquina
pnpm dev:lan 10.0.0.5   # o nombrala a mano
```

Tres detalles que cuestan una tarde si no se saben:

- **El origen de la plataforma se hornea al compilar**, no al arrancar: `loader.js` es un
  script clásico sin acceso a variables de entorno en tiempo de ejecución. Por eso el
  script de arranque **también construye**: es el único que sabe qué dirección está por
  servir, así que el origen horneado y el servido no pueden separarse porque alguien corrió
  las dos mitades en el orden equivocado. Un bundle horneado para `localhost` no funciona
  desde otro dispositivo, en silencio y sin error en consola.
- **El puerto 5173 no es decorativo.** Está en la lista blanca del tenant de desarrollo
  (`DEV_TENANT` en `apps/server/src/config.ts`). Servir la página desde otro puerto hace que
  el servidor la rechace, que es exactamente lo que debe pasar.
- **El navegador cachea `loader.js`.** Si cambiás algo y la página sigue vacía, recargá
  salteando la caché antes de buscar el problema en otro lado.

`HEXDEV_ALLOW_DEV_DEFAULTS=true` va incluido en `dev:server`. La variable es deliberada: sin
una clave de firma configurada, el servidor se niega a arrancar. El modo de desarrollo hay
que pedirlo de forma explícita, nunca se asume.

Para escalar horizontalmente hace falta además `HEXDEV_REDIS_URL`. Sin ella todo corre en
memoria, en un solo proceso. Con ella mal configurada, el servidor **no arranca**: caer en
silencio a memoria reintroduciría justo la rotura invisible que esa variable existe para
cerrar.

## Dos roles, un origen

La plataforma se despliega como **dos procesos distintos**, y la separación es de
seguridad, no de escala.

| Rol | Proceso | Qué tiene | Qué sirve |
| --- | --- | --- | --- |
| Acuñador | `apps/mint-server` | la **semilla** Ed25519 (`HEXDEV_SESSION_SIGNING_KEY`) | `/embed`, `/session/renew`, `/loader.js`, `/assets/*` |
| Partida | `apps/server` | sólo la **clave pública** (`HEXDEV_SESSION_PUBLIC_KEY`) | colyseus: matchmaking y las salas |

Antes de esta separación toda réplica firmaba y verificaba, así que comprometer
**una sola instancia** alcanzaba para acuñar tokens de toda la flota. Ahora el rol de
partida es incapaz de acuñar por construcción: recibe una clave importada como
verify-only y no extraíble, y el objeto que obtiene no tiene `mint`.

**Los dos roles van detrás de un mismo origen público, ruteados por path.** No es una
preferencia: el widget arma la URL de `/session/renew` de forma **relativa**, y ese
origen se valida contra los orígenes de widget de este despliegue. Si el rol acuñador
vive en otro hostname, esa validación no puede pasar nunca.

La suite e2e corre exactamente con esa forma (ver `e2e/support/front-proxy.ts`), así que
la topología está probada y no solamente descrita.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm test` | Compila y corre toda la suite, en Node y en un navegador real |
| `pnpm test:e2e` | Partidas reales de punta a punta, en navegador y contra el servidor real |
| `pnpm test:visual` | Regresión visual por captura de pantalla, dentro del contenedor de render pinneado (requiere Docker; ver `visual/README.md`) |
| `pnpm test:visual:host` | La misma suite contra el navegador de tu máquina: chequeo rápido, no canónico |
| `pnpm test:redis` | Propiedades entre instancias contra un Redis real en Docker |
| `pnpm dev:server` | Compila y levanta el producto entero en `localhost`: ambos roles, el proxy y un sitio de prueba |
| `pnpm dev:lan` | Lo mismo, en la dirección de red de esta máquina, para abrirlo desde otro dispositivo |
| `pnpm dev:host` | Sólo el sitio de prueba, en `:5173` |
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
| `games/truco-module` | Adaptador que implementa el puerto sobre el motor, mano a mano y en parejas |
| `games/truco-ui` | La mesa: cartas, cantos, señas y el tablero |
| `games/truco-bot` | Los tres niveles de bot |
| `transport-colyseus` | Sala de partida genérica y sala de presencia |
| `transport-colyseus-client` | El lado cliente del mismo transporte |
| `widget-sdk`, `widget-protocol`, `widget-frontdoor` | Superficie de embebido para el tenant |
| `apps/mint-server` | Rol acuñador: tiene la semilla de firma y sirve la puerta de entrada |
| `apps/server` | Rol partida: sólo verifica. Cablea el registro de juegos y escucha |
| `apps/widget-app` | El widget en sí: selección de juego, lobby y mesa |

## Créditos

El arte de las cartas es de **Basquetteur**, publicado en Wikimedia Commons y distribuido
como SVG por [spanish-playing-cards-svg](https://github.com/gjenkins20/spanish-playing-cards-svg).
Está licenciado [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), y **se le
hicieron cambios**, dos: los vectores se rasterizaron a WebP de 329×520 para servirlos, y se
completó el fondo de la cara. En 36 de las 40 cartas el relleno del fondo no llega al borde
y deja parte de la carta transparente —en el as de espada desde x=211 de 329—, así que sobre
el felt se veía la mesa a través del naipe. Se rellena continuando el propio degradado de
ocho bandas de la carta. Nada más: ni retoque, ni recorte, ni recolor. La receta exacta está
en `packages/spanish-deck-ui/tools/process-svg-deck.mjs`.

Acá la atribución no es cortesía: es un término de la licencia, y por eso vive en el
código (`packages/spanish-deck-ui/src/about.ts`) con un cercado que verifica que los tres
requisitos —autor, enlace a la licencia, y que hubo cambios— sigan estando.

El mazo anterior eran los escaneos de Heraclio Fournier de 1878 (Museo Fournier de Naipes,
Vitoria-Gasteiz), de dominio público. Se cambió por legibilidad a los tamaños que el juego
realmente dibuja: arte de línea plana y de alto contraste se lee a 60px como no se lee un
naipe fotografiado de 1878. `process-fournier-deck.mjs` sigue en el repo documentando de
dónde salían esos binarios, porque volver atrás es una opción real.

## Licencia

[Apache-2.0](LICENSE). Podés usarlo, modificarlo y redistribuirlo, incluso comercialmente,
con dos condiciones: **dar crédito** —conservando el archivo [`NOTICE`](NOTICE), que es donde
la licencia pone esa obligación (§4d)— y dejar constancia de los cambios que le hagas.

Se eligió Apache-2.0 y no MIT por la **concesión explícita de patentes**, que protege tanto a
quien contribuye como a quien lo usa. Y no una licencia Creative Commons, aunque el mazo use
una: **CC no está pensada para software** —lo dice la propia Creative Commons— porque no
contempla código fuente ni patentes.

**Con una excepción, y no es menor**: los 40 archivos de
`packages/spanish-deck-ui/assets/fronts/` son obra derivada y llevan **CC BY-SA 3.0**, no
Apache. Están licenciados aparte en `packages/spanish-deck-ui/assets/LICENSE`.

El ShareAlike de esas imágenes **no alcanza al código**: obliga sobre adaptaciones *del
arte*, y este software no es obra derivada de un naipe. Redistribuir el repo es honrar dos
juegos de términos en paralelo, no uno contagiando al otro.
