/**
 * Facturas del ERP.
 *
 * Lo que una factura tiene y un presupuesto no, y condiciona toda la UI:
 *
 * 1. ⛔ **Un borrador NO tiene número.** `invoice_number` se asigna al
 *    **publicar** (`ChangeInvoiceStatusController`), que además registra la
 *    factura en VeriFactu/AEAT y descuenta stock. `invoiceNumber: null` es un
 *    estado normal, no un dato que falte.
 * 2. **Dos ejes de estado.** `status` (DRAFT → PUBLISHED → SENT → VIEWED →
 *    COMPLETED) dice dónde está el documento; `paid_status` (UNPAID →
 *    PARTIALLY_PAID → PAID) dice cuánto se ha cobrado. Son independientes y
 *    la API los filtra por claves distintas (`status` y `paid_status`).
 * 3. **`due_amount`** es lo pendiente de cobro, y `overdue` lo calcula el
 *    servidor (vencida y sin pagar del todo). Aquí no se recalcula ninguno.
 * 4. **`is_credit_note`**: las rectificativas viven en la misma tabla y salen
 *    en el mismo índice. Se señalan, no se esconden.
 * 5. **Un tercer eje: el estado en la AEAT** (`aeat_status`), que no es ni el
 *    del documento ni el del cobro. Con su prueba (`aeat_csv`, `hash`,
 *    `qr_data`) cuando la AEAT aceptó el registro.
 *
 * Los impuestos y las líneas tienen la misma forma de cable que en
 * presupuestos, así que se reutilizan sus tipos y su normalizador — un solo
 * sitio donde viven las trampas del IVA + IRPF.
 */

import {
  normalizeLine,
  normalizeTaxes,
  text,
  type PimiaEstimateLine,
  type PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import {
  pimiaRequest,
  derivePagination,
  PimiaApiError,
  readCompanyCount,
  readPagination,
  unwrapItem,
  unwrapList,
  type PimiaPagination,
} from "@/features/pimia/api/pimiaClient";
import { readCents } from "@/features/pimia/lib/money";

export const INVOICE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "SENT",
  "VIEWED",
  "COMPLETED",
] as const;

export type PimiaInvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_PAID_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;

export type PimiaInvoicePaidStatus = (typeof INVOICE_PAID_STATUSES)[number];

/**
 * El estado del registro en VeriFactu (AEAT), que es un eje aparte del estado
 * del documento y del cobro.
 *
 * La lista sale de los sitios que lo escriben en factSaas —
 * `ChangeInvoiceStatusController::registerInVeriFactu`, el job
 * `RetryVeriFactuRegistration` y lo que devuelve la API de VeriFactu — y es la
 * misma que usa el panel Vue (`helpers/invoice-status.js`).
 *
 * ⛔ **Dos de estos estados significan «no hay registro que tocar»**, y eso
 * decide qué acciones tienen sentido:
 *
 * - `pending` — el registro falló al publicar y el reintento **automático**
 *   está en marcha (`RetryVeriFactuRegistration`). No hay
 *   `verifactu_record_id`, así que sync y retry contestarían 422.
 * - `sandbox_only` — el plan del tenant no llega a producción; nunca se mandó.
 *
 * Y `error` es ambiguo a propósito del servidor: puede ser un registro que la
 * AEAT rechazó (existe, se puede reintentar) o los reintentos automáticos
 * agotados sin llegar a crearlo (no existe). Desde fuera no se distinguen: lo
 * dice el 422 de `/verifactu/detail`, y por eso la ficha lo sondea.
 */
export const INVOICE_AEAT_STATUSES = [
  "not_applicable",
  "queued",
  "pending",
  "sent",
  "accepted",
  "accepted_with_warnings",
  "rejected",
  "error",
  "annulled",
  "sandbox_only",
] as const;

export type PimiaInvoiceAeatStatus = (typeof INVOICE_AEAT_STATUSES)[number];

/** Los dos estados en los que hay algo que reintentar. */
export const AEAT_FAILURE_STATUSES: readonly string[] = ["rejected", "error"];

/**
 * ¿Tiene sentido enseñar el bloque VeriFactu? Igual que `hasAeatState` del
 * panel: no cuando la factura queda fuera del ámbito AEAT (un borrador sin
 * estado, o `not_applicable`).
 */
