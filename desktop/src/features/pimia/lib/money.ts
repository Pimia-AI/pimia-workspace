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
 *
 * ⚠️ **La API no manda el dinero con una sola forma.** `total`, `sub_total` y
 * `tax` llegan como enteros (`45050`), pero **`due_amount` llega como cadena
 * decimal** (`"45050.00"`), en clientes y en facturas: es un `decimal:2` de
 * Laravel sobre una columna que ya está en céntimos. Que la cola sea `.00` no
 * añade información, así que se acepta y se descarta.
 *
 * Comprobado contra un tenant vivo (2026-08-10): la factura `FAC-000002` trae
 * `total: 1000` y `due_amount: "1000.00"` para la misma cantidad, y la deuda
 * del cliente (`"2000.00"`) es la suma de sus dos facturas pendientes.
 *
 * Un decimal **distinto de cero** sigue devolviendo `null` a propósito: un
 * `decimal:2` de un entero siempre acaba en ceros, así que `"1234.56"` sería
 * otra unidad, y adivinarla es exactamente el error que este módulo existe para
 * evitar.
 */
export function readCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
    const decimalCast = /^(-?\d+)\.0+$/.exec(trimmed);
    if (decimalCast) {
      return Number.parseInt(decimalCast[1], 10);
    }
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

/**
 * Suma en ESTRICTO: un solo sumando ilegible y la suma entera vale `null`.
 *
 * Es el brazo de agregación de la promesa que abre este fichero —la aritmética
 * de dinero vive aquí y en ningún otro sitio—, y existe por la regla que
 * gobierna todas las cifras de este ERP: un dato que no se pudo leer es una
 * raya, nunca un 0.
 *
 * Contar el hueco como 0 no da un total «casi bueno». Da uno **más pequeño que
 * el real con exactamente el mismo aspecto que el bueno**, sin nada en pantalla
 * que lo delate: ni un signo, ni un color, ni una cifra rara que invite a mirar
 * dos veces. Es la clase de error que nadie denuncia porque nadie lo ve. Y
 * encima se pinta en el pie de la misma tabla en la que esa fila ya está
 * enseñando su raya, así que la tabla se contradice a sí misma y gana la
 * mentira, porque el pie es lo que la gente copia.
 *
 * Devolver `null` deja que quien llama esconda el pie entero, que es lo honesto:
 * quien no ve la cifra va a preguntar por ella; quien ve una cifra falsa se la
 * cree.
 *
 * Acepta `undefined` además de `null` **porque los sitios de uso lo traen**, no
 * por si acaso: los importes mapeados son `number | null` (salen de
 * `readCents`), pero los recuentos de cabecera salen de `query.data?.totalCount`
 * y son `undefined` mientras la petición vuela y `null` cuando el servidor no
 * manda el total. Para lo que aquí importa las dos cosas son el mismo hecho: no
 * hay dato. El `count()` de las pantallas ya pinta una raya para ambas; si esta
 * suma solo admitiera `null`, cada llamada tendría que poner un `?? null` de su
 * cosecha, y el día que alguien escriba `?? 0` en su lugar vuelve exacto el bug
 * que esto existe para impedir.
 *
 * El sitio que estrenó esa firma es el «Sin respuesta» de `PimiaEstimatesScreen`
 * (los totales de `SENT` y `VIEWED` son dos peticiones distintas): ya suma por
 * aquí, y con una de las dos en vuelo pinta la raya en vez de la mitad del
 * recuento. 🕳️ **Queda uno pendiente**: `PimiaScreen` ~85-90 hace la misma suma
 * a mano con un `typeof sent === "number" && typeof viewed === "number"`. No es
 * una decisión, es trabajo sin hacer: la suma manual acierta hoy —también da
 * `null` si falta un lado— pero repite la regla en vez de citarla, y basta que
 * alguien la «simplifique» con un `?? 0` para que el panel de inicio enseñe «3
 * sin respuesta» donde hay 11, con el mismo aspecto que la cifra buena.
 *
 * ⚠️ **La lista vacía suma `0`, no `null`**: cero es el total honesto de una
 * lista sin sumandos, porque no hay ningún hueco que esconder. Pero ojo con de
 * dónde sale la lista: `query.data?.invoices ?? []` está vacía **mientras
 * carga**, y entonces ese `0` lo puso el `??` de la pantalla, no esta función.
 * Aquí no se puede distinguir «no hay filas» de «aún no han llegado»; quien
 * pinta el pie mira antes si la consulta sigue en vuelo.
 *
 * ⚠️ Un `NaN` cuenta como hueco. No debería llegar ninguno —`readCents` no lo
 * devuelve jamás—, pero si llegara sería el peor caso del fichero: `formatCents`
 * formatea `NaN` como `0,00 €`, así que un total roto se pintaría como un cero
 * perfecto. Cerrarle la puerta cuesta media condición.
 */
export function sumStrict(
  values: (number | null | undefined)[],
): number | null {
  let total = 0;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    total += value;
  }
  return total;
}
