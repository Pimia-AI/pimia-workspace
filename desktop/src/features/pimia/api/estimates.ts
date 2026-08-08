/**
 * Presupuestos del ERP.
 *
 * Dos trampas de la API viven resueltas aquí y en ningún otro sitio:
 *
 * 1. **La numeración la pone Pimia** (`GET /next-number?key=estimate`) pero hay
 *    que mandarla al crear, y hay carrera: dos altas a la vez piden el mismo
 *    número y la segunda se lleva un 422. Se pide justo antes y se reintenta.
 * 2. **Bug conocido del servidor**: si una línea no lleva `discount`,
 *    `discount_type` y `discount_val`, responde **500 en vez de 422**. Se
 *    mandan siempre, aunque no haya descuento.
 *
 * Y la regla de fondo: **los importes son céntimos enteros**.
 */

import {
  PimiaApiError,
  pimiaRequest,
  derivePagination,
  readCompanyCount,
  readPagination,
  unwrapItem,
  unwrapList,
  type PimiaPagination,
} from "@/features/pimia/api/pimiaClient";
import { readCents } from "@/features/pimia/lib/money";

export const ESTIMATE_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;

export type PimiaEstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export type PimiaEstimate = {
  id: string;
  estimateNumber: string;
  status: PimiaEstimateStatus | string;
  estimateDate: string | null;
  expiryDate: string | null;
  customerId: string | null;
  customerName: string | null;
  /** Todos en céntimos enteros. */
  subTotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
};

export type PimiaEstimatePage = {
  estimates: PimiaEstimate[];
  pagination: PimiaPagination | null;
  /** Los que casan con el filtro actual: el `total` del paginador. */
  totalCount: number | null;
  /** Todos los del tenant, ignorando el filtro. Ver `readCompanyCount`. */
  companyTotalCount: number | null;
};

/** Campos por los que el índice sabe ordenar (`orderByField` de la API). */
export const ESTIMATE_SORT_FIELDS = [
  "estimate_date",
  "expiry_date",
  "estimate_number",
  "status",
  "total",
] as const;

export type PimiaEstimateSortField = (typeof ESTIMATE_SORT_FIELDS)[number];

type RawEstimate = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeEstimate(raw: RawEstimate): PimiaEstimate {
  const customer = raw.customer as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    estimateNumber: text(raw.estimate_number) ?? "(sin número)",
    status: text(raw.status) ?? "DRAFT",
    estimateDate: text(raw.estimate_date),
    expiryDate: text(raw.expiry_date),
    customerId: raw.customer_id === undefined ? null : String(raw.customer_id),
    customerName: customer ? text(customer.name) : null,
    subTotalCents: readCents(raw.sub_total),
    taxCents: readCents(raw.tax),
    totalCents: readCents(raw.total),
  };
}

export type ListEstimatesInput = {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  status?: PimiaEstimateStatus;
  /** `YYYY-MM-DD`. La API exige las dos o ninguna. */
  fromDate?: string;
  toDate?: string;
  orderByField?: PimiaEstimateSortField;
  orderBy?: "asc" | "desc";
};

export async function listEstimates(
  input: ListEstimatesInput = {},
): Promise<PimiaEstimatePage> {
  // `from_date`/`to_date` van juntas o no van: el servidor solo entra en el
  // filtro de rango si tiene las dos, y con una sola las ignoraría en silencio.
  const hasRange = Boolean(input.fromDate && input.toDate);

  const payload = await pimiaRequest<unknown>({
    path: "/estimates",
    query: {
      page: input.page,
      limit: input.limit,
      search: input.search?.trim() || undefined,
      customer_id: input.customerId,
      status: input.status,
      from_date: hasRange ? input.fromDate : undefined,
      to_date: hasRange ? input.toDate : undefined,
      orderByField: input.orderByField,
      orderBy: input.orderByField ? (input.orderBy ?? "desc") : undefined,
    },
  });

  const companyTotalCount = readCompanyCount(payload, "estimate_total_count");
  const pagination = derivePagination(
    readPagination(payload),
    companyTotalCount,
    input.page,
    input.limit,
  );

  return {
    estimates: unwrapList<RawEstimate>(payload).map(normalizeEstimate),
    pagination,
    totalCount: pagination?.total ?? companyTotalCount,
    companyTotalCount,
  };
}

