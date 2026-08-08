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
 */
export function resolveDocumentTaxes(
  headerTaxes: PimiaEstimateTax[] | null,
  lines: PimiaEstimateLine[] | null,
): PimiaEstimateTax[] {
  if (headerTaxes && headerTaxes.length > 0) {
    return headerTaxes;
  }

  const totals = new Map<string, PimiaEstimateTax>();
  for (const line of lines ?? []) {
    for (const tax of line.taxes ?? []) {
      const id = key(tax);
      const seen = totals.get(id);
      if (seen) {
        seen.amountCents = (seen.amountCents ?? 0) + (tax.amountCents ?? 0);
      } else {
        totals.set(id, { ...tax, id });
      }
    }
  }
  return [...totals.values()];
}
