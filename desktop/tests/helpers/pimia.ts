/**
 * El ERP de Pimia bajo el mock bridge.
 *
 * El bridge de e2e de Buzz no conoce los comandos `pimia_*` —lanza
 * «Unsupported mocked Tauri command»—, así que las pantallas del ERP salían
 * siempre en «sin conectar» y no había forma de mirarlas. Esto envuelve
 * `__TAURI_INTERNALS__.invoke` para responder a los tres comandos que la UI
 * usa (`pimia_auth_status`, `pimia_connect_phase`, `pimia_api_request`) y
 * delega todo lo demás en el mock de Buzz.
 *
 * ⚠️ Hay que llamarlo **antes** de `installMockBridge`: los scripts de
 * inicialización corren en orden de registro, y el envoltorio necesita estar
 * puesto para que la asignación de `mockIPC` caiga en su `set`.
 *
 * Los datos son de una empresa de reformas, que es el sector del tenant de
 * pruebas: importes en **céntimos enteros** y campos en `snake_case`, tal como
 * los devuelve la API.
 */

import type { Page } from "@playwright/test";

export const PIMIA_MOCK_TENANT = {
  id: "tenant-reformas-vera",
  baseUrl: "https://reformas-vera.taskai.work",
  label: "reformas-vera.taskai.work",
  scopes: ["customers:read", "estimates:read", "estimates:write", "items:read"],
  connectedAt: 1_770_000_000_000,
  expiresAt: 1_770_003_600_000,
  hasRefreshToken: true,
} as const;

type RawCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  contact_name: string | null;
  tax_id: string | null;
  due_amount: number;
  created_at: string;
};

type RawEstimate = {
  id: string;
  estimate_number: string;
  status: string;
  estimate_date: string;
  expiry_date: string;
  customer_id: string;
  customer: { id: string; name: string };
  sub_total: number;
  tax: number;
  total: number;
};

const CUSTOMERS: RawCustomer[] = [
  {
    id: "1",
    name: "Construcciones Peñalba S.L.",
    email: "administracion@penalba.es",
    phone: "961 24 88 10",
    company_name: "Construcciones Peñalba S.L.",
    contact_name: "Rosa Peñalba",
    tax_id: "B96842517",
    due_amount: 1_284_500,
    created_at: "2025-11-04",
  },
  {
    id: "2",
    name: "Marta Ibáñez Ruiz",
    email: "marta.ibanez@gmail.com",
    phone: "622 41 09 77",
    company_name: null,
    contact_name: null,
    tax_id: "52341987K",
    due_amount: 0,
    created_at: "2026-01-19",
  },
  {
    id: "3",
    name: "Hostelería del Turia S.A.",
    email: "compras@hosteleriaturia.com",
    phone: "963 55 12 40",
    company_name: "Hostelería del Turia S.A.",
    contact_name: "Álvaro Sanchís",
    tax_id: "A46127893",
    due_amount: 452_000,
    created_at: "2025-06-30",
  },
  {
    id: "4",
    name: "Comunidad de Propietarios Gran Vía 42",
    email: "presidencia@granvia42.es",
    phone: "960 10 22 33",
    company_name: "C.P. Gran Vía 42",
    contact_name: "Julián Ortega",
    tax_id: "H98213456",
    due_amount: 289_900,
    created_at: "2025-09-12",
  },
  {
    id: "5",
    name: "Clínica Dental Sorolla",
    email: "info@dentalsorolla.es",
    phone: "963 92 04 18",
    company_name: "Dental Sorolla S.L.P.",
    contact_name: "Nuria Bellver",
    tax_id: "B97654321",
    due_amount: 0,
    created_at: "2026-02-02",
  },
  {
    id: "6",
    name: "Panadería El Horno de Ruzafa",
    email: "elhorno@ruzafa.es",
    phone: "651 33 70 12",
    company_name: null,
    contact_name: "Toni Bru",
    tax_id: "24817365P",
    due_amount: 76_450,
    created_at: "2025-12-21",
  },
  {
    id: "7",
    name: "Inmobiliaria Cabanyal 21",
    email: "gestion@cabanyal21.com",
    phone: "962 08 45 60",
    company_name: "Cabanyal 21 Gestión S.L.",
    contact_name: "Elena Roig",
    tax_id: "B12984730",
    due_amount: 1_950_000,
    created_at: "2025-04-08",
  },
  {
    id: "8",
    name: "Javier Montalbán Sáez",
    email: "j.montalban@correo.es",
    phone: "699 12 44 05",
    company_name: null,
    contact_name: null,
    tax_id: "73129845X",
    due_amount: 34_000,
    created_at: "2026-03-15",
  },
];

