/**
 * El tope de un cobro. Se prueba aparte de la pantalla porque es donde vivía el
 * fallo: `amount > invoice.dueCents` con `dueCents === null` da `false`, así que
 * el tope se apagaba solo justo en la pantalla que promete no dejar cobrar de
 * más. Una comparación con un `null` de por medio merece test propio.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { exceedsCeiling, paymentCeiling } from "./payments.ts";

test("con deuda conocida, el tope es la deuda", () => {
  assert.deepEqual(paymentCeiling(45050, 120000), {
    cents: 45050,
    source: "due",
  });
});

test("una deuda de cero es un tope, no una incógnita", () => {
  // Es el caso más claro de todos: no se debe nada. Tratarlo como
  // «desconocido» lo volvería el más permisivo.
  const ceiling = paymentCeiling(0, 120000);
  assert.deepEqual(ceiling, { cents: 0, source: "due" });
  assert.equal(exceedsCeiling(1, ceiling), true);
});

test("sin deuda legible se cae al total, que sigue siendo un techo cierto", () => {
  // Ningún cobro legítimo supera el total de la factura, así que esto caza el
  // cero de más sin estorbar a nadie. El tope de verdad lo pone el servidor.
  assert.deepEqual(paymentCeiling(null, 120000), {
    cents: 120000,
    source: "total",
  });
});

test("sin deuda ni total no se inventa un tope: se admite no saberlo", () => {
  assert.deepEqual(paymentCeiling(null, null), {
    cents: null,
    source: "unknown",
  });
  assert.deepEqual(paymentCeiling(null, 0), { cents: null, source: "unknown" });
});

test("exceedsCeiling compara, y con un tope desconocido NO dice que sí", () => {
  const due = paymentCeiling(45050, 120000);
  assert.equal(exceedsCeiling(45051, due), true);
  assert.equal(exceedsCeiling(45050, due), false);
  assert.equal(exceedsCeiling(1, due), false);
  // Sin importe todavía escrito no hay nada que comparar.
  assert.equal(exceedsCeiling(null, due), false);

  // Y lo que originó todo: con el tope desconocido no se bloquea al usuario
  // —sería peor—, pero la pantalla tiene que DECIR que no lo comprueba.
  const unknown = paymentCeiling(null, null);
  assert.equal(exceedsCeiling(999_999_99, unknown), false);
  assert.equal(unknown.source, "unknown");
});
