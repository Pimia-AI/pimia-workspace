/**
 * El tope de un cobro: hasta cuánto puede aceptar la pantalla, y por qué.
 *
 * ⚖️ **La regla de verdad es del servidor, no de aquí.** `PaymentRequest`
 * (factSaas) rechaza con un 422 —«El importe del pago no puede superar el saldo
 * pendiente de la factura»— cualquier cobro por encima de la deuda, y hace bien:
 * sin ese tope, `subtractInvoicePayment` dejaría `due_amount` en negativo y
 * `getInvoiceStatusByAmount` ni recalcularía el estado. Esto de aquí es una
 * **cortesía**: avisar antes de gastar un viaje al servidor.
 *
 * Y una cortesía que no sabe la respuesta tiene que **decirlo**, no callarse. El
 * fallo que originó este módulo era justo ese: la comprobación era
 * `amount > invoice.dueCents`, que con `dueCents === null` da `false` — o sea que
 * el tope desaparecía sin que nada lo dijera, en la única pantalla que promete
 * no dejarte cobrar de más.
 */

/** De dónde sale el número con el que se compara. */
export type PimiaPaymentCeiling =
  /** Lo pendiente: el tope bueno, el mismo que aplica el servidor. */
  | { cents: number; source: "due" }
  /**
   * El total de la factura, cuando no se pudo leer lo pendiente. No es el tope
   * del servidor —una factura a medio cobrar debe menos que su total— pero sí
   * es un techo cierto: ningún cobro legítimo lo supera. Sirve para cazar el
   * dedazo de un cero de más sin estorbar a nadie.
   */
  | { cents: number; source: "total" }
  /** No se sabe. La pantalla lo dice y deja que el servidor decida. */
  | { cents: null; source: "unknown" };

export function paymentCeiling(
  dueCents: number | null,
  totalCents: number | null,
): PimiaPaymentCeiling {
  // Una deuda de **cero** sí es un tope, y de los importantes: significa que no
  // se debe nada, así que cualquier importe sobra. (En la práctica no se llega
  // —a una factura pagada la ficha no le ofrece cobrar—, pero tratarla como
  // «desconocida» convertiría el caso más claro en el más permisivo.)
  if (dueCents !== null) {
    return { cents: dueCents, source: "due" };
  }
  if (totalCents !== null && totalCents > 0) {
    return { cents: totalCents, source: "total" };
  }
  return { cents: null, source: "unknown" };
}

/** ¿Este importe se pasa de lo que la pantalla puede comprobar? */
export function exceedsCeiling(
  amountCents: number | null,
  ceiling: PimiaPaymentCeiling,
): boolean {
  return (
    amountCents !== null &&
    ceiling.cents !== null &&
    amountCents > ceiling.cents
  );
}
