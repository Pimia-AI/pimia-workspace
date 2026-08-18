/**
 * La semana del módulo de tiempos. Se prueba porque los dos sitios donde este
 * cálculo se tuerce —el cambio de mes y el cambio de hora— son justo los que no
 * se ven mirando la pantalla un martes cualquiera.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  dayNumber,
  mondayOf,
  todayIso,
  weekDays,
  weekTitle,
} from "./calendar.ts";

test("«hoy» es el día del calendario de quien mira, no el de UTC", () => {
  // La una de la madrugada del 18 de agosto en hora local. El original
  // (`toISOString().slice(0, 10)`) diría 17 en España en verano: el parte se
  // apuntaría al día anterior sin que nadie lo dijera.
  assert.equal(todayIso(new Date(2026, 7, 18, 1, 0, 0)), "2026-08-18");
  assert.equal(todayIso(new Date(2026, 7, 18, 23, 59, 0)), "2026-08-18");
});

test("la semana empieza en lunes", () => {
  // 2026-08-18 es martes.
  assert.equal(mondayOf("2026-08-18"), "2026-08-17");
  // Un lunes es su propio lunes.
  assert.equal(mondayOf("2026-08-17"), "2026-08-17");
  // Y un domingo pertenece a la semana que ya iba, no a la que empieza.
  assert.equal(mondayOf("2026-08-23"), "2026-08-17");
});

test("sumar días cruza meses y años", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("el cambio de hora no mueve la fecha", () => {
  // En España el horario de verano acaba el último domingo de octubre: esa
  // medianoche existe dos veces. Sumando sobre ella, un cálculo ingenuo se
  // queda en el mismo día.
  assert.equal(addDays("2026-10-24", 1), "2026-10-25");
  assert.equal(addDays("2026-10-25", 1), "2026-10-26");
  // Y en marzo la medianoche del cambio no existe en algunos husos.
  assert.equal(addDays("2026-03-28", 1), "2026-03-29");
  assert.equal(addDays("2026-03-29", 1), "2026-03-30");
});

test("la semana son siete días de lunes a domingo", () => {
  const dias = weekDays("2026-08-17");
  assert.equal(dias.length, 7);
  assert.equal(dias[0], "2026-08-17");
  assert.equal(dias[6], "2026-08-23");
});

test("el título dice los dos lados cuando la semana cruza el mes", () => {
  assert.equal(weekTitle("2026-08-17"), "17 – 23 de agosto de 2026");
  // «31 – 6 de septiembre» se leería mal: se dicen los dos enteros.
  assert.equal(
    weekTitle("2026-08-31"),
    "31 de agosto de 2026 – 6 de septiembre de 2026",
  );
});

test("el número del día es el local, sin ceros a la izquierda", () => {
  assert.equal(dayNumber("2026-08-01"), "1");
  assert.equal(dayNumber("2026-08-18"), "18");
});
