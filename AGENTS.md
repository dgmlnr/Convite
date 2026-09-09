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
creerle al resultado.

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

**Y comparar hashes tampoco alcanza**: dos pasadas idénticas sobre `main` sin
tocar llegaron a diferir en **9 de 60** renders por jitter sub-píxel (peor caso
67 px, 0,022%). Otro día el piso de ruido midió cero. Por eso: **control de
determinismo primero** —dos pasadas sobre la base sin cambios— y después
comparar **a nivel de píxel contra ese piso medido**.

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

Medirlo **antes de commitear**, que es cuando sirve — `git diff origin/main` sin
`...HEAD` incluye lo que todavía está en el árbol de trabajo:

```
git diff --numstat origin/main | \
  awk '{a=$1;f=$3; if (f ~ /\.test\./) t+=a; else p+=a} \
       END {printf "produccion %d  tests %d\n", p+0, t+0}'
```

(Con `origin/main...HEAD` cuenta sólo lo ya commiteado y devuelve cero sobre
trabajo en curso — la primera versión de esta línea tenía justo ese defecto, y lo
encontró correrla.)

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
