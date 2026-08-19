/**
 * El **preaviso de caducidad** de un presupuesto: «caduca en 3 días».
 *
 * Es el gemelo del preaviso de vencimiento de las facturas (`lib/invoices.ts`),
 * y hasta hoy la columna «Válido hasta» del índice no lo tenía: la fecha salía
 * en gris exactamente igual la que caduca mañana que la de noviembre. En un
 * presupuesto eso importa más que en una factura, porque la caducidad es la
 * única fecha con la que se puede hacer algo —llamar al cliente antes de que se
 * le pase el plazo—; después ya no hay nada que cobrar, solo que rehacer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CADUCAR NO ES VENCER: EN QUÉ SE PARECE A `invoiceDueWarning` Y EN QUÉ NO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Se parece en tres cosas, y son las tres que no se negocian:**
 *
 * 1. **Solo avisa mientras quede algo que decidir**, o sea en `SENT` y
 *    `VIEWED`. Un `DRAFT` no se le ha mandado a nadie: su fecha de caducidad no
 *    le ha prometido nada a nadie todavía, y pintarla en ámbar pide correr por
 *    algo que no ha salido de casa. Un `ACCEPTED` o un `REJECTED` ya están
 *    decididos: la fecha dejó de gobernar. Una lista con alarmas falsas se deja
 *    de mirar entera, y entonces también se pierden las verdaderas.
 *
 * 2. **Una fecha que no se entiende no avisa.** Ni rojo ni ámbar: nada.
 *    `expiryDate` llega como texto crudo del servidor y `parseCivilDate`
 *    (`lib/civilDates.ts`) rechaza todo lo que no sea un `YYYY-MM-DD`
 *    existente. Un aviso inventado sobre una fecha ilegible es la misma mentira
 *    que un 0 en el sitio de una raya. Y `expiry_date` puede no venir: un
 *    presupuesto sin caducidad es válido, y no avisa nada.
 *
 * 3. **La comparación es entre CADENAS `YYYY-MM-DD`, sin `Date`.** Con
 *    `new Date()` de por medio, un presupuesto que caduca hoy sale caducado a la
 *    una de la madrugada española, porque a esa hora en UTC ya es mañana. `today`
 *    lo pone la pantalla con `todayIso()` (`lib/calendar.ts`), que es el día
 *    LOCAL de quien mira, y baja como prop a la tabla: cien filas no son cien
 *    relojes.
 *
 * ⚠️ **Y se diferencia en la más delicada de todas, la regla 3 de facturas.**
 * Allí «el servidor manda»: el rojo lo enciende `overdue` y el calendario nunca
 * lleva la contraria a la insignia, porque el vencimiento es un HECHO aparte
 * del estado del documento. Aquí no hay ninguna bandera equivalente: la
 * caducidad **es** un estado (`EXPIRED`), y quien lo estampa es un barrido que
 * va por detrás del calendario. O sea que un presupuesto cuya fecha pasó ayer
 * sigue diciendo `SENT` hasta que el barrido llega.
 *
 * Por eso aquí el rojo **sí** lo enciende el calendario, y no es una
 * contradicción sino la mitad que falta: la insignia dice el estado que el
 * servidor tiene grabado y el renglón dice qué día es hoy. Lo que **no** se
 * hace es tocar la insignia —nadie pinta «Caducado» por su cuenta— ni avisar
 * cuando el servidor ya lo ha estampado: en `EXPIRED` la insignia ya lo dice, y
 * repetirlo dos centímetros más allá haría que quien lo lee dos veces suponga
 * que son dos hechos distintos.
 *
 * (De ahí también que ninguno de estos textos diga «Caducado»: es el rótulo
 * exacto de la insignia, y una frase que lo contenga choca con ella en cuanto
 * alguien escribe un `getByText`.)
 */

import { daysBetween } from "./civilDates.ts";

/** Rojo o ámbar, y el renglón que va bajo la fecha. */
export type PimiaEstimateExpiryWarning = {
  text: string;
  tone: "danger" | "warning";
};

/**
 * Una semana, el mismo horizonte que el preaviso de las facturas.
 *
 * No es simetría por simetría: es lo que cabe en «esto hay que moverlo antes
 * del lunes que viene», que es la unidad con la que se mira una lista de
 * documentos abiertos. Más ancho pintaría de ámbar media lista de un tenant que
 * presupuesta a 30 días, y el ámbar dejaría de significar nada.
 */
export const EXPIRY_SOON_DAYS = 7;

/**
 * ¿Sigue este presupuesto a la espera de respuesta?
 *
 * Los dos únicos estados en los que la caducidad todavía gobierna algo. Se mira
 * el `status` tal cual llega —es `string`, porque la API puede devolver uno que
 * esta versión no conozca— y lo desconocido no avisa: inventarse que un estado
 * nuevo sigue abierto es exactamente el aviso falso que la regla 1 prohíbe.
 */
export function isOpenEstimate(status: string): boolean {
  return status === "SENT" || status === "VIEWED";
}

/**
 * El renglón que va bajo la fecha de caducidad, o `null`.
 *
 * `expiryDate` y `today`, en `YYYY-MM-DD`; `status`, el del presupuesto.
 */
export function estimateExpiryWarning(input: {
  expiryDate: string | null;
  status: string;
  today: string;
}): PimiaEstimateExpiryWarning | null {
  if (!isOpenEstimate(input.status)) {
    return null;
  }

  const days = daysBetween(input.today, input.expiryDate);
  if (days === null) {
    return null;
  }

  if (days < 0) {
    // El barrido del servidor todavía no ha pasado. La insignia sigue diciendo
    // el estado grabado y esta línea dice el calendario: no se contradicen,
    // porque hablan de cosas distintas.
    const late = -days;
    return {
      text: late === 1 ? "Caducó ayer" : `Caducó hace ${late} días`,
      tone: "danger",
    };
  }
  if (days === 0) {
    return { text: "Caduca hoy", tone: "warning" };
  }
  if (days === 1) {
    return { text: "Caduca mañana", tone: "warning" };
  }
  if (days <= EXPIRY_SOON_DAYS) {
    return { text: `Caduca en ${days} días`, tone: "warning" };
  }
  return null;
}
