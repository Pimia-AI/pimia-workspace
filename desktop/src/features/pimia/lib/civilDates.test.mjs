/**
 * La cuenta de días civiles. Hasta hoy vivía escondida dentro de
 * `lib/invoices.ts` y solo se probaba de rebote, a través del preaviso de
 * vencimiento: los casos que de verdad la sujetan —el bisiesto, el cambio de
 * siglo, la fecha imposible— no tenían dónde escribirse.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { daysBetween, parseCivilDate } from "./civilDates.ts";

test("la resta cuenta días, y el signo dice de qué lado", () => {
  assert.equal(daysBetween("2026-08-18", "2026-08-18"), 0);
  assert.equal(daysBetween("2026-08-18", "2026-08-25"), 7);
  assert.equal(daysBetween("2026-08-18", "2026-08-06"), -12);
});

test("cruza meses, años y el bisiesto sin casos especiales", () => {
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  // 2028 es bisiesto: del 28 de febrero al 1 de marzo hay DOS días.
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2);
  // 2026 no lo es: el mismo salto es de uno.
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
  // 1900 no fue bisiesto (múltiplo de 100 y no de 400); 2000 sí.
  assert.equal(parseCivilDate("1900-02-29"), null);
  assert.equal(daysBetween("2000-02-28", "2000-03-01"), 2);
});

test("una fecha imposible es null, no la fecha de al lado", () => {
  // `new Date("2026-02-31")` no protesta: se va al 3 de marzo. Aquí el dato
  // roto se queda en `null`, y quien llama no pinta ningún aviso.
  assert.equal(parseCivilDate("2026-02-31"), null);
  assert.equal(parseCivilDate("2026-13-01"), null);
  assert.equal(parseCivilDate("2026-04-31"), null);
  assert.equal(daysBetween("2026-08-18", "2026-02-31"), null);
});

test("lo que no tiene forma de fecha civil tampoco cuenta", () => {
  assert.equal(parseCivilDate(null), null);
  assert.equal(parseCivilDate(""), null);
  assert.equal(parseCivilDate("18/08/2026"), null);
  // Una marca de tiempo completa NO es una fecha civil: el `slice(0, 10)` que
  // haga falta es responsabilidad de quien lee el campo, no de esta función.
  assert.equal(parseCivilDate("2026-08-18T10:00:00Z"), null);
  assert.equal(daysBetween(null, "2026-08-18"), null);
});

test("los espacios de alrededor no rompen la fecha", () => {
  assert.equal(daysBetween(" 2026-08-18 ", "2026-08-19"), 1);
});
