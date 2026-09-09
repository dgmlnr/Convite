# Cómo se trabaja acá

Reglas permanentes para quien implemente en este repositorio. Cada una está
porque **costó algo medido**, y ese costo está escrito al lado: una regla sin su
motivo se saltea en cuanto aprieta el apuro.

Lo específico de una tarea va en su propio pedido. Esto no se repite ahí.

---

## Alcance de los chequeos: contra su radio de impacto

**La regla que más tiempo ahorra sin perder una sola aserción.**

Una mutación en `generala-engine` se estaba validando contra **304 archivos de
test**. 303 no pueden reaccionar: no importan ese código. Correr el paquete
afectado baja esa corrida de ~36 segundos a dos o tres, y una escalera de 30
mutaciones de 18 minutos a menos de dos.

| Chequeo | Cuándo corre |
| --- | --- |
| `pnpm vitest run <paquete>` | en cada mutación y en cada ciclo rojo/verde |
| `pnpm test` (suite entera) | **una vez por PR**, antes de commitear |
| `pnpm test:e2e` (~5 min) | **una vez por cadena, en la punta** — no por eslabón |
| `pnpm visual:review` | sólo si el diff puede mover un render |
| `pnpm check:bundle` | si algo puede entrar al bundle del navegador |
| `pnpm check:boundaries` | **siempre antes de un PR** — CI lo corre y falla por él |
| `pnpm check:scripts` | **siempre antes de un PR** — idem, y `pnpm test` ya lo incluye |
| `pnpm exec eslint . --max-warnings 0` | **siempre antes de un PR** — CI lo corre y `pnpm test` **NO** |

Las tres últimas estuvieron ausentes de esta tabla y CI las corre igual: alguien
que se guiara sólo por acá llegaba a CI con una violación de límites sin
enterarse.

**Y la de eslint se agregó después de que el mismo agujero cobrara de nuevo.**
`pnpm test` es `tsc -b && tsc --noEmit -p scripts && vitest`: eslint no está
adentro. En una tanda, eslint encontró un bug que **`tsc`, 3.900 tests y el e2e
no vieron** — un `replace()` sin contador había inyectado la misma declaración en
tres renderizadores en vez de en uno. Que esta tabla ya se hubiera corregido una
vez por exactamente este motivo, y volviera a estar incompleta, es el argumento:
una lista de chequeos se audita **contra el workflow de CI**, no contra la
memoria de quien la escribió.

**"Un chequeo que no corriste no es un chequeo" sigue vigente.** Lo que cambia
es contra qué corre, no si corre. Si acotás un chequeo, **decilo y decí por
qué** — un alcance elegido y declarado es una decisión; uno silencioso es una
omisión.

---

## Las trampas que ya cobraron

**`git checkout --` sobre trabajo sin commitear se lleva el archivo entero.**
Tres personas se destruyeron su propio código así, incluido el orquestador
**después de advertirlo**. Por eso: **commitear antes de mutar**, y que el
script de mutación **aborte si `git status --porcelain` no está vacío**. La
disciplina va en el script, no en la memoria — una advertencia que ya falló una
vez no se arregla repitiéndola más fuerte.

**Y el filo peor no es ése: `git checkout --` restaura desde el ÍNDICE, no desde
`HEAD`.** Después de un `git add -A`, revierte en silencio toda edición
posterior — incluidas las que ya verificaste, que es cuando más duele porque
parecen a salvo. Cobró dos veces en la misma tanda. Lo que funciona es
**`git add -A` inmediatamente antes de cada mutación**, no una vez al principio.

**Pipear un chequeo obligatorio a `tail` devuelve el código de salida de
`tail`.** Un `eslint` que fallaba se reportó como éxito. Correr sin pipe y leer
su propio `$?`.

**El mecanismo de tareas en background mata el proceso al limpiar.** Perdió una
corrida de 60 minutos y se parecía a un test colgado. Los chequeos obligatorios
se corren desligados, leyendo su propio código de salida.

**Procesos y contenedores colgados.** Un `run-vitest` huérfano retiene un árbol
de Chromium y hace fallar tests de navegador **en un archivo distinto cada
vez**. Un `hexdev-postgres-test-*` viejo hace que el e2e no reporte conteos.
**No hay correlación entre el resultado de una corrida y si deja residuo**:
chequear antes y después, siempre.

