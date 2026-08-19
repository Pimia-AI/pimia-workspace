/**
 * El **preaviso** de vencimiento de una factura: «vence en 3 días».
 *
 * Es lo único que falta en la columna «Vence» del índice, y no es lo mismo que
 * la insignia «Vencida». La insignia la dicta el servidor (`overdue` /
 * `effective_overdue`) y dice **qué** pasa; el preaviso lo calcula esta función
 * y dice **cuándo** va a pasar. Un cobrador que abre la lista los lunes
 * necesita ver las que vencen esta semana, y hasta hoy la tabla se lo callaba:
 * la fecha salía en gris, exactamente igual la que vence mañana que la que
 * vence en noviembre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS CUATRO REGLAS, Y LA CONSECUENCIA DE CADA UNA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Solo avisa mientras quede algo que cobrar.** Un borrador todavía no es
 *    exigible —no tiene ni número—, una factura pagada llegó tarde pero llegó,
 *    y una rectificada del todo no debe nada. Pintar cualquiera de las tres en
 *    ámbar pide actuar sobre algo que ya está cerrado, y una lista con alarmas
 *    falsas se deja de mirar entera: es peor que una lista sin alarmas.
 *
 * 2. **Una fecha que no se entiende no avisa.** Ni rojo ni ámbar: nada. El
 *    `dueDate` llega como texto crudo del servidor (`api/invoices.ts` lo pasa
 *    tal cual) y `parseCivilDate` rechaza todo lo que no sea un `YYYY-MM-DD`
 *    **existente**. Un aviso inventado sobre una fecha ilegible es la misma
 *    mentira que un 0 en el sitio de una raya.
 *
 * 3. **En el vencimiento manda el SERVIDOR, no el calendario.** El rojo de
 *    «Venció hace N días» solo sale si `isOverdue` lo dice; y si el servidor
 *    dice «vencida» pero la fecha aún no ha pasado (o al revés), esta función
 *    calla. El servidor conoce cosas que esta pantalla no —el neto de
 *    rectificativas, los días de gracia de la serie— y una fila que discute
 *    con su propia insignia solo consigue que no se crea ninguna de las dos.
 *    Aquí el calendario aporta el **cuánto**, nunca el **si**.
 *
 * 4. **La comparación es entre CADENAS `YYYY-MM-DD`, sin `Date`.** Es el mismo
 *    criterio que `closeDateWarning` en el CRM y por la misma razón: con
 *    `new Date()` de por medio, una factura que vence hoy sale «vencida» a la
 *    una de la madrugada española, porque a esa hora en UTC ya es mañana. Dos
 *    cadenas entran, un entero sale, y el resultado es el mismo en Madrid, en
 *    Londres y en un test. `today` lo pone la pantalla con `todayIso()` de
 *    `lib/calendar.ts`, que es el día LOCAL de quien mira.
 *
 * ⚠️ La aritmética civil (`parseCivilDate` / `daysBetween`) está escrita aquí
 * abajo porque este repo todavía no tiene `lib/leads.ts`, que es donde vive la
 * gemela en el anfitrión web. El día que ese fichero suba, las dos copias se
 * juntan en un `lib/civilDates.ts` — una regla escrita dos veces es una regla
 * que un día se «simplifica» en uno de los dos sitios.
 */

/** Rojo o ámbar, y el renglón que va bajo la fecha. */
export type PimiaInvoiceDueWarning = {
  text: string;
  tone: "danger" | "warning";
};

/**
 * Una semana: lo que cabe en «esto hay que cobrarlo antes del lunes que viene».
 *
 * Más corto que los 14 días del CRM a propósito. Un lead se cierra cuando se
 * cierra; una factura tiene una fecha pactada, y avisar con quince días de
 * antelación pintaría de ámbar media lista de un tenant que factura a 30 días.
 */
export const DUE_SOON_DAYS = 7;

/**
 * ¿Queda algo que cobrar de esta factura?
 *
 * Se mira `paidStatus` y no el importe pendiente porque el estado del cobro es
 * un atributo que **siempre viene**, mientras que `due_amount` es dinero y
 * puede no poder leerse (`readCents` devuelve `null` en cuanto cambia de
 * forma — ya pasó una vez, llegando como `"1000.00"`). Con el importe como
 * criterio, una factura de verdad vencida se quedaría sin aviso justo el día
 * que el servidor cambia la forma del campo.
 *
 * El importe sí entra por una puerta muy concreta: `effectiveDueCents === 0`
 * es lo único que distingue una factura **anulada por una rectificativa** —que
 * sigue diciendo `UNPAID` porque nadie la pagó, y no debe nada— de una
 * pendiente de verdad. Cuando el servidor no publica los `effective_*` el
 * valor es `null`, y entonces esta comprobación no se aplica: se cae al
 * criterio de siempre en vez de inventarse una anulación.
 */
export function isCollectableInvoice(invoice: {
  effectiveDueCents: number | null;
  paidStatus: string;
  status: string;
}): boolean {
  if (invoice.status === "DRAFT") {
    return false;
  }
  if (invoice.paidStatus === "PAID") {
    return false;
  }
  return invoice.effectiveDueCents !== 0;
}

/**
 * El renglón de aviso que va bajo la fecha de vencimiento, o `null`.
 *
 * `dueDate` y `today`, en `YYYY-MM-DD`. `isOverdue` es lo que dice el servidor
 * (el neto `effective_overdue` cuando lo publica, si no `overdue`), y
 * `isCollectable` sale de `isCollectableInvoice`.
 */
export function invoiceDueWarning(input: {
  dueDate: string | null;
  isCollectable: boolean;
  isOverdue: boolean;
  today: string;
}): PimiaInvoiceDueWarning | null {
  if (!input.isCollectable) {
    return null;
  }

  const days = daysBetween(input.today, input.dueDate);
  if (days === null) {
    return null;
  }

  if (input.isOverdue) {
    // Regla 3: el servidor manda. Si dice «vencida» pero la fecha no ha
    // pasado, aquí no hay nada que contar —la insignia ya lo dice— y decir
    // «venció hace -2 días» sería peor que callarse.
    if (days >= 0) {
      return null;
    }
    const late = -days;
    return {
      text: late === 1 ? "Venció ayer" : `Venció hace ${late} días`,
      tone: "danger",
    };
  }

  // El otro lado de la regla 3: la fecha ya pasó y el servidor NO la da por
  // vencida. Pasa de verdad —una factura con cobro parcial y prórroga, o una
  // serie con días de gracia—, y pintarla en rojo contradiría a la insignia
  // que tiene tres columnas más allá en la misma fila.
  if (days < 0) {
    return null;
  }
  if (days === 0) {
    return { text: "Vence hoy", tone: "warning" };
  }
  if (days === 1) {
    return { text: "Vence mañana", tone: "warning" };
  }
  if (days <= DUE_SOON_DAYS) {
    return { text: `Vence en ${days} días`, tone: "warning" };
  }
  return null;
}

/**
 * Días de `from` a `to`, o `null` si alguna de las dos no es una fecha.
 *
 * Aritmética entera pura sobre el calendario proléptico gregoriano: sin
 * `Date`, sin zonas horarias y sin horario de verano.
 */
function daysBetween(from: string, to: string | null): number | null {
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
function parseCivilDate(value: string | null): number | null {
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
