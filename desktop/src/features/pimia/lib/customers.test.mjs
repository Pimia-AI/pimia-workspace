/**
 * Tapar un IBAN a medias no lo tapa, y decir «la misma dirección» cuando no lo
 * es manda un bulto a otra puerta. Las dos reglas se prueban.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { groupIban, maskIban, sameAddress } from "./customers.ts";

const BILLING = {
  name: "Reformas del Sur SL",
  street1: "Calle Mayor 12",
  street2: null,
  city: "Vera",
  state: "Almería",
  zip: "04620",
  country: "España",
};

test("el IBAN se agrupa de cuatro en cuatro, venga como venga", () => {
  assert.equal(
    groupIban("ES9121000418450200051332"),
    "ES91 2100 0418 4502 0005 1332",
  );
  assert.equal(
    groupIban("es91 210004 18450200051332"),
    "ES91 2100 0418 4502 0005 1332",
  );
});

test("tapado deja ver sólo la cola", () => {
  assert.equal(maskIban("ES9121000418450200051332"), "•••• •••• •••• 1332");
  assert.equal(
    maskIban("es91 2100 0418 4502 0005 1332"),
    "•••• •••• •••• 1332",
  );
});

test("un IBAN demasiado corto se tapa entero", () => {
  // Enseñar los cuatro últimos de una cadena de seis es no taparlo.
  assert.equal(maskIban("ES9121"), "••••");
  assert.equal(maskIban(""), "••••");
});

test("dos direcciones iguales son la misma", () => {
  assert.equal(sameAddress(BILLING, { ...BILLING }), true);
});

test("el teléfono no decide: es el mismo sitio con otro número", () => {
  assert.equal(
    sameAddress(
      { ...BILLING, phone: "950 000 000" },
      { ...BILLING, phone: "600 000 000" },
    ),
    true,
  );
});

test("una calle distinta NO es la misma dirección", () => {
  assert.equal(
    sameAddress(BILLING, { ...BILLING, street1: "Calle Mayor 14" }),
    false,
  );
  assert.equal(sameAddress(BILLING, { ...BILLING, zip: "04621" }), false);
  assert.equal(sameAddress(BILLING, { ...BILLING, country: null }), false);
});

test("dos ausencias no son la misma dirección, son dos ausencias", () => {
  const empty = {
    name: null,
    street1: null,
    street2: null,
    city: null,
    state: null,
    zip: null,
    country: null,
  };
  assert.equal(sameAddress(empty, { ...empty }), false);
  assert.equal(sameAddress(null, BILLING), false);
  assert.equal(sameAddress(BILLING, null), false);
});
