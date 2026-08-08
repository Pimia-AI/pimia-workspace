/**
 * Dinero: la API de Pimia trabaja en **céntimos enteros**.
 *
 * `4.500,50 €` es `450050`, no `4500.5`. Según el propio README del SDK es la
 * fuente de bugs número uno de la integración, así que la conversión vive en un
 * solo sitio, está probada, y **nunca** se hace aritmética de dinero en float
 * fuera de aquí.
 */

/**
 * `useGrouping: true` a propósito. El `es-ES` de `Intl` usa `min2` por defecto,
 * que NO agrupa las cifras de cuatro dígitos: escribiría `2500,00 €` donde el
 * panel de Pimia —el mismo documento, el mismo tenant— pone `2.500,00 €`. Las
 * dos formas son correctas en español, pero que el mismo presupuesto se lea
 * distinto según por dónde lo mires no lo es.
 *
 * (`true` equivale a `"always"` desde ES2023; se usa el booleano porque el
 * `lib` de TypeScript de este repo aún no conoce la cadena.)
 */
const EUR_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** Céntimos → `1.234,56 €`. */
export function formatCents(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) {
    return EUR_FORMATTER.format(0);
  }
  return EUR_FORMATTER.format(cents / 100);
}

/**
 * Lee un importe venido de la API. Acepta número o cadena numérica (Laravel
 * devuelve enteros como cadena en algunos recursos) y **nunca** redondea: si no
 * es un entero, algo se ha convertido mal más arriba y es mejor enterarse.
 */
export function readCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

/**
 * Texto escrito por una persona → céntimos enteros.
 *
 * Admite las dos convenciones que un usuario español escribe sin pensar:
 * `1.234,56` y `1234.56`. Devuelve `null` cuando no se puede leer, para que la
 * UI avise en vez de mandar un importe inventado.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s|€/g, "");
  if (trimmed === "") {
    return null;
  }

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;

  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal; el otro es de millares.
    normalized =
      trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > 2) {
    return null;
  }

  const negative = whole.startsWith("-");
  const wholeDigits = negative ? whole.slice(1) : whole;
  const cents =
    Number.parseInt(wholeDigits || "0", 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10);

  return negative ? -cents : cents;
}
