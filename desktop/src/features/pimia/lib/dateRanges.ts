/**
 * Los rangos de fecha del filtro de listas.
 *
 * El índice de Pimia filtra por `from_date`/`to_date` (y **exige las dos**),
 * así que el desplegable de la UI se traduce aquí a un par de fechas
 * `YYYY-MM-DD`. Vive fuera del componente porque los trimestres y los cambios
 * de año son justo donde este cálculo se tuerce, y eso se prueba.
 *
 * Todo se calcula en hora local: el usuario piensa «este trimestre» en su
 * calendario, no en UTC.
 */

export const DATE_RANGE_PRESETS = [
  "any",
  "last30",
  "quarter",
  "year",
  "lastYear",
] as const;

export type PimiaDateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_LABELS: Record<PimiaDateRangePreset, string> = {
  any: "Cualquier fecha",
  last30: "Últimos 30 días",
  quarter: "Este trimestre",
  year: "Este año",
  lastYear: "El año pasado",
};

export type PimiaDateRange = {
  fromDate?: string;
  toDate?: string;
};

function iso(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function isoOf(date: Date): string {
  return iso(date.getFullYear(), date.getMonth(), date.getDate());
}

/** El rango que corresponde a un preajuste, tomando `today` como hoy. */
export function resolveDateRange(
  preset: PimiaDateRangePreset,
  today: Date,
): PimiaDateRange {
  const year = today.getFullYear();

  switch (preset) {
    case "last30": {
      // 30 días **contando hoy**, que es como lo lee cualquiera.
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { fromDate: isoOf(from), toDate: isoOf(today) };
    }
    case "quarter": {
      const firstMonth = Math.floor(today.getMonth() / 3) * 3;
      const lastDay = new Date(year, firstMonth + 3, 0).getDate();
      return {
        fromDate: iso(year, firstMonth, 1),
        toDate: iso(year, firstMonth + 2, lastDay),
      };
    }
    case "year":
      return { fromDate: iso(year, 0, 1), toDate: iso(year, 11, 31) };
    case "lastYear":
      return { fromDate: iso(year - 1, 0, 1), toDate: iso(year - 1, 11, 31) };
    default:
      return {};
  }
}