const ESTIMATES: RawEstimate[] = [
  estimate("133", "PRE-000133", "DRAFT", "2026-08-08", "2026-09-07", "1", 0),
  // El total sale de sus líneas (16.440 € de base × 1,06), que es el único que
  // tiene ficha: así la tabla de líneas, el desglose y el total concuerdan.
  estimate(
    "132",
    "PRE-000132",
    "SENT",
    "2026-08-05",
    "2026-09-04",
    "7",
    1_742_640,
  ),
  estimate(
    "131",
    "PRE-000131",
    "VIEWED",
    "2026-08-03",
    "2026-09-02",
    "3",
    452_000,
  ),
  estimate(
    "130",
    "PRE-000130",
    "ACCEPTED",
    "2026-07-28",
    "2026-08-27",
    "1",
    1_284_500,
  ),
  estimate(
    "129",
    "PRE-000129",
    "SENT",
    "2026-07-24",
    "2026-08-23",
    "4",
    289_900,
  ),
  estimate(
    "128",
    "PRE-000128",
    "REJECTED",
    "2026-07-19",
    "2026-08-18",
    "5",
    118_250,
  ),
  estimate(
    "127",
    "PRE-000127",
    "ACCEPTED",
    "2026-07-11",
    "2026-08-10",
    "6",
    76_450,
  ),
  estimate(
    "126",
    "PRE-000126",
    "EXPIRED",
    "2026-06-02",
    "2026-07-02",
    "2",
    240_000,
  ),
  estimate(
    "125",
    "PRE-000125",
    "ACCEPTED",
    "2026-05-27",
    "2026-06-26",
    "8",
    34_000,
  ),
  estimate(
    "124",
    "PRE-000124",
    "VIEWED",
    "2026-05-14",
    "2026-06-13",
    "3",
    865_300,
  ),
  estimate(
    "123",
    "PRE-000123",
    "DRAFT",
    "2026-05-04",
    "2026-06-03",
    "7",
    1_120_000,
  ),
  estimate(
    "122",
    "PRE-000122",
    "ACCEPTED",
    "2026-04-21",
    "2026-05-21",
    "1",
    58_900,
  ),
];

function estimate(
  id: string,
  estimateNumber: string,
  status: string,
  estimateDate: string,
  expiryDate: string,
  customerId: string,
  total: number,
): RawEstimate {
  const customer = CUSTOMERS.find((candidate) => candidate.id === customerId);
  // Un presupuesto español lleva IVA del 21 % y retención de IRPF del 15 %, o
  // sea que el total es la base × 1,06. Se deriva así para que la aritmética
  // del mock cuadre con la que la ficha va a pintar: base + IVA − IRPF = total.
  const subTotal = Math.round(total / 1.06);
  const vat = Math.round(subTotal * 0.21);
  const withholding = -Math.round(subTotal * 0.15);
  return {
    id,
    estimate_number: estimateNumber,
    status,
    estimate_date: estimateDate,
    expiry_date: expiryDate,
    customer_id: customerId,
    customer: { id: customerId, name: customer?.name ?? "—" },
    sub_total: subTotal,
    tax: vat + withholding,
    total,
  };
}

type RawLine = {
  name: string;
  description: string | null;
  quantity: number;
  unit_name: string | null;
  price: number;
  discount_val: number;
  tax: number;
  total: number;
};

