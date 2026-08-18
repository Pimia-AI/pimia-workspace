/**
 * Los impuestos que hay que enseñar en el desglose de un documento.
 *
 * Dos cosas que solo se ven con datos reales, y que costaron una pasada:
 *
 * 1. **El nombre ya trae el tipo.** El tenant devuelve `name: "IVA 21%"`, no
 *    `"IVA"`, así que añadirle el `percent` escribe «IVA 21% 21%».
 * 2. **Los impuestos pueden vivir en las líneas y no en la cabecera.** Con
 *    `tax_per_item`, la colección `taxes` del documento viene vacía y el
 *    desglose hay que agregarlo de las líneas — que es lo que hace el panel de
 *    Pimia. Sin esto se cae al campo `tax`, que es el **neto** de IVA menos
 *    retención y esconde las dos.
 */

import type {
  PimiaEstimateLine,
  PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
/**
 * ⚠️ **Relativo y CON extensión, al contrario que todo lo demás del módulo, y
 * no es un descuido.**
 *
 * Es el primer import de **valor** que tiene un `lib/*.ts` de esta feature: los
 * de arriba son `import type`, y el despojado de tipos de Node los borra antes
 * de resolver nada. Este hay que resolverlo de verdad, y ahí los dos anfitriones
 * dejan de parecerse: el escritorio mapea `@/` a `src/` en su
 * `test-loader-hooks.mjs`, pero el anfitrión web corre sus pruebas con un
 * `node --test` pelado, sin loader. Con `@/…` el fichero **ni siquiera arranca**
 * allí (`ERR_MODULE_NOT_FOUND`), y se lleva por delante la suite entera.
 *
 * `./money.ts` lo resuelve Node sin ayuda en los dos sitios, y es exactamente la
 * forma que ya usan los `*.test.mjs` de este mismo directorio. Extensionless
 * (`./money`) NO vale: el resolvedor ESM de Node no la añade.
 */
import { sumStrict } from "./money.ts";

/** Cómo se escribe un impuesto: «IVA 21%», sin repetir el tipo. */
export function taxLabel(tax: {
  name: string;
  percent: number | null;
}): string {
  // Si el nombre ya lleva un porcentaje dentro, se respeta tal cual.
  if (tax.percent === null || /\d\s*%/.test(tax.name)) {
    return tax.name;
  }
  return `${tax.name} ${tax.percent.toLocaleString("es-ES", {
    maximumFractionDigits: 2,
  })}%`;
}

/** Misma etiqueta = mismo impuesto, aunque venga en filas distintas. */
function key(tax: PimiaEstimateTax): string {
  return `${taxLabel(tax)}`;
}

/**
 * El desglose a pintar: los de la cabecera si los hay y, si no, la suma de los
 * de las líneas agrupados por impuesto. Lista vacía = no se sabe, y entonces
 * quien llame decidirá si cae al neto.
 *
 * ⚠️ **La suma por impuesto es ESTRICTA: un solo importe ilegible y el total de
 * ESE impuesto vale `null`.** Hasta el 2026-08-18 esta función acumulaba con
 * `(seen.amountCents ?? 0) + (tax.amountCents ?? 0)`, así que un `amount` que
 * `readCents` no supo leer se contaba como cero y desaparecía dentro de la suma
 * — y solo en cuanto el impuesto aparecía en **dos o más líneas**, porque con
 * una sola el `null` sobrevivía por la rama de abajo. O sea que el mismo defecto
 * se manifestaba o no según cuántas líneas tuviera el documento, que es la peor
 * forma de tenerlo.
 *
 * Muerde en el renglón que un autónomo mira para cuadrar el 303: tres líneas de
 * «IVA 21%», una ilegible, y el desglose escribía 420,00 € donde son 630,00 €.
 * Una cifra **menor** que la real con exactamente el mismo aspecto que la buena,
 * en la casilla de un modelo tributario. Y por el mismo camino viaja la
 * retención de IRPF, que así se leería más pequeña de lo que es.
 *
 * Ahora vale `null`, y `PimiaAmount` lo pinta como una raya: «no se pudo sumar»
 * es un hecho distinto de «suma 420», y solo el primero es cierto.
 */
export function resolveDocumentTaxes(
  headerTaxes: PimiaEstimateTax[] | null,
  lines: PimiaEstimateLine[] | null,
): PimiaEstimateTax[] {
  if (headerTaxes && headerTaxes.length > 0) {
    return headerTaxes;
  }

  /* Se recogen TODOS los sumandos de cada impuesto y se suman al final, en vez
   * de ir acumulando: `sumStrict` necesita verlos juntos para poder decir que
   * uno faltaba. Acumular de dos en dos obligaría a arrastrar a mano el «ya vi
   * un hueco», que es la misma regla escrita otra vez. */
  const orden: string[] = [];
  const sumandos = new Map<string, (number | null)[]>();
  const modelo = new Map<string, PimiaEstimateTax>();

  for (const line of lines ?? []) {
    for (const tax of line.taxes ?? []) {
      const id = key(tax);
      if (!sumandos.has(id)) {
        orden.push(id);
        sumandos.set(id, []);
        // El primero que se ve pone el nombre y el tipo; lo único que se agrega
        // es el importe.
        modelo.set(id, { ...tax, id });
      }
      sumandos.get(id)?.push(tax.amountCents);
    }
  }

  return orden.map((id) => ({
    ...(modelo.get(id) as PimiaEstimateTax),
    amountCents: sumStrict(sumandos.get(id) ?? []),
  }));
}
