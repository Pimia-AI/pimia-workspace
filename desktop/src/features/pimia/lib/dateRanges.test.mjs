/**
 * El filtro de fechas manda `from_date`/`to_date` a la API, y la API se los
 * cree. Los trimestres, los meses de 30 y 31 días y el cambio de año son donde
 * un rango se tuerce sin que nadie lo note.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveDateRange } from "./dateRanges.ts";

test("«cualquier fecha» no manda rango", () => {
  assert.deepEqual(resolveDateRange("any", new Date(2026, 7, 8)), {});
});

test("los últimos 30 días incluyen hoy", () => {
  // 8 de agosto de 2026 menos 29 días = 10 de julio; son 30 días contando hoy.
  assert.deepEqual(resolveDateRange("last30", new Date(2026, 7, 8)), {
    fromDate: "2026-07-10",
    toDate: "2026-08-08",
  });
});

test("los últimos 30 días cruzan el cambio de año", () => {
  assert.deepEqual(resolveDateRange("last30", new Date(2026, 0, 5)), {
    fromDate: "2025-12-07",
    toDate: "2026-01-05",
  });
});

test("el trimestre en curso va de su primer día a su último", () => {
  // Agosto cae en el tercer trimestre: julio–septiembre.
  assert.deepEqual(resolveDateRange("quarter", new Date(2026, 7, 8)), {
    fromDate: "2026-07-01",
    toDate: "2026-09-30",
  });
  // El primero acaba en marzo, que tiene 31.
  assert.deepEqual(resolveDateRange("quarter", new Date(2026, 1, 14)), {
    fromDate: "2026-01-01",
    toDate: "2026-03-31",
  });
});

test("el año en curso y el anterior van completos", () => {
  assert.deepEqual(resolveDateRange("year", new Date(2026, 7, 8)), {
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
  });
  assert.deepEqual(resolveDateRange("lastYear", new Date(2026, 7, 8)), {
    fromDate: "2025-01-01",
    toDate: "2025-12-31",
  });
});