export async function getEstimate(
  estimateId: string,
): Promise<PimiaEstimate | null> {
  const payload = await pimiaRequest<unknown>({
    path: `/estimates/${encodeURIComponent(estimateId)}`,
  });
  const raw = unwrapItem<RawEstimate>(payload);
  return raw ? normalizeEstimate(raw) : null;
}

/**
 * El siguiente número que Pimia reserva para un presupuesto.
 *
 * La respuesta no está documentada en el OpenAPI y cada versión la envuelve de
 * una forma; se aceptan las que se han visto en vez de cablear una sola.
 */
export async function fetchNextEstimateNumber(): Promise<string | null> {
  const payload = await pimiaRequest<unknown>({
    path: "/next-number",
    query: { key: "estimate" },
  });

  if (typeof payload === "string") {
    return payload;
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const candidates = [
    source.nextNumber,
    source.next_number,
    source.estimate_number,
    (source.data as Record<string, unknown> | undefined)?.nextNumber,
    (source.data as Record<string, unknown> | undefined)?.next_number,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }
  return null;
}

export type PimiaEstimateDraftLine = {
  name: string;
  description?: string;
  quantity: number;
  /** Precio unitario en céntimos enteros. */
  priceCents: number;
};

export type PimiaEstimateDraft = {
  customerId: string;
  /** `YYYY-MM-DD`. */
  estimateDate: string;
  expiryDate: string;
  notes?: string;
  items: PimiaEstimateDraftLine[];
};

/** Total de una línea, en céntimos. Sin floats: `quantity` puede ser decimal. */
export function lineTotalCents(line: PimiaEstimateDraftLine): number {
  return Math.round(line.priceCents * line.quantity);
}

export function draftSubtotalCents(draft: PimiaEstimateDraft): number {
  return draft.items.reduce((total, line) => total + lineTotalCents(line), 0);
}

/**
 * Construye el cuerpo del alta.
 *
 * `discount`, `discount_type` y `discount_val` van **siempre** —en la cabecera
 * y en cada línea— aunque valgan cero: sin ellos el servidor responde 500 en
 * vez de 422 (bug conocido, documentado en el handoff del SDK).
 */
export function buildEstimatePayload(
  draft: PimiaEstimateDraft,
  estimateNumber: string,
): Record<string, unknown> {
  const subTotal = draftSubtotalCents(draft);

  return {
    customer_id: draft.customerId,
    estimate_date: draft.estimateDate,
    expiry_date: draft.expiryDate,
    estimate_number: estimateNumber,
    status: "DRAFT",
    notes: draft.notes ?? "",
    tax_per_item: "NO",
    discount_per_item: "NO",
    discount: 0,
    discount_type: "fixed",
    discount_val: 0,
    sub_total: subTotal,
    tax: 0,
    total: subTotal,
    items: draft.items.map((line) => ({
      name: line.name,
      description: line.description ?? "",
      quantity: line.quantity,
      price: line.priceCents,
      discount: 0,
      discount_type: "fixed",
      discount_val: 0,
      tax: 0,
      total: lineTotalCents(line),
    })),
  };
}

/** Cuántas veces se reintenta cuando otro se lleva el número por delante. */
const NUMBER_RACE_RETRIES = 3;

/**
 * Da de alta un presupuesto pidiendo el número justo antes.
 *
 * Un 422 tras pedir el número es, casi siempre, la carrera de numeración: otro
 * usuario (o el propio panel) se lo llevó entre la petición y el alta. Se
 * vuelve a pedir y se reintenta; si el 422 persiste, el error sube tal cual
 * porque entonces es del formulario.
 */
export async function createEstimate(
  draft: PimiaEstimateDraft,
): Promise<PimiaEstimate | null> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < NUMBER_RACE_RETRIES; attempt += 1) {
    const estimateNumber = await fetchNextEstimateNumber();
    if (!estimateNumber) {
      throw new PimiaApiError(
        "server",
        "Pimia no devolvió el siguiente número de presupuesto",
      );
    }

    try {
      const payload = await pimiaRequest<unknown>({
        method: "POST",
        path: "/estimates",
        body: buildEstimatePayload(draft, estimateNumber),
      });
      const raw = unwrapItem<RawEstimate>(payload);
      return raw ? normalizeEstimate(raw) : null;
    } catch (error) {
      lastError = error;
      const isNumberRace =
        error instanceof PimiaApiError &&
        error.kind === "validation" &&
        /n[úu]mero|number/i.test(error.message);
      if (!isNumberRace) {
        throw error;
      }
    }
  }

  throw lastError;
}
