/**
 * Las fechas `YYYY-MM-DD` del ERP, escritas sin que la zona horaria las corra.
 *
 * ⚠️ **El error que este módulo existe para no cometer.** `new Date("2026-08-18")`
 * no es el 18 de agosto: es **medianoche UTC** del 18. Al oeste de Greenwich eso
 * cae en el día anterior, así que la misma fecha sale «18 ago» en la tabla y
 * «17 de agosto» en la ficha —o al revés— según qué función la haya formateado.
 * Es el fallo más difícil de ver del módulo, porque en Madrid (UTC+1/+2) no se
 * reproduce nunca y en Canarias en invierno tampoco.
 *
 * El remedio es uno solo: montar la fecha a **mediodía local** con los tres
 * números, que es la hora que ningún desplazamiento de zona ni cambio de horario
 * saca del día. Vive aquí, en `ui/`, y **no** en `lib/leads.ts` a propósito: allí
 * no hay `Intl` ni reloj, y meterlos rompería lo que hace a ese fichero probable
 * sin navegador.
 *
 * Una fecha que no se entienda —ni por su forma ni por sus números, porque un
 * `2026-02-30` tiene la forma pero no existe— se devuelve **tal cual**.
 * Inventarle un formato sería afirmar que se ha entendido; enseñarla en crudo es
 * lo que permite reconocer un contrato nuevo en vez de tragárselo.
 */

/** La raya de «no hay dato». Nunca un 0, nunca la fecha de hoy. */
const DASH = "—";

/**
 * `2026-08-18` → el 18 de agosto a las 12:00 **locales**.
 *
 * `null` cuando la cadena no es un `YYYY-MM-DD`, para que quien llame decida qué
 * hacer con lo que no entiende (y lo que hace es enseñarlo en crudo).
 */
function localNoon(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  // ⚠️ La forma no basta: `new Date(2026, 1, 30)` **no falla**, DESBORDA al 2 de
  // marzo. Un `2026-02-30` pasaría el patrón de arriba y saldría a pantalla como
  // «02 mar 2026», con exactamente la misma pinta que una fecha buena — que es
  // la clase de fallo invisible que este módulo existe para cerrar, no para
  // cometer en otro sitio. Si los tres números no vuelven tal como entraron, la
  // fecha no se entendió, y lo que se enseña es la cadena en crudo.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** `2026-08-18` → «18 ago 2026». La forma de tabla, que compite por el ancho. */
export function formatIsoDateShort(value: string | null): string {
  if (!value) {
    return DASH;
  }
  const date = localNoon(value);
  if (!date) {
    return value;
  }
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** `2026-08-18` → «18 de agosto de 2026». La forma de ficha, donde sobra sitio. */
export function formatIsoDateLong(value: string | null): string {
  if (!value) {
    return DASH;
  }
  const date = localNoon(value);
  if (!date) {
    return value;
  }
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
