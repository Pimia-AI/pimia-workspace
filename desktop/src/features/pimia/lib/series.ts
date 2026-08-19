/**
 * Series mensuales paralelas: cruzarlas sin desplazarlas, y medirlas para
 * pintarlas con barras CSS.
 *
 * Lo que la API manda para una gráfica no es una lista de puntos: es un eje
 * (`months`) y varias series **cruzadas por índice**. Ahí está la trampa que
 * este fichero existe para cerrar, y ya mordió en el panel del anfitrión web:
 * si una serie llega con un elemento menos —una consulta agrupada que sólo
 * emite los meses con filas—, cada importe cae un mes antes que el suyo. Nada
 * falla, nada queda vacío, y el resultado **sigue pareciendo una gráfica
 * plausible**: el año entero corrido.
 *
 * ⚠️ **Este fichero no importa NADA a propósito**, ni siquiera `./money.ts`. Es
 * lo que lo hace probable con el type stripping de `node --test`, que no
 * resuelve el alias `@/`, y por eso las tres piezas que viven aquí son
 * exactamente las tres donde un error **no falla, sólo desplaza o miente de
 * tamaño**: la de alinear, la de rotular y la de medir la barra.
 *
 * El original de `alignedColumn` y `monthLabel` está en `lib/dashboard.ts` del
 * anfitrión web, escrito y probado allí para `GET /dashboard`. Aquí se
 * reescriben —no se copian a ciegas— porque el otro extremo es distinto:
 * `/customers/{id}/stats` sirve el mismo dato en **camelCase**
 * (`chartData.invoiceTotals`) donde el panel lo sirve en **snake_case**
 * (`chart_data.invoice_totals`). Son dos controladores, no uno; un
 * normalizador reutilizado tal cual devolvería lista vacía sin decir nada.
 */

/**
 * Una de las series paralelas, **sólo si casa con el eje**.
 *
 * Comprobar el índice contra la longitud evitaría leer fuera de rango, pero no
 * el desplazamiento, que es el daño de verdad. Así que la unidad de confianza
 * es la serie entera: una serie cuya longitud no coincide con la del eje es
 * **ilegible completa** (`null`, y todos sus puntos a hueco), no legible a
 * medias.
 *
 * Devuelve la lista tal cual, sin leer sus valores: quien llama los pasa por
 * `readCents`, que vive en `./money.ts` y no se importa aquí.
 */
export function alignedColumn(
  value: unknown,
  length: number,
): unknown[] | null {
  if (!Array.isArray(value) || value.length !== length) {
    return null;
  }
  return value;
}

const MONTH_SHORT = new Intl.DateTimeFormat("es-ES", { month: "short" });

/**
 * `"2026-08"` → `"ago"`, y en los eneros `"ene 26"`.
 *
 * Una serie de doce meses cruza un cambio de año casi siempre. Repetir el año
 * doce veces es ruido; no decirlo nunca deja al lector sin saber si ese `feb`
 * es el de este año o el del pasado. Marcar sólo los eneros —el punto donde el
 * año cambia— dice lo justo.
 *
 * ⚠️ Lo que no se entiende se devuelve **tal cual llegó**: el contrato de
 * `chartData` **no declara el formato de `months[i]`** (a diferencia del de
 * `GET /dashboard`), así que aquí no hay nada que dar por supuesto. Enseñar la
 * cadena cruda es lo que permite reconocer un contrato distinto en vez de
 * tragárselo con un mes inventado encima.
 */
export function monthLabel(ym: string): string {
  const raw = ym.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) {
    return raw;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) {
    return raw;
  }

  // Día 15 y mediodía: cualquier día del mes vale para nombrarlo, y el centro
  // del mes no se mueve ni con cambios de horario ni con los febreros.
  const name = MONTH_SHORT.format(new Date(year, month - 1, 15, 12)).replace(
    ".",
    "",
  );
  if (month !== 1) {
    return name;
  }
  return `${name} ${String(year % 100).padStart(2, "0")}`;
}

/**
 * El suelo de una barra que no es cero, en porcentaje.
 *
 * Sin él, un mes con importe pequeño pero real se pinta con altura cero y se
 * lee **igual que un mes sin facturar**. Dos píxeles no mienten sobre el
 * tamaño —nadie compara alturas de dos píxeles— y sí dicen «aquí hubo algo».
 */
export const MIN_BAR_PCT = 2;

/**
 * El mayor de una serie, para escalar las barras. `null` si no hay ni un valor
 * legible **y positivo**: sin escala no se puede dibujar nada.
 */
export function seriesMax(values: (number | null)[]): number | null {
  let max: number | null = null;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    if (max === null || value > max) {
      max = value;
    }
  }
  return max;
}

/**
 * La altura de una barra, en porcentaje del máximo de la ventana.
 *
 * Tres resultados y los tres significan cosas distintas, que es la razón de que
 * esto no devuelva un número a secas:
 *
 * - **`null`** → no hay barra que pintar porque **no se pudo leer** el importe
 *   (o no hay escala). Quien pinta tiene que marcarlo como hueco, no dejar la
 *   columna vacía: una columna vacía se lee «este mes no facturó», que es una
 *   afirmación que nadie ha hecho.
 * - **`0`** → se leyó, y vale cero (o menos). Ese mes **sí** se puede dejar sin
 *   barra: la ausencia dice la verdad.
 * - **un número entre `MIN_BAR_PCT` y `100`** → el importe, a escala.
 */
export function barHeightPct(
  value: number | null,
  max: number | null,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (typeof max !== "number" || !Number.isFinite(max) || max <= 0) {
    return null;
  }
  if (value <= 0) {
    return 0;
  }
  const pct = (value / max) * 100;
  return Math.min(100, Math.max(MIN_BAR_PCT, Math.round(pct * 10) / 10));
}
