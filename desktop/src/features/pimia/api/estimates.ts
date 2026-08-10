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

/**
 * Un impuesto aplicado, con su nombre y su tipo.
 *
 * Importa que vayan uno a uno y no sumados: en España un presupuesto lleva a
 * la vez IVA y **retención de IRPF**, que es negativa. Sumarlos da un neto
 * («impuestos: 150 €») que esconde los 525 de IVA y los −375 de retención, y
 * la retención es justo lo que un autónomo mira.
 */
export type PimiaEstimateTax = {
  id: string;
  name: string;
  /** Porcentaje; negativo en las retenciones. `null` si es de importe fijo. */
  percent: number | null;
  amountCents: number | null;
};

/** Una línea del presupuesto. Los importes, en céntimos enteros. */
export type PimiaEstimateLine = {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  unitName: string | null;
  priceCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  /** Los impuestos de la línea, cuando el documento los lleva por línea. */
  taxes: PimiaEstimateTax[] | null;
};

export type PimiaEstimate = {
  id: string;
  estimateNumber: string;
  referenceNumber: string | null;
  status: PimiaEstimateStatus | string;
  estimateDate: string | null;
  expiryDate: string | null;
  customerId: string | null;
  customerName: string | null;
  /**
   * En el detalle siempre; en el índice, desde que la vista ligera
   * (`view=summary`) manda customer {id, name, email, phone}. Antes el índice
   * traía del cliente nada más el nombre, y el diálogo de envío solo podía
   * prefijar el destinatario desde la ficha.
   */
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  /** Los impuestos de la cabecera, desglosados. */
  taxes: PimiaEstimateTax[] | null;
  /**
   * Las líneas solo vienen en el detalle (`show`), y solo si las hay: el
   * recurso las envuelve en un `when(...)`. `null` es «no se pidieron», que no
   * es lo mismo que `[]`, «no tiene».
   */
  lines: PimiaEstimateLine[] | null;
  /** Todos en céntimos enteros. */
  subTotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  /**
   * El PDF, tal como lo publica el servidor (`estimate_pdf_url`).
   *
   * Es una ruta **pública** del tenant por `unique_hash`
   * (`/estimates/pdf/{hash}`, `routes/tenant.php`), no de `/api/v1`: se abre en
   * el navegador del sistema y no lleva token ni scope. Por eso el PDF es la
   * única acción de documento que funciona con cualquier grant.
   */
  pdfUrl: string | null;
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

export function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** La cantidad puede venir como número o como cadena, y puede ser decimal. */
function readQuantity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** El porcentaje llega como número o cadena; puede ser negativo (retención). */
function readPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeTaxes(value: unknown): PimiaEstimateTax[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.map((entry) => {
    const raw = entry as Record<string, unknown>;
    return {
      id: String(raw.id ?? ""),
      name: text(raw.name) ?? "Impuesto",
      percent: readPercent(raw.percent),
      amountCents: readCents(raw.amount),
    };
  });
}

export function normalizeLine(raw: Record<string, unknown>): PimiaEstimateLine {
  return {
    id: String(raw.id ?? ""),
    name: text(raw.name) ?? "(sin concepto)",
    description: text(raw.description),
    quantity: readQuantity(raw.quantity),
    unitName: text(raw.unit_name),
    priceCents: readCents(raw.price),
    discountCents: readCents(raw.discount_val),
    taxCents: readCents(raw.tax),
    totalCents: readCents(raw.total),
    taxes: normalizeTaxes(raw.taxes),
  };
}

function normalizeEstimate(raw: RawEstimate): PimiaEstimate {
  const customer = raw.customer as Record<string, unknown> | undefined;
  const items = raw.items;
  return {
    id: String(raw.id ?? ""),
    estimateNumber: text(raw.estimate_number) ?? "(sin número)",
    referenceNumber: text(raw.reference_number),
    status: text(raw.status) ?? "DRAFT",
    estimateDate: text(raw.estimate_date),
    expiryDate: text(raw.expiry_date),
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
    pdfUrl: text(raw.estimate_pdf_url),
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
      // Opt-in a la vista ligera del índice (`view=summary`, factSaas): la
      // cabecera, customer {id, name, email, phone} y el PDF — sin items,
      // taxes ni notes, que solo los usa la ficha (`getEstimate`). Baja la
      // página de ~550-740 KB a ~13 KB. Un servidor que aún no conoce el
      // parámetro lo ignora y responde la vista completa, así que este
      // opt-in puede desplegarse por delante de la plataforma.
      view: "summary",
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

/**
 * Los estados a los que esta pantalla deja mover un presupuesto.
 *
 * `POST /estimates/{id}/status` acepta los seis, pero solo tres los decide una
 * persona: «lo mandé por fuera», «el cliente dijo que sí», «dijo que no». Los
 * otros tres son hechos que el sistema ya sabe y ofrecerlos sería dejar mentir
 * sobre ellos:
 *
 * - `VIEWED` lo pone el cliente al abrir el enlace del presupuesto.
 * - `EXPIRED` lo dicta la fecha de vencimiento.
 * - `DRAFT` sería deshacer un envío que ya salió.
 */
export const ESTIMATE_MANUAL_STATUSES = [
  "SENT",
  "ACCEPTED",
  "REJECTED",
] as const;

export type PimiaEstimateManualStatus =
  (typeof ESTIMATE_MANUAL_STATUSES)[number];

/**
 * Cambia el estado de un presupuesto.
 *
 * ⚠️ La respuesta es `{success: true}`, **no el presupuesto actualizado**
 * (`ChangeEstimateStatusController`). No hay nada que normalizar: quien llame
 * tiene que invalidar la caché para volver a leerlo.
 */
export async function changeEstimateStatus(
  estimateId: string,
  status: PimiaEstimateManualStatus,
): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/estimates/${encodeURIComponent(estimateId)}/status`,
    body: { status },
  });
}

/**
 * Duplica un presupuesto y devuelve el nuevo.
 *
 * El servidor hace todo el trabajo: reserva el siguiente número de la serie,
 * copia líneas, impuestos y campos propios, y lo deja en `DRAFT` con la fecha
 * de hoy. Aquí no se construye ningún cuerpo — mandar uno sería adivinar la
 * numeración, que es justo lo que `createEstimate` tiene que reintentar.
 */
export async function cloneEstimate(
  estimateId: string,
): Promise<PimiaEstimate | null> {
  const payload = await pimiaRequest<unknown>({
    method: "POST",
    path: `/estimates/${encodeURIComponent(estimateId)}/clone`,
  });
  const raw = unwrapItem<RawEstimate>(payload);
  return raw ? normalizeEstimate(raw) : null;
}

/** Lo que hay que decirle al servidor para mandar un presupuesto. */
export type PimiaEstimateMail = {
  /** Destinatario. Sin él el servidor no tiene a quién mandarlo. */
  to: string;
  subject: string;
  /** HTML, con los marcadores que el servidor sustituye al enviar. */
  body: string;
};

/**
 * Manda el presupuesto por correo al cliente.
 *
 * ⚠️ **Sale hacia fuera y no se deshace.** El servidor pasa el documento a
 * `SENT` si estaba en borrador y **encola** el correo
 * (`App\Jobs\SendDocumentMail`), así que un 200 aquí significa «aceptado para
 * enviar», no «entregado».
 *
 * ⛔ **`from` no se manda.** El remitente es del tenant y lo pone el servidor
 * (`SendDocumentMailRequest`, factSaas #314/#315): el que mandara un cliente se
 * **ignora**, porque respetarlo dejaba mandar correo desde cualquier dirección
 * por el SMTP de la empresa. Añadirlo aquí no rompería nada, pero sería código
 * que promete algo que el servidor no cumple.
 */
export async function sendEstimate(
  estimateId: string,
  mail: PimiaEstimateMail,
): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/estimates/${encodeURIComponent(estimateId)}/send`,
    body: {
      to: mail.to.trim(),
      subject: mail.subject.trim(),
      body: mail.body,
    },
  });
}

