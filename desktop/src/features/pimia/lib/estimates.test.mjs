/**
 * El preaviso de caducidad. Como el de facturas, casi todo lo que tiene son
 * casos en los que la respuesta correcta es **no avisar**, y esos no se ven
 * mirando una pantalla: se ven cuando alguien «arregla» la función para que
 * avise siempre y nadie nota que la lista empezó a mentir.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { estimateExpiryWarning, isOpenEstimate } from "./estimates.ts";

const TODAY = "2026-08-18";

/** Un presupuesto enviado y sin respuesta: el caso que sí avisa. */
const open = { status: "SENT", today: TODAY };

test("el preaviso cuenta los días que faltan", () => {
  assert.deepEqual(estimateExpiryWarning({ ...open, expiryDate: TODAY }), {
    text: "Caduca hoy",
    tone: "warning",
  });
  assert.deepEqual(
    estimateExpiryWarning({ ...open, expiryDate: "2026-08-19" }),
    { text: "Caduca mañana", tone: "warning" },
  );
  assert.deepEqual(
    estimateExpiryWarning({ ...open, expiryDate: "2026-08-21" }),
    { text: "Caduca en 3 días", tone: "warning" },
  );
});

test("a partir de una semana no hay nada que avisar", () => {
  // El borde: el séptimo día todavía avisa, el octavo ya no. Sin este test,
  // un `<` por un `<=` pasa desapercibido para siempre.
  assert.equal(
    estimateExpiryWarning({ ...open, expiryDate: "2026-08-25" })?.text,
    "Caduca en 7 días",
  );
  assert.equal(
    estimateExpiryWarning({ ...open, expiryDate: "2026-08-26" }),
    null,
  );
});

test("la fecha pasada enciende el rojo: el barrido del servidor va por detrás", () => {
  // Ésta es la diferencia con las facturas, y es a propósito: allí el rojo lo
  // enciende `overdue`; aquí no hay bandera aparte —`EXPIRED` es un estado— y
  // el presupuesto sigue diciendo SENT hasta que el barrido pasa.
  assert.deepEqual(
    estimateExpiryWarning({ ...open, expiryDate: "2026-08-06" }),
    { text: "Caducó hace 12 días", tone: "danger" },
  );
  assert.deepEqual(
    estimateExpiryWarning({ ...open, expiryDate: "2026-08-17" }),
    { text: "Caducó ayer", tone: "danger" },
  );
  assert.equal(
    estimateExpiryWarning({
      ...open,
      status: "VIEWED",
      expiryDate: "2026-08-17",
    })?.tone,
    "danger",
  );
});

test("solo avisa lo que sigue a la espera de respuesta", () => {
  const expiry = "2026-08-19";
  // Un borrador no ha salido de casa; un aceptado o un rechazado ya están
  // decididos; y en un caducado la insignia ya lo dice ella sola.
  for (const status of ["DRAFT", "ACCEPTED", "REJECTED", "EXPIRED"]) {
    assert.equal(
      estimateExpiryWarning({ expiryDate: expiry, status, today: TODAY }),
      null,
      `${status} no debería avisar`,
    );
  }
  // Un estado que esta versión no conoce tampoco avisa.
  assert.equal(
    estimateExpiryWarning({
      expiryDate: expiry,
      status: "PENDIENTE",
      today: TODAY,
    }),
    null,
  );
  assert.equal(isOpenEstimate("SENT"), true);
  assert.equal(isOpenEstimate("VIEWED"), true);
  assert.equal(isOpenEstimate("DRAFT"), false);
});

test("sin fecha, o con una que no se entiende, no se avisa nada", () => {
  assert.equal(estimateExpiryWarning({ ...open, expiryDate: null }), null);
  assert.equal(estimateExpiryWarning({ ...open, expiryDate: "" }), null);
  assert.equal(
    estimateExpiryWarning({ ...open, expiryDate: "19/08/2026" }),
    null,
  );
  // Una fecha imposible con forma buena: `new Date` la correría a marzo, aquí
  // no avisa nada.
  assert.equal(
    estimateExpiryWarning({ ...open, expiryDate: "2026-02-31" }),
    null,
  );
});

test("ningún texto contiene el rótulo de la insignia «Caducado»", () => {
  // La regla que costó tres tropiezos en la ficha de factura: `getByText` casa
  // por subcadena, y un renglón que dijera «Caducado hace 3 días» chocaría con
  // la insignia de la misma fila.
  const textos = ["2026-08-06", "2026-08-17", TODAY, "2026-08-19", "2026-08-21"]
    .map((expiryDate) => estimateExpiryWarning({ ...open, expiryDate })?.text)
    .filter(Boolean);
  assert.equal(textos.length, 5);
  for (const texto of textos) {
    assert.ok(!texto.includes("Caducado"), texto);
  }
});
