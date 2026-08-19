/**
 * Clientes del ERP.
 *
 * La API devuelve casi todo como cadena (recursos de Laravel), así que aquí se
 * normaliza a un tipo con el que la UI pueda trabajar sin `??` por todas
 * partes. Los importes se dejan en **céntimos enteros** — ver `lib/money.ts`.
 *
 * ## Lo que este fichero tiraba, y por qué se rescata ahora
 *
 * 👤 **`getCustomer` NO manda `view=summary`** (el índice sí, y por eso el
 * `opt-in` está escrito ahí abajo). O sea que la ficha recibía el
 * `CustomerResource` **entero** —`website`, `prefix`, `notes`, `iban`, `bic`,
 * el mandato SEPA, `billing`, `shipping`, `currency`, `payment_method`— y este
 * normalizador se quedaba con nueve campos. No era una decisión: era dato ya
 * pagado —la petición ya se hizo, los bytes ya viajaron— que se tiraba en la
 * última línea del viaje.
 *
 * ⚠️ **Cada campo rescatado tiene un sitio en pantalla**, y los que no lo
 * tienen siguen sin leerse **a propósito**:
 *
 * - **`enable_portal`** (3202) es un booleano tipado `string` y el contrato
 *   **no publica sus valores** (¿`"YES"`? ¿`"1"`?). Pintar «Portal: activo»
 *   adivinando el valor es inventar; se sondea antes o no se pinta.
 * - **`password_added`** (3203) sí es un `boolean` de verdad —el único del
 *   recurso—, pero decir si un cliente tiene contraseña de portal no es dato de
 *   una ficha fiscal.
 * - **`avatar`** (3213) llega en el `show`, y la ficha pinta **iniciales**, como
 *   la maqueta: una foto de cliente en un ERP de facturación es adorno con
 *   coste de red.
 * - **`currency_id`** y **`payment_method_id`** son ids pelados; lo legible son
 *   sus relaciones, que es lo que se lee.
 * - **`base_due_amount`** (3215) es el saldo en moneda base: sólo dice algo
 *   distinto en multidivisa, y esta ficha todavía no la cuenta.
 * - **`facebook_id`/`google_id`/`github_id`**, `company_id`, `updated_at` y
 *   `external_ref`: nada que hacer en una ficha de cliente.
 * - **`formatted_created_at`** (3211) es la misma alta ya formateada por el
 *   servidor. **No se usa a propósito**: el ERP formatea con `ui/pimiaDates.ts`,
 *   y mezclar los dos criterios pone dos formatos de fecha en la misma pantalla.
 * - **`fields`** (3232) son los campos propios del tenant: portables, pero es un
 *   módulo aparte —sin la relación `custom_field` cargada sólo hay ids.
 *
 * ⛔ **No existe ningún campo `nif` ni `cif`** en todo el contrato: se llama
 * `tax_id`, igual que el de la empresa.
 */

import {
  normalizeAddress,
  type PimiaAddress,
} from "@/features/pimia/api/addresses";
import {
  pimiaRequest,
  derivePagination,
  readCompanyCount,
  readPagination,
  unwrapItem,
  type PimiaPagination,
  unwrapList,
} from "@/features/pimia/api/pimiaClient";
import { alignedColumn } from "@/features/pimia/lib/series";
import { readCents } from "@/features/pimia/lib/money";

export type PimiaCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  contactName: string | null;
  taxId: string | null;
  /** Saldo pendiente en céntimos. */
  dueAmountCents: number | null;
  /**
   * El alta, ya recortada a `YYYY-MM-DD`.
   *
   * ⚠️ `created_at` (3210) es un **datetime**, no una fecha civil, y
   * `ui/pimiaDates.ts` sólo entiende `YYYY-MM-DD` —lo que no entiende lo enseña
   * en crudo—. Recortarlo aquí y no en la vista es lo que impide que la misma
   * alta salga «18 ago 2026» en un sitio y `2026-08-18T22:31:07.000000Z` en
   * otro.
   */
  createdAt: string | null;
  /**
   * Los siguientes **sólo llegan en la ficha** (`GET /customers/{id}`): el
   * índice va con `view=summary` y los recorta. `null` ahí no significa «no
   * tiene», significa «no se pidieron».
   */
  website: string | null;
  /** El prefijo de numeración propio de este cliente (3216). */
  prefix: string | null;
  /** Notas internas (3218). Escalar `string`, no la unión rara del presupuesto. */
  notes: string | null;
  /** `currency.code` / `.name` (3234 → 3071): el chip «EUR» de la cabecera. */
  currencyCode: string | null;
  currencyName: string | null;
  /** `payment_method.name` (3235 → 4036). Lo único pintable de esa relación. */
  paymentMethodName: string | null;
  /**
   * SEPA, **de sólo lectura**: `iban` (3226), `bic` (3227),
   * `sepa_mandate_id` (3228) y `sepa_mandate_date` (3229) están en el
   * **Resource** y **no** en el `CustomerRequest` (3139-3192). Se pueden pintar;
   * ofrecer editarlos sería una promesa que la API no cumple.
   */
  iban: string | null;
  bic: string | null;
  sepaMandateId: string | null;
  sepaMandateDate: string | null;
  /**
   * Direcciones de facturación y de envío (3230-3231), las dos
   * `AddressResource`.
   *
   * ⚠️ Son relaciones **opcionales** y el contrato no promete que el `show` las
   * cargue (`billing` sigue llevando `?` incluso en `GET /customers/{customer}`).
   * Se leen de forma oportunista: si vienen se pintan, si no el bloque **no se
   * pinta y no deja hueco**.
   */
  billing: PimiaAddress | null;
  shipping: PimiaAddress | null;
};

