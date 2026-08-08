/**
 * Clientes del ERP.
 *
 * La API devuelve casi todo como cadena (recursos de Laravel), así que aquí se
 * normaliza a un tipo con el que la UI pueda trabajar sin `??` por todas
 * partes. Los importes se dejan en **céntimos enteros** — ver `lib/money.ts`.
 */

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
  createdAt: string | null;
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
    createdAt: text(raw.created_at),
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
