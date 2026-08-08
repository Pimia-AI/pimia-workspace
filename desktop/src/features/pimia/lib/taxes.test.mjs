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
