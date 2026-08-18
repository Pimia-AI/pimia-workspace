/**
 * Los dos casos que solo aparecieron con datos del tenant real, y que dejaron
 * la ficha diciendo «IVA 21% 21%» y escondiendo la retención.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveDocumentTaxes, taxLabel } from "./taxes.ts";

const line = (taxes) => ({ id: "l", taxes });

test("el nombre que ya trae el tipo no se repite", () => {
  assert.equal(taxLabel({ name: "IVA 21%", percent: 21 }), "IVA 21%");
  assert.equal(taxLabel({ name: "IRPF -15%", percent: -15 }), "IRPF -15%");
});

test("y al que no lo trae se le pone", () => {
  assert.equal(taxLabel({ name: "IVA", percent: 21 }), "IVA 21%");
  assert.equal(taxLabel({ name: "IRPF", percent: -15 }), "IRPF -15%");
});

test("un impuesto de importe fijo se queda con su nombre", () => {
  assert.equal(
    taxLabel({ name: "Tasa municipal", percent: null }),
    "Tasa municipal",
  );
});

test("los de la cabecera mandan cuando los hay", () => {
  const header = [
    { id: "1", name: "IVA 21%", percent: 21, amountCents: 52500 },
  ];
  assert.deepEqual(resolveDocumentTaxes(header, [line([])]), header);
});

test("sin cabecera se agregan los de las líneas por impuesto", () => {
  const taxes = resolveDocumentTaxes(null, [
    line([
      { id: "a", name: "IVA 21%", percent: 21, amountCents: 27216 },
      { id: "b", name: "IRPF -15%", percent: -15, amountCents: -19440 },
    ]),
    line([
      { id: "c", name: "IVA 21%", percent: 21, amountCents: 5985 },
      { id: "d", name: "IRPF -15%", percent: -15, amountCents: -4275 },
    ]),
  ]);

  assert.deepEqual(
    taxes.map((tax) => [tax.name, tax.amountCents]),
    [
      ["IVA 21%", 33201],
      ["IRPF -15%", -23715],
    ],
  );
});

test("sin impuestos por ningún lado no se inventa ninguno", () => {
  assert.deepEqual(resolveDocumentTaxes(null, null), []);
  assert.deepEqual(resolveDocumentTaxes([], [line(null)]), []);
});

/* La regla que costó una ronda entera: hasta el 2026-08-18 la agregación hacía
 * `(seen ?? 0) + (tax ?? 0)`, y el hueco desaparecía dentro de la suma. Lo peor
 * era que solo pasaba con DOS o más líneas del mismo impuesto: con una, el
 * `null` sobrevivía. El mismo documento mentía o no según cuántas líneas
 * tuviera. */

test("un solo importe ilegible deja SIN saber el total de ese impuesto", () => {
  const taxes = resolveDocumentTaxes(null, [
    line([{ id: "a", name: "IVA 21%", percent: 21, amountCents: 21000 }]),
    line([{ id: "b", name: "IVA 21%", percent: 21, amountCents: null }]),
    line([{ id: "c", name: "IVA 21%", percent: 21, amountCents: 21000 }]),
  ]);

  // 42.000 sería MENOR que el real y con el mismo aspecto que una suma buena,
  // en la casilla con la que se cuadra el 303.
  assert.deepEqual(
    taxes.map((tax) => [tax.name, tax.amountCents]),
    [["IVA 21%", null]],
  );
});

test("el hueco de un impuesto no contagia a los demás", () => {
  const taxes = resolveDocumentTaxes(null, [
    line([
      { id: "a", name: "IVA 21%", percent: 21, amountCents: null },
      { id: "b", name: "IRPF -15%", percent: -15, amountCents: -1500 },
    ]),
    line([
      { id: "c", name: "IVA 21%", percent: 21, amountCents: 2100 },
      { id: "d", name: "IRPF -15%", percent: -15, amountCents: -1500 },
    ]),
  ]);

  assert.deepEqual(
    taxes.map((tax) => [tax.name, tax.amountCents]),
    [
      ["IVA 21%", null],
      ["IRPF -15%", -3000],
    ],
  );
});

test("con UNA sola línea el hueco también se respeta", () => {
  // Este caso ya salía bien antes del arreglo, y por eso el defecto era tan
  // difícil de ver: se manifestaba solo al añadir la segunda línea.
  const taxes = resolveDocumentTaxes(null, [
    line([{ id: "a", name: "IVA 21%", percent: 21, amountCents: null }]),
  ]);

  assert.deepEqual(
    taxes.map((tax) => tax.amountCents),
    [null],
  );
});

test("agregar NO toca los impuestos de las líneas de origen", () => {
  // El desglose es una vista, no un sitio donde escribir: si mutara la línea,
  // pintar la ficha dos veces daría dos cifras distintas.
  const lines = [
    line([{ id: "a", name: "IVA 21%", percent: 21, amountCents: 100 }]),
    line([{ id: "b", name: "IVA 21%", percent: 21, amountCents: 200 }]),
  ];
  resolveDocumentTaxes(null, lines);
  resolveDocumentTaxes(null, lines);

  assert.deepEqual(
    lines.flatMap((l) => l.taxes.map((t) => t.amountCents)),
    [100, 200],
  );
});

test("los de la cabecera se devuelven tal cual, sin sumar nada", () => {
  // La rama de cabecera no agrega: si el servidor manda un hueco ahí, ese hueco
  // es lo que hay que enseñar, no un cero que la vista se invente.
  const header = [{ id: "h", name: "IVA 21%", percent: 21, amountCents: null }];
  assert.deepEqual(
    resolveDocumentTaxes(header, [
      line([{ id: "a", name: "IVA 21%", percent: 21, amountCents: 999 }]),
    ]),
    header,
  );
});