export type PimiaCustomerPage = {
  customers: PimiaCustomer[];
  pagination: PimiaPagination | null;
  /** Los que casan con la búsqueda actual: el `total` del paginador. */
  totalCount: number | null;
  /** Todos los del tenant, ignorando el filtro. Ver `readCompanyCount`. */
  companyTotalCount: number | null;
};

type RawCustomer = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Un `datetime` del servidor → la fecha civil que `ui/pimiaDates.ts` entiende.
 *
 * Lo que no empiece por `YYYY-MM-DD` se devuelve **tal cual**: enseñar la
 * cadena cruda es lo que permite reconocer un formato nuevo, y recortar a
 * ciegas los diez primeros caracteres de algo que no es una fecha fabricaría
 * una que sí lo parece.
 */
function civilDate(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw;
}

/** El nombre de una relación `{ name }` (moneda, forma de pago). */
function relationField(raw: unknown, key: string): string | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  return text((raw as Record<string, unknown>)[key]);
}

function normalizeCustomer(raw: RawCustomer): PimiaCustomer {
  return {
    id: String(raw.id ?? ""),
    name: text(raw.name) ?? "(sin nombre)",
    email: text(raw.email),
    phone: text(raw.phone),
    companyName: text(raw.company_name),
    contactName: text(raw.contact_name),
    taxId: text(raw.tax_id),
    dueAmountCents: readCents(raw.due_amount),
    createdAt: civilDate(raw.created_at),
    website: text(raw.website),
    prefix: text(raw.prefix),
    notes: text(raw.notes),
    currencyCode: relationField(raw.currency, "code"),
    currencyName: relationField(raw.currency, "name"),
    paymentMethodName: relationField(raw.payment_method, "name"),
    iban: text(raw.iban),
    bic: text(raw.bic),
    sepaMandateId: text(raw.sepa_mandate_id),
    sepaMandateDate: civilDate(raw.sepa_mandate_date),
    billing: normalizeAddress(raw.billing),
    shipping: normalizeAddress(raw.shipping),
  };
}

export type ListCustomersInput = {
  page?: number;
  limit?: number;
  search?: string;
};

export async function listCustomers(
  input: ListCustomersInput = {},
): Promise<PimiaCustomerPage> {
  const payload = await pimiaRequest<unknown>({
    path: "/customers",
    query: {
      // Opt-in a la vista ligera del índice (`view=summary`, factSaas #339):
      // nombre, contacto, NIF, saldo pendiente neto en céntimos y fechas; sin
      // direcciones, campos personalizados, empresa, moneda ni método de pago,
      // y sin el avatar, que en el servidor costaba una consulta por fila.
      // Baja la página de ~88-98 KB a ~13 KB. Un servidor que aún no conoce el
      // parámetro lo ignora y responde la vista completa, así que este opt-in
      // puede desplegarse por delante de la plataforma.
      view: "summary",
      page: input.page,
      limit: input.limit,
      search: input.search?.trim() || undefined,
    },
  });

  const companyTotalCount = readCompanyCount(payload, "customer_total_count");
  const pagination = derivePagination(
    readPagination(payload),
    companyTotalCount,
    input.page,
    input.limit,
  );

  return {
    customers: unwrapList<RawCustomer>(payload).map(normalizeCustomer),
    pagination,
    totalCount: pagination?.total ?? companyTotalCount,
    companyTotalCount,
  };
}

export async function getCustomer(
  customerId: string,
): Promise<PimiaCustomer | null> {
  const payload = await pimiaRequest<unknown>({
    path: `/customers/${encodeURIComponent(customerId)}`,
  });
  const raw = unwrapItem<RawCustomer>(payload);
  return raw ? normalizeCustomer(raw) : null;
}

/* ------------------------------------------------------------------------- *
 * Estadísticas del cliente — `GET /customers/{customer}/stats`
 * ------------------------------------------------------------------------- */

/** Un mes del eje, con las dos series que se pueden afirmar. */
export type PimiaCustomerMonth = {
  /** Tal como llegó: el contrato **no declara el formato** de `months[i]`. */
  ym: string;
  invoicedCents: number | null;
  receivedCents: number | null;
};

