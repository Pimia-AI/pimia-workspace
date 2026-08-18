/**
 * Los importes de Pimia son céntimos enteros. Según el README del SDK es la
 * fuente de bugs número uno de la integración, así que la conversión está
 * cubierta por los dos lados: lo que llega de la API y lo que escribe una
 * persona.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCents,
  parseAmountToCents,
  readCents,
  sumStrict,
} from "./money.ts";

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

/**
 * `due_amount` NO llega como los demás importes: es un `decimal:2` de Laravel
 * sobre una columna que ya está en céntimos. Mientras esto no se leyó, la
 * columna «Pendiente» de clientes pintaba una raya, la ficha de la factura
 * perdía la fila «Pendiente de cobro» y —lo peor— el tope de «no cobrar de
 * más» del diálogo de cobro no llegaba a dispararse nunca.
 */
test("readCents lee el decimal:2 que la API usa para due_amount", () => {
  // Las formas exactas vistas en un tenant vivo.
  assert.equal(readCents("45050.00"), 45050);
  assert.equal(readCents("2000.00"), 2000);
  assert.equal(readCents("0.00"), 0);
  assert.equal(readCents(" 1000.00 "), 1000);
  assert.equal(readCents("-1500.00"), -1500);
  // La cola de ceros no dice nada, venga con la longitud que venga.
  assert.equal(readCents("300.0"), 300);
  assert.equal(readCents("300.000"), 300);
  // Y lo que NO se acepta sigue sin aceptarse: una parte decimal con algo
  // distinto de cero es otra unidad, y adivinarla es el bug que esto evita.
  assert.equal(readCents("1234.56"), null);
  assert.equal(readCents("1234.01"), null);
  assert.equal(readCents("45050."), null);
  assert.equal(readCents(".00"), null);
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

test("sumStrict suma los importes que sí se pudieron leer", () => {
  // El «Total en pantalla» del pie de facturas: la suma de la columna que se
  // está viendo, en céntimos y sin pasar por float.
  assert.equal(sumStrict([450050, 1234567, 1]), 1684618);
  assert.equal(sumStrict([100000]), 100000);
});

test("sumStrict con negativos: una rectificativa resta de verdad", () => {
  // Una factura anulada aporta su nominal en negativo, y el neto de la página
  // puede acabar en cero o por debajo. Cero aquí es un total calculado, no un
  // hueco: se distingue de `null` justamente por eso.
  assert.equal(sumStrict([-2550, -1000]), -3550);
  assert.equal(sumStrict([100000, -100000]), 0);
  assert.equal(sumStrict([100000, -250000]), -150000);
});

/**
 * El corazón del asunto. Si un solo importe no se pudo leer y se contase como
 * 0, el pie enseñaría una cifra MENOR que la real con el mismo aspecto que la
 * buena, en la misma tabla en la que esa fila ya está pintando su raya. Nadie
 * denuncia un total que parece correcto: por eso la suma entera se rinde.
 */
test("sumStrict se rinde entera si un solo sumando es ilegible", () => {
  assert.equal(sumStrict([450050, null, 1]), null);
  // Da igual dónde esté el hueco: no hay posición «inofensiva».
  assert.equal(sumStrict([null, 450050, 1]), null);
  assert.equal(sumStrict([450050, 1, null]), null);
  // Un único sumando, y encima ilegible: la suma no existe.
  assert.equal(sumStrict([null]), null);
});

/**
 * `undefined` es hueco igual que `null`, y no es teoría: los recuentos de
 * cabecera salen de `query.data?.totalCount`, que vale `undefined` mientras la
 * petición vuela y `null` cuando el servidor no manda el total. Las pantallas
 * ya pintan una raya para los dos casos; la suma tiene que coincidir con lo que
 * la tabla enseña.
 */
test("sumStrict trata undefined como el hueco que es", () => {
  assert.equal(sumStrict([undefined]), null);
  assert.equal(sumStrict([12, undefined, 30]), null);
  assert.equal(sumStrict([12, null, undefined]), null);
});

/**
 * Vacío devuelve 0 a propósito: cero es el total honesto de una lista sin
 * sumandos —no falta ningún dato que esconder— y así el pie de una tabla
 * filtrada a cero filas sigue cuadrando con las cero filas que se ven.
 *
 * ⚠️ Lo que NO significa es «aún no ha llegado nada»: `query.data?.x ?? []`
 * también está vacía mientras carga, y ese 0 lo pone el `??` de la pantalla.
 * Distinguirlo es de quien pinta, no de esta función.
 */
test("sumStrict de una lista vacía es cero, no una raya", () => {
  assert.equal(sumStrict([]), 0);
});

test("sumStrict no deja pasar un NaN disfrazado de total", () => {
  // El peor caso posible del fichero: `formatCents(NaN)` es «0,00 €», así que
  // un total roto se pintaría como un cero perfecto. Se corta aquí.
  assert.equal(plain(formatCents(Number.NaN)), "0,00 €");
  assert.equal(sumStrict([100, Number.NaN]), null);
  assert.equal(sumStrict([Number.POSITIVE_INFINITY]), null);
});

test("sumStrict encadenado con readCents: el caso real de due_amount", () => {
  // Lo que de verdad se suma en una pantalla: importes recién leídos de la API.
  // Mientras las formas sean las que el servidor manda, sale el total; en
  // cuanto una no se puede leer —otra unidad, no un céntimo— se rinde en vez de
  // inventarse la conversión.
  assert.equal(sumStrict([readCents(1000), readCents("2000.00")]), 3000);
  assert.equal(sumStrict([readCents(1000), readCents("1234.56")]), null);
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