export function hasAeatState(status: string | null): boolean {
  return Boolean(status) && status !== "not_applicable";
}

/**
 * ¿El estado AEAT pide atención, o solo acompaña?
 *
 * Decide **dónde** va el bloque en la ficha: lo que va mal es lo más urgente de
 * la página y sube justo bajo la cabecera; lo que salió bien es prueba
 * documental y baja con el resto. Es el mismo criterio del panel, que reserva
 * el bloque tintado de arriba para el rechazo y el error.
 */
export function isAeatUrgent(status: string | null): boolean {
  return AEAT_FAILURE_STATUSES.includes(status ?? "") || status === "pending";
}

export type PimiaInvoice = {
  id: string;
  /** `null` hasta publicar: el número oficial se asigna entonces. */
  invoiceNumber: string | null;
  referenceNumber: string | null;
  status: PimiaInvoiceStatus | string;
  paidStatus: PimiaInvoicePaidStatus | string;
  /** Vencida y sin cobrar del todo. Lo dice el servidor, no se recalcula. */
  isOverdue: boolean;
  isCreditNote: boolean;
  invoiceDate: string | null;
  dueDate: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  taxes: PimiaEstimateTax[] | null;
  /** Solo en el detalle, y `null` es «no se pidieron», no «no tiene». */
  lines: PimiaEstimateLine[] | null;
  subTotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  /** Lo pendiente de cobro, en céntimos. */
  dueCents: number | null;
  /** Ruta pública por hash, como la del presupuesto: sin token ni scope. */
  pdfUrl: string | null;
  /** El eje AEAT. `null` en un borrador: aún no hay nada que registrar. */
  aeatStatus: PimiaInvoiceAeatStatus | string | null;
  /** El CSV que devuelve la AEAT al aceptar el registro. */
  aeatCsv: string | null;
  /** La huella encadenada del registro VeriFactu. */
  aeatHash: string | null;
  /** URL de verificación en la sede de la AEAT (el QR de la factura). */
  aeatQrUrl: string | null;
};

export type PimiaInvoicePage = {
  invoices: PimiaInvoice[];
  pagination: PimiaPagination | null;
  totalCount: number | null;
  companyTotalCount: number | null;
};

export const INVOICE_SORT_FIELDS = [
  "invoice_date",
  "due_date",
  "invoice_number",
  "status",
  "total",
] as const;

export type PimiaInvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

type RawInvoice = Record<string, unknown>;

function normalizeInvoice(raw: RawInvoice): PimiaInvoice {
  const customer = raw.customer as Record<string, unknown> | undefined;
  const items = raw.items;
  return {
    id: String(raw.id ?? ""),
    invoiceNumber: text(raw.invoice_number),
    referenceNumber: text(raw.reference_number),
    status: text(raw.status) ?? "DRAFT",
    paidStatus: text(raw.paid_status) ?? "UNPAID",
    isOverdue: raw.overdue === true,
    isCreditNote: raw.is_credit_note === true,
    invoiceDate: text(raw.invoice_date),
    dueDate: text(raw.due_date),
    customerId: raw.customer_id === undefined ? null : String(raw.customer_id),
    customerName: customer ? text(customer.name) : null,
    customerEmail: customer ? text(customer.email) : null,
    customerPhone: customer ? text(customer.phone) : null,
    notes: text(raw.notes),
    taxes: normalizeTaxes(raw.taxes),
    lines: Array.isArray(items)
      ? items.map((item) => normalizeLine(item as Record<string, unknown>))
      : null,
    subTotalCents: readCents(raw.sub_total),
    discountCents: readCents(raw.discount_val),
    taxCents: readCents(raw.tax),
    totalCents: readCents(raw.total),
    dueCents: readCents(raw.due_amount),
    pdfUrl: text(raw.invoice_pdf_url),
    aeatStatus: text(raw.aeat_status),
    aeatCsv: text(raw.aeat_csv),
    aeatHash: text(raw.hash),
    aeatQrUrl: text(raw.qr_data),
  };
}

