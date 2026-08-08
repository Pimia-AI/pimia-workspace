/**
 * Los importes de Pimia son céntimos enteros. Según el README del SDK es la
 * fuente de bugs número uno de la integración, así que la conversión está
 * cubierta por los dos lados: lo que llega de la API y lo que escribe una
 * persona.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { formatCents, parseAmountToCents, readCents } from "./money.ts";

/** `Intl` separa el símbolo con espacio duro; para comparar da igual cuál sea. */
function plain(text) {
  return text.replace(/[  ]/g, " ");
}

test("formatCents pasa de céntimos a euros con formato español", () => {
  // 4.500,50 € en la API son 450050 céntimos — el ejemplo del handoff.
  // Se agrupa también a los cuatro dígitos, que es lo que hace el panel de
  // Pimia: el `es-ES` de `Intl` escribiría «4500,50» por su cuenta, y el mismo
  // presupuesto no puede leerse distinto según por dónde se mire.
  assert.equal(plain(formatCents(450050)), "4.500,50 €");
  assert.equal(plain(formatCents(1234567)), "12.345,67 €");
  assert.equal(plain(formatCents(0)), "0,00 €");
  assert.equal(plain(formatCents(1)), "0,01 €");
  assert.equal(plain(formatCents(-2550)), "-25,50 €");
});

test("formatCents no revienta con lo que no es un importe", () => {
  assert.equal(plain(formatCents(null)), "0,00 €");
  assert.equal(plain(formatCents(undefined)), "0,00 €");
  assert.equal(plain(formatCents(Number.NaN)), "0,00 €");
});

test("readCents acepta entero o cadena entera y nada más", () => {
  assert.equal(readCents(450050), 450050);
  assert.equal(readCents("450050"), 450050);
  assert.equal(readCents(" -2550 "), -2550);
  // Un decimal significa que alguien ya lo convirtió mal: mejor null que
  // redondear y esconder el error.
  assert.equal(readCents(4500.5), null);
  assert.equal(readCents("4500.50"), null);
  assert.equal(readCents(null), null);
  assert.equal(readCents(undefined), null);
  assert.equal(readCents("cuatro mil"), null);
});

test("parseAmountToCents entiende cómo escribe un usuario español", () => {
  assert.equal(parseAmountToCents("4.500,50"), 450050);
  assert.equal(parseAmountToCents("4500,50"), 450050);
  assert.equal(parseAmountToCents("4500.50"), 450050);
  assert.equal(parseAmountToCents("4,500.50"), 450050);
  assert.equal(parseAmountToCents("100"), 10000);
  assert.equal(parseAmountToCents("0,01"), 1);
  assert.equal(parseAmountToCents(" 25,5 € "), 2550);
  assert.equal(parseAmountToCents("-25,50"), -2550);
});

test("parseAmountToCents devuelve null en vez de inventarse un importe", () => {
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents("   "), null);
  assert.equal(parseAmountToCents("abc"), null);
  assert.equal(parseAmountToCents("1,2,3"), null);
  // Más de dos decimales no es un importe en euros: no se redondea a espaldas
  // del usuario.
  assert.equal(parseAmountToCents("1,234"), null);
});

test("el ciclo céntimos → texto → céntimos no pierde nada", () => {
  for (const cents of [1, 999, 100000, 450050, 1234567, -2550]) {
    assert.equal(
      parseAmountToCents(plain(formatCents(cents))),
      cents,
      `se perdieron céntimos en ${cents}`,
    );
  }
});
