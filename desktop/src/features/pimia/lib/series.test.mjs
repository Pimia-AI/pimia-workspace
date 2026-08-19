/**
 * Las tres piezas de una serie mensual son las tres donde un error no falla:
 * la que alinea (o desplaza el año entero), la que rotula (o inventa un mes) y
 * la que mide la barra (o borra un importe pequeño). Por eso se prueban.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  alignedColumn,
  barHeightPct,
  MIN_BAR_PCT,
  monthLabel,
  seriesMax,
} from "./series.ts";

test("una serie de la longitud del eje pasa tal cual", () => {
  const column = ["1", "2", "3"];
  assert.equal(alignedColumn(column, 3), column);
});

test("una serie más corta que el eje NO se cruza a medias", () => {
  // El caso que desplaza el año entero: once gastos bajo doce meses.
  assert.equal(alignedColumn(["1", "2"], 3), null);
  assert.equal(alignedColumn(["1", "2", "3", "4"], 3), null);
});

test("lo que no es una lista no es una serie", () => {
  assert.equal(alignedColumn(undefined, 3), null);
  assert.equal(alignedColumn(null, 3), null);
  assert.equal(alignedColumn({ 0: "1" }, 3), null);
  assert.equal(alignedColumn("123", 3), null);
});

test("un eje vacío admite una serie vacía y nada más", () => {
  assert.deepEqual(alignedColumn([], 0), []);
  assert.equal(alignedColumn(["1"], 0), null);
});

test("el mes se escribe corto, y el enero lleva su año", () => {
  assert.equal(monthLabel("2026-08"), "ago");
  assert.equal(monthLabel("2026-01"), "ene 26");
});

test("un mes que no se entiende se enseña en crudo, no se inventa", () => {
  assert.equal(monthLabel("agosto"), "agosto");
  assert.equal(monthLabel("2026-13"), "2026-13");
  assert.equal(monthLabel("2026-00"), "2026-00");
  assert.equal(monthLabel("2026-8"), "2026-8");
});

test("el máximo ignora huecos, ceros y negativos", () => {
  assert.equal(seriesMax([100, null, 250, 0]), 250);
  assert.equal(seriesMax([null, null]), null);
  assert.equal(seriesMax([]), null);
  assert.equal(seriesMax([0, -100]), null);
});

test("la barra escala sobre el máximo de la ventana", () => {
  assert.equal(barHeightPct(250, 250), 100);
  assert.equal(barHeightPct(125, 250), 50);
});

test("un importe pequeño pero real no se queda en cero", () => {
  // 1 sobre 100000 daría 0,001 %: invisible, e indistinguible de «no facturó».
  assert.equal(barHeightPct(1, 100000), MIN_BAR_PCT);
});

test("un importe ilegible es hueco, no una barra a ras de suelo", () => {
  assert.equal(barHeightPct(null, 250), null);
  assert.equal(barHeightPct(Number.NaN, 250), null);
});

test("sin escala no se dibuja: no se reparte el ancho a ojo", () => {
  assert.equal(barHeightPct(250, null), null);
  assert.equal(barHeightPct(250, 0), null);
});

test("un cero leído sí es un cero: barra sin altura", () => {
  assert.equal(barHeightPct(0, 250), 0);
  assert.equal(barHeightPct(-500, 250), 0);
});
