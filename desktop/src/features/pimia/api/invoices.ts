/**
 * Facturas del ERP. Solo lectura por ahora: la réplica sigue el mismo orden que
 * presupuestos — primero las pantallas, las acciones en su propio pase.
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
