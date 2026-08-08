/**
 * El pie de las tablas del ERP dice cuántas filas se ven de cuántas. Las
 * esquinas —última página a medias, total desconocido, lista vacía— son justo
 * donde un recuento miente sin que nadie lo note.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { describeRange } from "./pagination.ts";

test("una sola página se cuenta entera, sin rango", () => {
  assert.equal(describeRange(1, 25, 12, 12), "12 resultados");
  assert.equal(describeRange(1, 25, 1, 1), "1 resultado");
});

test("con varias páginas dice el rango y el total", () => {
  assert.equal(describeRange(1, 25, 25, 132), "1–25 de 132");
  assert.equal(describeRange(2, 25, 25, 132), "26–50 de 132");
});

test("la última página no está llena y el rango lo respeta", () => {
  assert.equal(describeRange(6, 25, 7, 132), "126–132 de 132");
});

test("sin total conocido se dice solo el rango", () => {
  assert.equal(describeRange(3, 25, 25, null), "51–75");
});

test("una lista vacía no finge un rango", () => {
  assert.equal(describeRange(1, 25, 0, 0), "Sin resultados");
  assert.equal(describeRange(1, 25, 0, null), "Sin resultados");
});
