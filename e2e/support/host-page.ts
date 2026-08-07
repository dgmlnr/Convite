/**
 * A deliberately generic third-party page — NOT a news/media site (the user
 * corrected this fixture bias twice in this project's history; see
 * apply-progress obs 2968's "the fixture arrests a sesgo ya descartado").
 * Any ordinary site embedding the widget looks like this: its own unrelated
 * content, plus one `<script>` tag. This exact identity ("Club de
 * Jardinería") is the one a prior live verification session already used
 * and the user did not object to.
 */
export function renderHostPage(serverOrigin: string, embedKey: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Club de Jardinería — Boletín Semanal</title>
</head>
<body>
<header>
  <h1>Club de Jardinería — Boletín Semanal</h1>
</header>
<main>
  <article>
    <h2>Cómo cuidar las suculentas en invierno</h2>
    <p>Reducí el riego a una vez cada dos semanas y evitá el sol directo del mediodía.</p>
  </article>
  <section id="hexdev-gamify-slot">
    <script src="${serverOrigin}/loader.js" data-embed-key="${embedKey}" defer></script>
  </section>
</main>
<footer>
  <p>Boletín generado para pruebas end-to-end.</p>
</footer>
</body>
</html>
`;
}