export type ListInvoicesInput = {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  /**
   * Además de los cinco estados, `applyFilters` acepta aquí los virtuales
   * `DUE` y `OVERDUE` (pendientes de cobro / vencidas). Van por la MISMA clave
   * que el estado, así que no se pueden combinar con él.
   */
  status?: PimiaInvoiceStatus | "DUE" | "OVERDUE";
  /** Eje independiente del estado: sí se combina con `status`. */
  paidStatus?: PimiaInvoicePaidStatus;
  /** `YYYY-MM-DD`. La API exige las dos o ninguna. */
  fromDate?: string;
  toDate?: string;
  orderByField?: PimiaInvoiceSortField;
  orderBy?: "asc" | "desc";
};

export async function listInvoices(
  input: ListInvoicesInput = {},
): Promise<PimiaInvoicePage> {
  const hasRange = Boolean(input.fromDate && input.toDate);

  const payload = await pimiaRequest<unknown>({
    path: "/invoices",
    query: {
      page: input.page,
      limit: input.limit,
      search: input.search?.trim() || undefined,
      customer_id: input.customerId,
      status: input.status,
      paid_status: input.paidStatus,
      from_date: hasRange ? input.fromDate : undefined,
      to_date: hasRange ? input.toDate : undefined,
      orderByField: input.orderByField,
      orderBy: input.orderByField ? (input.orderBy ?? "desc") : undefined,
    },
  });

  const companyTotalCount = readCompanyCount(payload, "invoice_total_count");
  const pagination = derivePagination(
    readPagination(payload),
    companyTotalCount,
    input.page,
    input.limit,
  );

  return {
    invoices: unwrapList<RawInvoice>(payload).map(normalizeInvoice),
    pagination,
    totalCount: pagination?.total ?? companyTotalCount,
    companyTotalCount,
  };
}

export async function getInvoice(
  invoiceId: string,
): Promise<PimiaInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    path: `/invoices/${encodeURIComponent(invoiceId)}`,
  });
  const raw = unwrapItem<RawInvoice>(payload);
  return raw ? normalizeInvoice(raw) : null;
}

/**
 * Publica una factura borrador.
 *
 * ⛔ La acción irreversible de verdad: el servidor asigna el número oficial de
 * la serie, registra la factura en VeriFactu (AEAT) y descuenta stock. Solo
 * acepta borradores. Responde `{success, invoice_number, ...}` — se invalida y
 * se relee, no se siembra caché.
 */
export async function publishInvoice(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/status`,
    body: { status: "PUBLISHED" },
  });
}

/**
 * Marca una factura como enviada.
 *
 * ⚠️ Un borrador se **publica primero** (auto-publish del controlador): número
 * + AEAT. La UI tiene que avisarlo antes, no descubrirse después.
 */
export async function markInvoiceSent(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/status`,
    body: { status: "SENT" },
  });
}

export type PimiaInvoiceMail = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Manda la factura por correo. Mismo contrato que el presupuesto: `from` lo
 * pone la instancia y el que se mande se ignora (factSaas #314/#315). Enviar
 * un borrador también lo publica primero.
 */
export async function sendInvoice(
  invoiceId: string,
  mail: PimiaInvoiceMail,
): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/send`,
    body: {
      to: mail.to.trim(),
      subject: mail.subject.trim(),
      body: mail.body,
    },
  });
}

/** Duplica la factura en un borrador nuevo, sin número, con las mismas líneas. */
export async function cloneInvoice(
  invoiceId: string,
): Promise<PimiaInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/clone`,
  });
  const raw = unwrapItem<RawInvoice>(payload);
  return raw ? normalizeInvoice(raw) : null;
}

export type PimiaInvoicePaymentDraft = {
  invoiceId: string;
  customerId: string;
  /** Céntimos enteros, > 0. */
  amountCents: number;
  /** `YYYY-MM-DD`. */
  paymentDate: string;
};

/**
 * Registra el cobro (total o parcial) de una factura.
 *
 * Escribe en el dominio `payments` — exige `payments:write`. El
 * `payment_number` NO se manda: es opcional y lo genera el servidor con la
 * misma serie que `next-number`, así que no hay carrera que reintentar. El
 * servidor recalcula `due_amount` y `paid_status` de la factura.
 */
export async function recordInvoicePayment(
  draft: PimiaInvoicePaymentDraft,
): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: "/payments",
    body: {
      payment_date: draft.paymentDate,
      customer_id: draft.customerId,
      invoice_id: draft.invoiceId,
      amount: draft.amountCents,
    },
  });
}