/**
 * Las líneas de los presupuestos que tienen ficha. Solo hacen falta las de los
 * que el spec de capturas abre; el resto sale con «sin líneas», que también es
 * un estado que conviene tener retratado.
 */
const LINES: Record<string, RawLine[]> = {
  "132": [
    {
      name: "Rehabilitación de fachada",
      description: "Saneado, mallado y mortero monocapa. 240 m².",
      quantity: 240,
      unit_name: "m²",
      price: 5_400,
      discount_val: 0,
      tax: 272_160,
      total: 1_296_000,
    },
    {
      name: "Montaje y desmontaje de andamio",
      description: "Homologado, incluye lonas y red de protección.",
      quantity: 1,
      unit_name: null,
      price: 285_000,
      discount_val: 0,
      tax: 59_850,
      total: 285_000,
    },
    {
      name: "Gestión de residuos",
      description: null,
      quantity: 3,
      unit_name: "contenedor",
      price: 21_000,
      discount_val: 0,
      tax: 13_230,
      total: 63_000,
    },
  ],
};

export type PimiaMockOptions = {
  /** Sin tenant conectado: la pantalla de bienvenida del ERP. */
  disconnected?: boolean;
  /** Listas vacías: para mirar los estados de vacío. */
  empty?: boolean;
};

/**
 * Instala el mock del ERP. Llamar **antes** de `installMockBridge`.
 */