**Una mutación que no se aplicó vuelve en verde.** Patrones con guiones largos,
comillas invertidas o saltos de línea fallan en silencio y el `sd` sale con
éxito. **Confirmar cada mutación con un `git diff --stat` no vacío** antes de
creerle al resultado. Un script que aborta si el patrón no aparece —o si el
`git diff` sale vacío— cierra esto de una vez; acordarse, no.

**`node scripts/run-vitest.mjs` sin `pnpm exec` sale con 127.** `vitest` no
queda en el `PATH` adentro de `xvfb-run`, y el error (`vitest: orden no
encontrada`) aparece en el log, no en el código de salida que uno mira primero.
Entrar siempre por **`pnpm exec node scripts/run-vitest.mjs run <archivo>`**.

---

## Qué hace válido a un verde

**Medir, no estimar.** Todas las rebanadas de Generala se pasaron de su
pronóstico, la mayoría al doble. Una proyección de líneas no es una medición: un
corte proyectado en 445+160 midió 546+136, porque el harness de tests que las
dos mitades necesitan **se cuenta una sola vez**.

**El control negativo es lo que prueba una valla.** Un test que pasa puede estar
cercando aire. El que **falla contra el código viejo** prueba todo. Si una valla
no puede ponerse en rojo, no es una valla.

**Borrar una cláusula y ver si algo se rompe.** Encontró huecos reales **seis
veces seguidas**, incluida una cláusula de seguridad sin medir desde que se
embarcó. Si no se rompe nada: o la cláusula no hace falta, o falta el test. Las
dos respuestas importan.

**Cuidado con la valla que mide el mecanismo equivocado.** Un test que decía
medir una consulta de contenedor medía `flex-wrap`: cuatro borrados del
mecanismo que el test nombra **pasaban los cuatro**. Cuando un test nombra un
mecanismo, plantá la mutación que borra **ese** mecanismo.

**Fixtures donde las lecturas discrepen.** Una regla de desempate quedó sin
medir porque todos los fixtures tenían la cara más alta también última: "más
alta" y "última" coincidían en todos.

**Un comentario que afirma una garantía es una hipótesis.** `deal.ts` decía que
un `start-hand` forjado era imposible y **nadie lo probó porque el comentario
decía que estaba cubierto** — un jugador sentado pudo repartirse las cartas
durante meses. Un comentario correcto a medias es peor que ninguno: el que falta
te deja desconfiado, el que miente te deja tranquilo.

---

## Renders

**Las capturas de `*.scene.test.ts` no se commitean** (`.gitignore:70`), así que
`git diff` después de `visual:review` es una valla vacía.

**`--update` NO reescribe una captura que se movió poco.**
`vitest.visual.config.ts` fija `allowedMismatchedPixelRatio: 0.01`, así que una
escena que cambió menos del 1% **pasa**, y lo que pasa no se regraba. Un cambio
de etiquetas que movía 0,19% dejó cinco imágenes viejas en disco, la comparación
dio **cero en las nueve escenas**, y una de las capturas era de **antes de que la
tarea empezara**. Tres pasadas se perdieron así antes de que alguien lo notara.

Por eso: **vaciar el directorio de capturas antes de renderizar**, como primer
paso del script y no como algo que uno recuerda.

**Y moverlas, no borrarlas.** Cuesta lo mismo —`mv "$D"/*.png "$desvan/"`— y
conserva la evidencia: fue exactamente lo que permitió auditar después una tanda
sin creerle nada al que la hizo, comparando el archivo viejo contra el nuevo. Un
`rm` deja al que verifica sin nada que mirar.

**El control de determinismo de dos pasadas mide el piso equivocado.** Medido:

| Comparación | Renders movidos |
| --- | --- |
| `main`, tres pasadas, **mismo** worktree | **0 de 57** |
| dos juegos independientes de renders de `main` | **11 de 60** |

Un árbol es internamente determinista; dos corridas independientes no coinciden
entre sí. Y la comparación que hace de verdad quien revisa una rama es
justamente ésa. O sea: **el control de dos pasadas en el mismo árbol siempre da
cero y no protege de nada.** El piso hay que medirlo entre las dos corridas que
después se van a comparar.

**Y contar píxeles sin mirar la magnitud del delta confunde dos hallazgos
opuestos.** De esos 11:

