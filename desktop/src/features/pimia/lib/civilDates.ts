/**
 * Aritmética de **fechas civiles** (`YYYY-MM-DD`) sin `Date`, sin husos y sin
 * horario de verano.
 *
 * Existe para que las reglas de plazo del ERP —«vence en 3 días», «caduca
 * mañana»— se calculen restando dos cadenas y no dos instantes. Con `Date` de
 * por medio, una factura que vence hoy sale vencida a la una de la madrugada
 * española (a esa hora en UTC ya es mañana) y un presupuesto parece caducar el
 * día antes de caducar. Dos cadenas entran, un entero sale, y el resultado es
 * el mismo en Madrid, en Londres y en un test.
 *
 * ⚠️ Este fichero es el que pedía por su nombre el docblock de `lib/invoices.ts`
 * («el día que suba, las dos copias se juntan en un `lib/civilDates.ts` — una
 * regla escrita dos veces es una regla que un día se "simplifica" en uno de los
 * dos sitios»). Lo que lo ha traído es el segundo cliente: el preaviso de
 * caducidad de los presupuestos (`lib/estimates.ts`). Ahora hay una sola copia
 * de la cuenta de días y una sola tanda de pruebas que la sujeta.
 *
 * `today` lo pone siempre la pantalla con `todayIso()` de `lib/calendar.ts`,
 * que es el día LOCAL de quien mira. Aquí no se lee ningún reloj a propósito:
 * una función que se consulta el reloj no se puede probar sin congelarlo.
 */

/**
 * Días de `from` a `to`, o `null` si alguna de las dos no es una fecha.
 *
 * Positivo si `to` está en el futuro de `from`. El `null` es el que impide que
 * una fecha rota se convierta en un aviso inventado: quien llama lo traduce a
 * «no avisar», nunca a «cero días».
 */
export function daysBetween(
  from: string | null,
  to: string | null,
): number | null {
  const start = parseCivilDate(from);
  const end = parseCivilDate(to);
  if (start === null || end === null) {
    return null;
  }
  return end - start;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * `YYYY-MM-DD` → número de días desde una época fija, o `null`.
 *
 * Rechaza el 31 de febrero en vez de dejarlo caer en marzo, que es lo que hace
 * `new Date("2026-02-31")` sin decir nada: una fecha imposible es un dato roto,
 * y aquí un dato roto vale `null` (o sea, sin aviso), nunca una fecha vecina.
 *
 * El algoritmo es el de días civiles de Hinnant: mueve el año a marzo para que
 * el día bisiesto quede al final y la cuenta no tenga casos especiales.
 */
export function parseCivilDate(value: string | null): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1) {
    return null;
  }
  const monthLength =
    month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
  if (day > monthLength) {
    return null;
  }

  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}