export type PimiaCustomerStats = {
  /** El eje. Vacío cuando no se pudo leer: no hay gráfica que dibujar. */
  months: PimiaCustomerMonth[];
  /**
   * `false` cuando esa serie llegó con **otra longitud que el eje** y entró
   * entera como huecos. Se expone para que la tarjeta pueda decir por qué hay
   * huecos en vez de dejarlos sin explicación. Ver `lib/series.ts`.
   */
  invoicedAligned: boolean;
  receivedAligned: boolean;
  /**
   * `meta.estimatesActiveCount` (6158), un agregado **de verdad numérico** —
   * en `meta` el generador sí acierta los tipos—. `null` si no lo es.
   *
   * ⚠️ **El contrato no define «activo»**: no dice si cuenta `DRAFT+SENT+VIEWED`,
   * si excluye caducados, ni nada. El rótulo que lo pinte **no puede afirmar el
   * criterio**.
   */
  estimatesActiveCount: number | null;
  /**
   * `meta.totalDueAmount` (6159), tipado literalmente **`string | 0`**: el
   * servidor manda el entero `0` cuando no hay deuda y una cadena decimal
   * cuando la hay. Es el patrón exacto de `due_amount`, el campo que ya mordió.
   *
   * ⚠️ Se lee con **`readCents`**, jamás con `Number()`: `Number(undefined)` es
   * `NaN` y `formatCents(NaN)` pinta `0,00 €`, o sea que un cliente con deuda
   * ilegible se vería **idéntico a uno al corriente de pago**.
   */
  totalDueCents: number | null;
};

/**
 * Lo que **no** se lee de este `meta`, y por qué:
 *
 * - **`topItems`** (6160) apunta a `InvoiceItem`, que el generador emitió como
 *   `string[]` (3583): el contrato **no publica su forma**. Escribir esa tabla
 *   adivinando claves daría una tabla vacía para siempre sin que nadie se
 *   entere.
 * - **`recentInvoices`** (6131) y **`recentEstimates`** (6149) son proyecciones
 *   más pobres que sus recursos —`recentInvoices` no trae ni `due_date` ni
 *   `overdue`, así que desde ahí no se puede decir «vencida»— y ninguna declara
 *   cuántos elementos devuelve, así que tampoco se puede rotular «las últimas
 *   5». La ficha usa `listInvoices({customerId})` y `listEstimates({customerId})`,
 *   que sí traen el documento entero y su paginador.
 * - **`expenseTotals`** y **`netProfits`** no hablan del negocio **con este
 *   cliente**: gastos y beneficio son de la empresa. Ver el docblock de
 *   `PimiaCustomerVolume`, donde está anotada la duda que esto abre.
 */
function readMonths(chart: Record<string, unknown>): string[] {
  const months = chart.months;
  if (!Array.isArray(months)) {
    return [];
  }
  // Entera o nada, como el `records()` del panel: un eje al que le falten
  // etiquetas no es un eje corto, es un eje del que no sabemos qué le falta.
  return months.every((month) => typeof month === "string")
    ? (months as string[])
    : [];
}

/**
 * Las estadísticas de un cliente.
 *
 * ⚠️ **Va en su propia consulta, aparte de la ficha, y no al revés.** La
 * respuesta trae también el `CustomerResource` entero (6118), o sea que
 * *podría* sustituir a `GET /customers/{id}` y ahorrar una petición — pero el
 * contrato **no declara qué scope exige** este endpoint (sólo que puede
 * responder `403`, 6165), y su `meta` sirve facturas, gastos y recibos. Si
 * pidiera `reports:read` o `invoices:read`, **ninguno de los dos está en el
 * grant del escritorio**, y colgar la ficha entera de él dejaría al cliente sin
 * pantalla por unas cifras de adorno. Se pide aparte para que su `403` **degrade
 * el bloque, no la pantalla**, y la vista lee `error.missingScope` para decir
 * qué permiso pidió el servidor — que además zanja la duda en el primer arranque
 * contra un tenant vivo, sin adivinar nada.
 */
export async function getCustomerStats(
  customerId: string,
): Promise<PimiaCustomerStats> {
  const payload = await pimiaRequest<unknown>({
    path: `/customers/${encodeURIComponent(customerId)}/stats`,
  });

  const meta =
    typeof payload === "object" && payload !== null
      ? ((payload as { meta?: unknown }).meta ?? null)
      : null;
  const metaRecord =
    typeof meta === "object" && meta !== null
      ? (meta as Record<string, unknown>)
      : {};

  const chart = metaRecord.chartData;
  const chartRecord =
    typeof chart === "object" && chart !== null
      ? (chart as Record<string, unknown>)
      : {};

  const axis = readMonths(chartRecord);
  const invoiced = alignedColumn(chartRecord.invoiceTotals, axis.length);
  const received = alignedColumn(chartRecord.receiptTotals, axis.length);

  const activeCount = metaRecord.estimatesActiveCount;

  return {
    months: axis.map((ym, index) => ({
      ym,
      invoicedCents: invoiced ? readCents(invoiced[index]) : null,
      receivedCents: received ? readCents(received[index]) : null,
    })),
    invoicedAligned: invoiced !== null,
    receivedAligned: received !== null,
    estimatesActiveCount:
      typeof activeCount === "number" && Number.isFinite(activeCount)
        ? activeCount
        : null,
    totalDueCents: readCents(metaRecord.totalDueAmount),
  };
}
