/**
 * El calendario del módulo de tiempos: la semana como unidad de lectura.
 *
 * Un parte se apunta el día que se trabaja y se revisa por semanas —así navega
 * el índice del panel Vue y así lo pinta el diseño aprobado: una sección por
 * día, de la más reciente a la más antigua, cada una con su subtotal.
 *
 * ⚠️ **Todo se calcula en hora LOCAL**, y esto es un arreglo consciente
 * respecto al original. El panel Vue resuelve «hoy» con
 * `new Date().toISOString().slice(0, 10)`, que es UTC: en España, entre
 * medianoche y las dos de la madrugada de verano, devuelve **ayer**. Un parte
 * apuntado a la una de la mañana caía en el día anterior sin que nadie lo
 * dijera. Aquí «hoy» es el día del calendario de quien mira, que es el único
 * que significa algo cuando se cuentan jornadas.
 *
 * La semana empieza en LUNES, como en España y como en el panel.
 */

/** `YYYY-MM-DD` del día local. */
export function todayIso(now: Date = new Date()): string {
  return isoOf(now);
}

function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * `YYYY-MM-DD` → `Date` local a mediodía.
 *
 * Mediodía y no medianoche a propósito: en un cambio de horario de verano la
 * medianoche puede no existir o existir dos veces, y sumar días sobre ella
 * mueve la fecha. A las 12:00 sobra margen por los dos lados.
 */
function dateOf(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(iso: string, days: number): string {
  const date = dateOf(iso);
  date.setDate(date.getDate() + days);
  return isoOf(date);
}

/** El lunes de la semana en la que cae este día. */
export function mondayOf(iso: string): string {
  const date = dateOf(iso);
  // `getDay()` cuenta desde el domingo; aquí la semana empieza el lunes.
  const offset = (date.getDay() + 6) % 7;
  return addDays(iso, -offset);
}

/** Los siete días de la semana, de lunes a domingo. */
export function weekDays(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(mondayIso, index));
}

const WEEKDAY = new Intl.DateTimeFormat("es-ES", { weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** `mar` — la cabecera de una sección de día. */
export function weekdayLabel(iso: string): string {
  return WEEKDAY.format(dateOf(iso)).replace(".", "");
}

/** `18` — el número grande junto al día de la semana. */
export function dayNumber(iso: string): string {
  return String(dateOf(iso).getDate());
}

/** `18 ago` — la fecha corta de un banner o un tooltip. */
export function shortDate(iso: string): string {
  return DAY_MONTH.format(dateOf(iso)).replace(".", "");
}

/**
 * El título del rango que se está mirando: `18 – 24 de agosto de 2026`.
 *
 * Cuando la semana cruza mes o año se dicen los dos lados enteros, porque
 * «29 – 4 de septiembre» se lee mal y «29 de agosto – 4 de septiembre» no.
 */
export function weekTitle(mondayIso: string): string {
  const sunday = addDays(mondayIso, 6);
  const from = dateOf(mondayIso);
  const to = dateOf(sunday);

  if (
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear()
  ) {
    return `${from.getDate()} – ${DAY_MONTH_YEAR.format(to)}`;
  }
  return `${DAY_MONTH_YEAR.format(from)} – ${DAY_MONTH_YEAR.format(to)}`;
}