/**
 * Crea la factura **rectificativa** de una factura emitida.
 *
 * Lo que hace el servidor (`Invoice::createCreditNote`), y que la UI tiene que
 * contar sin adornar: una **factura nueva** de la serie `R-` con su propio
 * número oficial —asignado ya, no al publicar—, las mismas líneas e impuestos
 * en **negativo**, `status: SENT` y `paid_status: PAID` con deuda cero, y un
 * enlace a la original (`rectified_invoice_id`, tipo AEAT `R1`). La original no
 * se toca.
 *
 * ⚠️ Se crea directamente como `SENT`, **sin pasar por la transición a
 * PUBLISHED**, que es la única que registra en VeriFactu — así que la
 * rectificativa nace sin `aeat_status`. Es cosa del ERP, no de aquí; esta capa
 * no lo disimula.
 *
 * El servidor rechaza con 422 en tres casos que la UI ya evita ofrecer
 * (rectificativa de rectificativa, de un borrador) más uno que **no puede
 * saber**: que la factura ya tenga la suya. Ese mensaje trae el número de la
 * que existe, así que se enseña tal cual.
 *
 * ⚖️ Sin cuota: emitir una rectificativa es una obligación, no una
 * funcionalidad de pago (la ruta va sin `enforce.plan`). Cuenta para el
 * contador del mes porque es una fila de `invoices`, pero nunca se bloquea.
 */
export async function createCreditNote(
  invoiceId: string,
): Promise<PimiaInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/credit-note`,
  });
  const raw = unwrapItem<RawInvoice>(payload);
  return raw ? normalizeInvoice(raw) : null;
}

/**
 * El detalle remoto del registro VeriFactu: lo que la AEAT contestó.
 *
 * No sale de la fila de la factura sino de la API de VeriFactu, a la que el ERP
 * hace de proxy. Solo interesa cuando algo falló —es donde vive el motivo— y
 * por eso la ficha lo pide únicamente entonces, igual que el panel.
 *
 * ⛔ Contesta **422 «Invoice not registered in VeriFactu»** cuando la factura no
 * tiene `verifactu_record_id`. Eso no es un fallo de la llamada: es el único
 * modo de distinguir un registro que la AEAT rechazó (existe, se reintenta) de
 * uno que nunca llegó a crearse (no hay nada que reintentar). Se devuelve como
 * dato, no como excepción.
 */
export type PimiaInvoiceVeriFactu = {
  /** La respuesta de la AEAT, aplanada a texto: llega como cadena u objeto. */
  aeatResponse: string | null;
  /** `false` si el 422 dijo que la factura no está registrada. */
  isRegistered: boolean;
};

export async function getInvoiceVeriFactu(
  invoiceId: string,
): Promise<PimiaInvoiceVeriFactu> {
  try {
    const payload = await pimiaRequest<unknown>({
      path: `/invoices/${encodeURIComponent(invoiceId)}/verifactu/detail`,
    });
    const raw = unwrapItem<Record<string, unknown>>(payload);
    const response = raw?.aeat_response;
    return {
      aeatResponse:
        response === undefined || response === null
          ? null
          : typeof response === "string"
            ? response
            : JSON.stringify(response, null, 2),
      isRegistered: true,
    };
  } catch (error) {
    if (
      error instanceof PimiaApiError &&
      error.status === 422 &&
      /not registered/i.test(error.message)
    ) {
      return { aeatResponse: null, isRegistered: false };
    }
    throw error;
  }
}

/**
 * Relee el estado del registro desde VeriFactu y lo guarda en la factura.
 *
 * No cambia nada en la AEAT: trae lo que ya hay. Sirve cuando el registro está
 * en vuelo (`queued`, `sent`) o cuando se quiere confirmar que un rechazo sigue
 * siéndolo. Exige `invoices:write` porque escribe la fila local.
 */
export async function syncInvoiceVeriFactu(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/verifactu/sync`,
  });
}

/**
 * Vuelve a mandar a la AEAT un registro que falló, y sincroniza el estado
 * después (lo hace el propio controlador).
 *
 * Solo tiene sentido sobre un registro que existe: sin `verifactu_record_id`
 * contesta 422. La ficha lo sondea antes de ofrecerlo.
 */
export async function retryInvoiceVeriFactu(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/verifactu/retry`,
  });
}