| Escena | Píxeles distintos | Delta máximo |
| --- | --- | --- |
| `escoba-lobby-two-families` | 26.044 (**17,83%**) | **1** en 26.038 de ellos |
| `generala-front-door-wide` | 26.269 (8,25%) | 3 |
| `escoba-table-2v2-mid-hand` | 6.928 (9,44%) | 2 |
| `table-hand-full-piles` | 205 | 1, todos |

**El 17,83% de los píxeles "cambió" y ni uno solo es visible**: son redondeos de
decodificación de las ilustraciones. Un umbral por conteo habría gritado; uno por
delta no dice nada. **Reportar siempre las dos cifras** —cuántos píxeles y cuánto
se movieron— y decidir por la segunda.

La única escena con delta grande fue `dice-toss-filmstrip` (máx 26), y tiene
sentido: es la que fotografía una animación cuadro por cuadro, así que depende
del tiempo. Una escena que depende del reloj se congela con el `now` inyectado
(`MatchRenderContext.now`), no se tolera con un umbral.

**Los imports entre paquetes se renderizan desde `dist/`, y ahora el script lo
reconstruye solo.** `visual:review`, `test:visual` y `test:visual:host` corren
`tsc -b` antes de renderizar y no renderizan nada si falla. Era una regla acá
—"correr `tsc -b` antes"— y una regla que depende de que cada uno se acuerde no
es un arreglo: se saltó dos veces, y las dos se disfrazaron de otra cosa (cinco
escenas explotando dentro de `generala-ui/dist/tray.js`, un archivo que nadie
había tocado; tres corridas de revisión hasheando imágenes de código que no
estaba en el árbol). No hace falta acordarse de nada.

**Si un render se mueve, mirarlo y describir qué cambió.** Todos los defectos
visuales de este proyecto los encontró alguien mirando: un contraste de 1,07:1,
inglés en una pantalla castellana (dos veces), tres estados idénticos en la
planilla, una tarjeta que se leía como dominó, un overlay que se cancelaba solo.
Ninguno un test.

---

## Entrega

**Todo PR apunta a `main`.** Nunca al PR anterior. Una cadena cuyos hijos se
apuntan entre sí **se mergea a ramas en vez de a `main`** — pasó, y hubo que
rescatar tres PRs que figuraban MERGED y no estaban en ningún lado. **"El PR
figura mergeado" y "el código está en `main`" no son la misma afirmación.**

**Nunca `--delete-branch`.** En una cadena borra la rama base del hijo y GitHub
lo cierra solo.

### Mergear una tanda escrita en paralelo

Cuatro PRs escritos a la vez contra el mismo `main` dan los cuatro en verde y los
cuatro `MERGEABLE/CLEAN`. **Eso no sobrevive al primer merge**: en cuanto uno
entra, el suelo de los otros tres se movió y ninguno de esos verdes se corrió
sobre el árbol que ahora se va a mergear.

**"El CI está verde" y "el CI está verde sobre lo que voy a mergear" no son la
misma afirmación** — la hermana de la regla de arriba. Pasó: un PR seguía
mostrando sus cuatro chequeos en `SUCCESS` cuando su estado real ya era
`CONFLICTING/DIRTY`. Lo que lo detecta es preguntar por la ascendencia, no por el
color:

```
h=$(gh pr view <n> --json headRefOid --jq .headRefOid)
git merge-base --is-ancestor origin/main "$h" \
  && echo "verde del arbol combinado" || echo "verde del arbol VIEJO"
```

**Y hay conflictos que git no puede ver.** Un PR renombró unas etiquetas; otro
traía **seis aserciones contra las viejas**, en archivos que el diff del primero
nunca tocó. Merge limpio, cero marcadores, seis tests rojos. Ninguna herramienta
de merge encuentra eso: lo encontró **correr la suite entera sobre el árbol
combinado**, que es lo que hay que hacer en cada eslabón de una tanda paralela.

Del lado bueno, la protección de rama que exige estar al día (`MERGEABLE/BEHIND`)
es la que obliga a que CI corra sobre el árbol combinado. **No es un estorbo: es
el único momento en que ese árbol se prueba.**