/**
 * La factura que sale de convertir un presupuesto.
 *
 * `invoiceNumber` es `null` casi siempre y **no es un fallo de la respuesta**:
 * `ConvertEstimateController` crea la factura en `DRAFT` y deja el número, el
 * `sequence_number` y el `unique_hash` sin asignar hasta que se publica. Numerar
 * un borrador quemaría un número de la serie oficial y abriría un hueco si se
 * vuelve a convertir. Así que no se promete un número que todavía no existe.
 */
export type PimiaConvertedInvoice = {
  id: string;
  invoiceNumber: string | null;
  status: string | null;
};

/**
 * Convierte un presupuesto en una factura borrador.
 *
 * ⛔ Es la única acción de esta pantalla que escribe en **otro dominio**, y el
 * guard de la API lo sabe: además de `estimates:write` exige `invoices:write`
 * (`config/api_guard.php`, `cross_domain_writes`). Un grant sin ese permiso se
 * lleva un 403 `forbidden`, que es lo que la ficha traduce a «vuelve a
 * autorizar».
 */
export async function convertEstimateToInvoice(
  estimateId: string,
): Promise<PimiaConvertedInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    method: "POST",
    path: `/estimates/${encodeURIComponent(estimateId)}/convert-to-invoice`,
  });
  const raw = unwrapItem<Record<string, unknown>>(payload);
  if (!raw) {
    return null;
  }
  return {
    id: String(raw.id ?? ""),
    invoiceNumber: text(raw.invoice_number),
    status: text(raw.status),
  };
}
