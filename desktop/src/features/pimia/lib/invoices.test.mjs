/**
 * El preaviso de vencimiento. Se prueba aparte de la tabla porque casi todo lo
 * que tiene son casos en los que la respuesta correcta es **no avisar**, y esos
 * no se ven mirando una pantalla: se ven cuando alguien «arregla» la función
 * para que avise siempre y nadie nota que la lista empezó a mentir.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { invoiceDueWarning, isCollectableInvoice } from "./invoices.ts";

const TODAY = "2026-08-18";

/** Una factura publicada, sin cobrar, que es el caso que sí avisa. */
const collectable = {
  isCollectable: true,
  isOverdue: false,
  today: TODAY,
};

test("el preaviso cuenta los días que faltan", () => {
  assert.deepEqual(invoiceDueWarning({ ...collectable, dueDate: TODAY }), {
    text: "Vence hoy",
    tone: "warning",
  });
  assert.deepEqual(
    invoiceDueWarning({ ...collectable, dueDate: "2026-08-19" }),
    { text: "Vence mañana", tone: "warning" },
  );
  assert.deepEqual(
    invoiceDueWarning({ ...collectable, dueDate: "2026-08-21" }),
    { text: "Vence en 3 días", tone: "warning" },
  );
});

test("a partir de una semana no hay nada que avisar", () => {
  // El borde: el séptimo día todavía avisa, el octavo ya no. Sin este test,
  // un `<` por un `<=` pasa desapercibido para siempre.
  assert.equal(
    invoiceDueWarning({ ...collectable, dueDate: "2026-08-25" })?.text,
    "Vence en 7 días",
  );
  assert.equal(
    invoiceDueWarning({ ...collectable, dueDate: "2026-08-26" }),
    null,
  );
});

test("vencida: el rojo lo enciende el SERVIDOR, y el calendario solo cuenta", () => {
  assert.deepEqual(
    invoiceDueWarning({
      ...collectable,
      dueDate: "2026-08-06",
      isOverdue: true,
    }),
    { text: "Venció hace 12 días", tone: "danger" },
  );
  assert.deepEqual(
    invoiceDueWarning({
      ...collectable,
      dueDate: "2026-08-17",
      isOverdue: true,
    }),
    { text: "Venció ayer", tone: "danger" },
  );
});

test("la fecha pasada sin `overdue` del servidor NO se pinta en rojo", () => {
  // Pasa de verdad: cobro parcial con prórroga, o una serie con días de
  // gracia. La insignia de la fila dice «Pendiente», y una segunda línea roja
  // debajo la contradiría. Manda el servidor.
  assert.equal(
    invoiceDueWarning({ ...collectable, dueDate: "2026-07-01" }),
    null,
  );
});

test("y `overdue` con la fecha aún por llegar tampoco inventa un «hace -2 días»", () => {
  assert.equal(
    invoiceDueWarning({
      ...collectable,
      dueDate: "2026-08-20",
      isOverdue: true,
    }),
    null,
  );
});

test("lo que no se puede cobrar no avisa, ni siquiera vencido", () => {
  assert.equal(
    invoiceDueWarning({
      dueDate: "2026-07-01",
      isCollectable: false,
      isOverdue: true,
      today: TODAY,
    }),
    null,
  );
});

test("una fecha que no se entiende no avisa: ni rojo, ni ámbar, nada", () => {
  for (const dueDate of [
    null,
    "",
    "18/08/2026",
    "2026-08-18T00:00:00Z",
    // ⚠️ El caso que `new Date()` se traga sin decir nada: no existe el 30 de
    // febrero, y JS lo desborda al 2 de marzo. Aquí es un dato roto.
    "2026-02-30",
    "2026-13-01",
  ]) {
    assert.equal(
      invoiceDueWarning({ ...collectable, dueDate }),
      null,
      `debería callar con ${JSON.stringify(dueDate)}`,
    );
  }
});

test("la cuenta cruza meses, años y el día bisiesto sin despeinarse", () => {
  assert.equal(
    invoiceDueWarning({
      ...collectable,
      dueDate: "2028-03-01",
      today: "2028-02-28",
    })?.text,
    // 2028 es bisiesto: del 28 de febrero al 1 de marzo hay DOS días.
    "Vence en 2 días",
  );
  assert.equal(
    invoiceDueWarning({
      ...collectable,
      dueDate: "2027-01-02",
      today: "2026-12-31",
    })?.text,
    "Vence en 2 días",
  );
});

test("un borrador no es exigible: no tiene número y no se le debe nada", () => {
  assert.equal(
    isCollectableInvoice({
      effectiveDueCents: 120000,
      paidStatus: "UNPAID",
      status: "DRAFT",
    }),
    false,
  );
});

test("una pagada no vuelve a avisar aunque llegara tarde", () => {
  assert.equal(
    isCollectableInvoice({
      effectiveDueCents: 0,
      paidStatus: "PAID",
      status: "SENT",
    }),
    false,
  );
});

test("una anulada por rectificativa dice UNPAID y no debe nada", () => {
  // El único caso en el que el importe manda sobre el estado: nadie la pagó,
  // pero una rectificativa la dejó a cero. Sin esto, la lista pediría cobrar
  // una factura que ya no existe.
  assert.equal(
    isCollectableInvoice({
      effectiveDueCents: 0,
      paidStatus: "UNPAID",
      status: "SENT",
    }),
    false,
  );
});

test("sin `effective_*` (servidor viejo) se cae al criterio de siempre", () => {
  // `null` es «el servidor no lo dijo», no «cero». Tratarlo como cero dejaría
  // sin avisos a todo un tenant servido por una versión anterior.
  assert.equal(
    isCollectableInvoice({
      effectiveDueCents: null,
      paidStatus: "UNPAID",
      status: "SENT",
    }),
    true,
  );
  assert.equal(
    isCollectableInvoice({
      effectiveDueCents: 45050,
      paidStatus: "PARTIALLY_PAID",
      status: "SENT",
    }),
    true,
  );
});