export async function installPimiaMock(
  page: Page,
  options: PimiaMockOptions = {},
) {
  await page.addInitScript(
    ({ customers, estimates, lines: LINES, opts, tenant }) => {
      const status = opts.disconnected
        ? { tenants: [], activeTenantId: null }
        : { tenants: [tenant], activeTenantId: tenant.id };
      const allCustomers = opts.empty ? [] : customers;
      const allEstimates = opts.empty ? [] : estimates;

      /**
       * Igual que responde Pimia, con su trampa incluida: el `meta` lleva a la
       * vez el total del **paginador** (que sí filtra) y el
       * `<recurso>_total_count` del controlador, que es el de la empresa
       * entera e ignora los filtros. Si el mock no reprodujese esa diferencia,
       * el pie de la lista podría mentir en producción y salir bien aquí.
       */
      const listPayload = (
        rows: unknown[],
        allRows: unknown[],
        totalKey: string,
        query: Record<string, unknown>,
      ) => {
        const limit = Number(query.limit ?? rows.length) || rows.length || 1;
        const currentPage = Number(query.page ?? 1) || 1;
        const start = (currentPage - 1) * limit;
        return {
          data: rows.slice(start, start + limit),
          meta: {
            current_page: currentPage,
            last_page: Math.max(1, Math.ceil(rows.length / limit)),
            total: rows.length,
            [totalKey]: allRows.length,
          },
        };
      };

      const compare = (a: unknown, b: unknown) =>
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a ?? "").localeCompare(String(b ?? ""));

      const handle = (path: string, query: Record<string, unknown>) => {
        const clean = path.replace(/^\/api\/v1/, "");

        if (clean === "/customers") {
          const search = String(query.search ?? "")
            .trim()
            .toLowerCase();
          const rows = search
            ? allCustomers.filter((customer) =>
                `${customer.name} ${customer.email ?? ""}`
                  .toLowerCase()
                  .includes(search),
              )
            : allCustomers;
          return listPayload(rows, allCustomers, "customer_total_count", query);
        }

        if (clean.startsWith("/customers/")) {
          const id = decodeURIComponent(clean.slice("/customers/".length));
          const found = allCustomers.find((customer) => customer.id === id);
          return found ? { data: found } : null;
        }

        if (clean === "/estimates") {
          const search = String(query.search ?? "")
            .trim()
            .toLowerCase();
          let rows = allEstimates;
          if (query.customer_id) {
            rows = rows.filter(
              (row) => row.customer_id === String(query.customer_id),
            );
          }
          if (query.status) {
            rows = rows.filter((row) => row.status === String(query.status));
          }
          if (search) {
            rows = rows.filter((row) =>
              `${row.estimate_number} ${row.customer.name}`
                .toLowerCase()
                .includes(search),
            );
          }
          // El servidor solo entra en el rango si tiene las dos fechas.
          if (query.from_date && query.to_date) {
            const from = String(query.from_date);
            const to = String(query.to_date);
            rows = rows.filter(
              (row) => row.estimate_date >= from && row.estimate_date <= to,
            );
          }
          if (query.orderByField) {
            const field = String(query.orderByField);
            const direction =
              String(query.orderBy ?? "desc") === "asc" ? 1 : -1;
            rows = [...rows].sort(
              (a, b) =>
                direction *
                compare(
                  (a as Record<string, unknown>)[field],
                  (b as Record<string, unknown>)[field],
                ),
            );
          }
          return listPayload(rows, allEstimates, "estimate_total_count", query);
        }

        if (clean.startsWith("/estimates/")) {
          const id = decodeURIComponent(clean.slice("/estimates/".length));
          const found = allEstimates.find((estimate) => estimate.id === id);
          if (!found) {
            return null;
          }
          // El `show` trae lo que el índice no: líneas, notas, los impuestos
          // desglosados y el cliente entero (con email y teléfono).
          const owner = allCustomers.find(
            (candidate) => candidate.id === found.customer_id,
          );
          const vat = Math.round(found.sub_total * 0.21);
          const withholding = -Math.round(found.sub_total * 0.15);
          return {
            data: {
              ...found,
              reference_number: `OBRA-${found.id}`,
              notes:
                "Precios válidos salvo variación del coste de materiales. No incluye licencias ni tasas municipales.",
              customer: owner ?? found.customer,
              // Como el tenant real: **sin** impuestos de cabecera (van por
              // línea) y con el tipo YA dentro del nombre. Las dos cosas
              // rompieron la ficha en producción mientras el mock, que las
              // ponía «bien», la daba por buena.
              items: (LINES[found.id] ?? []).map((line, index) => ({
                ...line,
                id: `${found.id}-${index + 1}`,
                estimate_id: found.id,
                taxes: [
                  {
                    id: `${found.id}-${index + 1}-iva`,
                    name: "IVA 21%",
                    percent: 21,
                    amount: Math.round(line.total * 0.21),
                  },
                  {
                    id: `${found.id}-${index + 1}-irpf`,
                    name: "IRPF -15%",
                    percent: -15,
                    amount: -Math.round(line.total * 0.15),
                  },
                ],
              })),
            },
          };
        }

        if (clean === "/next-number") {
          return { next_number: "PRE-000134" };
        }

        return { data: [] };
      };

      window.__TAURI_INTERNALS__ ??= {};
      const internals = window.__TAURI_INTERNALS__ as Record<
        string,
        unknown
      > & {
        __pimiaMock__?: boolean;
      };
      if (internals.__pimiaMock__) {
        return;
      }
      internals.__pimiaMock__ = true;

      let inner: ((...args: unknown[]) => Promise<unknown>) | undefined;
      Object.defineProperty(internals, "invoke", {
        configurable: true,
        get() {
          return (command: string, args?: Record<string, unknown>) => {
            if (command === "pimia_auth_status") {
              return Promise.resolve(status);
            }
            if (command === "pimia_connect_phase") {
              return Promise.resolve("idle");
            }
            if (command === "pimia_api_request") {
              const input = (args?.input ?? {}) as {
                path?: string;
                query?: Record<string, unknown>;
              };
              return Promise.resolve(
                handle(input.path ?? "", input.query ?? {}),
              );
            }
            return inner
              ? inner(command, args)
              : Promise.reject(new Error(`sin mock para ${command}`));
          };
        },
        set(value: (...args: unknown[]) => Promise<unknown>) {
          inner = value;
        },
      });
    },
    {
      customers: CUSTOMERS,
      estimates: ESTIMATES,
      lines: LINES,
      opts: {
        disconnected: options.disconnected ?? false,
        empty: options.empty ?? false,
      },
      tenant: PIMIA_MOCK_TENANT,
    },
  );
}