**Resolver un conflicto de tests se verifica contando, no con un verde.** Cuando
son dos `describe` independientes en el mismo ancla, la resolución es conservar
los dos — y la unión se comprueba con aritmética: base 11 + 3 de `main` + 2 del
PR = 16, que fue lo que quedó. Un verde no prueba que no se haya perdido un
bloque; **un bloque que desaparece se lleva sus aserciones y no rompe nada.**

### El presupuesto de revisión mide LÍNEAS DE PRODUCCIÓN

**400 líneas de producción por PR. Los tests no cuentan.**

Contarlos juntos era medir la cosa equivocada, y se midió: en los tres PRs del
orden de tachado, la producción fue el **28%, 13% y 20%** del total. Nunca pasó
de 221 líneas. Todo lo demás eran tests, y en el caso más grande casi todo era
**reparación de fixtures que el propio cambio invalidó**.

Reparar un fixture no es escribir lógica: quien revisa confirma que la
actualización es consistente, no razona una corrección desde cero. Un presupuesto
que las cobra igual **castiga exactamente lo que queremos que pase** — comentar
bien y cercar bien — y así se otorgaron nueve excepciones seguidas que, con esta
medida, no habrían hecho falta.

Medirlo **antes de commitear**, que es cuando sirve. `git add -N .` registra los
archivos NUEVOS sin agregar su contenido, que es lo único que hace falta para que
`git diff` los vea:

```
git add -N . && git diff --numstat origin/main | \
  awk '{a=$1;f=$3; if (f ~ /\.test\./) t+=a; else p+=a} \
       END {printf "produccion %d  tests %d\n", p+0, t+0}'
```

**Esta línea se equivocó dos veces, y las dos las encontró correrla**, no leerla:

- `origin/main...HEAD` cuenta sólo lo ya commiteado y devuelve **cero** sobre
  trabajo en curso — mientras la regla de al lado dice "medí antes de commitear".
- Sin `git add -N`, `git diff` **no ve archivos nuevos**. Un PR que introduce un
  módulo —el paso 1 exacto de "introducir y después adoptar", acá abajo— medía
  `produccion 58` cuando eran 234.

Que un instrumento de medición se haya equivocado dos veces en el mismo párrafo
es el argumento entero de este archivo: **una herramienta que no se midió a sí
misma no es evidencia de nada.**

**Reportar las dos cifras en el cuerpo del PR.** Un cambio genuinamente pesado en
tests tiene que seguir siendo visible, sin quedar bloqueado por serlo.

**Si te pasás de 400 de producción, partí** — pero nunca de una forma que embarque
una guarda a medias, una valla vacíamente cierta, o un estado intermedio que rompa
lo que el cambio existe para arreglar. **Una rebanada que deja el CI en rojo no es
una rebanada.**

### Introducir, y después adoptar

La forma que hace partible casi cualquier cambio grande, medida y no supuesta:

1. **Introducir** — la función o constante nueva llega **exportada y con sus
   propios tests, sin que nadie la consuma**. No cambia ningún comportamiento, así
   que no puede romper un fixture de nadie. Verde por construcción.
2. **Adoptar** — se cablea, y **todos los fixtures que el cambio invalida se
   arreglan acá mismo**. Es el PR grande, y está bien que lo sea.
3. **La interfaz**, si la hay.

Se creyó que un cambio de reglas era indivisible y que cualquier corte dejaba el
CI en rojo. **Era falso**: el paso 1 es más chico *y* verde. La regla no es
atómica; sólo lo es el cableado con sus fixtures.

Y partir **mejoró el resultado final**: el árbol terminó difiriendo del PR único
en tres archivos, y los tres eran mejoras que el corte obligó.

**Partir mueve las aserciones con su código.** Después de partir hay que
**re-correr la escalera entera contra cada mitad**: una mitad puede quedar sin
cercar sin que ningún test desaparezca.

**Sin atribución de IA** en commits ni cuerpos de PR.

---

## Engram

Trunca a **50.000 bytes** (bytes UTF-8, no caracteres) y devuelve **HTTP 200**.
`mem_save` con un `topic_key` **reemplaza el cuerpo entero**: destruyó 27 KB una
vez. Su API HTTP en `127.0.0.1:7437` acepta `PATCH /observations/{id}` y `POST
/observations`, así que un cuerpo grande va desde un archivo con `jq --rawfile` y
`curl --data-binary @archivo` en vez de pasar por un parámetro. **Difear la
relectura siempre.**
