/**
 * El único camino del webview a la API de Pimia.
 *
 * ⚠️ LA FRONTERA (plan §1, innegociable): este módulo —y todo `features/pimia/`—
 * **no importa nada de `shared/api/relay*`**. Los mensajes de canal se guardan
 * en claro en el Postgres del relay, que administra Block; los datos del ERP no
 * pueden pasar por ahí. La regla la vigila `scripts/check-pimia-boundary.mjs`.
 *
 * Se invoca `@tauri-apps/api/core` directamente en vez de pasar por
 * `shared/api/tauri.ts` justamente por eso: ese fichero importa del carril del
 * relay, y basta con rozarlo para que la frontera deje de ser demostrable.
 *
 * Ninguna petición lleva token: el `TokenSet` vive en el llavero del SO y solo
 * se materializa dentro del proceso Rust (ver `src-tauri/src/pimia/api.rs`).
 */

import { invoke } from "@tauri-apps/api/core";

/** Categorías con las que la UI puede ramificar sin leer mensajes. */
export type PimiaErrorKind =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "rateLimited"
  | "validation"
  | "conflict"
  | "server"
  | "network"
  | "notConnected";

type RawPimiaError = {
  kind?: string;
  status?: number;
  message?: string;
  missingScope?: string;
};

const ERROR_KINDS: ReadonlySet<string> = new Set<PimiaErrorKind>([
  "unauthorized",
  "forbidden",
  "notFound",
  "rateLimited",
  "validation",
  "conflict",
  "server",
  "network",
  "notConnected",
]);

export class PimiaApiError extends Error {
  readonly kind: PimiaErrorKind;
  readonly status?: number;
  readonly missingScope?: string;

  constructor(kind: PimiaErrorKind, message: string, extra?: RawPimiaError) {
    super(message);
    this.name = "PimiaApiError";
    this.kind = kind;
    this.status = extra?.status;
    this.missingScope = extra?.missingScope;
  }
}

/**
 * Normaliza lo que devuelve `invoke` al rechazar. Tauri serializa el error del
 * comando tal cual, así que puede llegar como objeto (los comandos de la API) o
 * como cadena (los de auth, que devuelven `Result<_, String>`).
 */
export function toPimiaApiError(error: unknown): PimiaApiError {
  if (error instanceof PimiaApiError) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const raw = error as RawPimiaError;
    const kind =
      typeof raw.kind === "string" && ERROR_KINDS.has(raw.kind)
        ? (raw.kind as PimiaErrorKind)
        : "network";
    return new PimiaApiError(
      kind,
      raw.message ?? "Pimia devolvió un error",
      raw,
    );
  }

  return new PimiaApiError(
    "network",
    typeof error === "string" ? error : "Pimia devolvió un error",
  );
}

export type PimiaQuery = Record<
  string,
  string | number | boolean | null | undefined | Array<string | number>
>;

export type PimiaRequestInput = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Con o sin el prefijo `/api/v1`: da igual. */
  path: string;
  query?: PimiaQuery;
  body?: unknown;
  /** Sin esto se usa el tenant activo. */
  tenantId?: string;
};

export async function pimiaRequest<T>(input: PimiaRequestInput): Promise<T> {
  // Tiempo del invoke completo (IPC + Rust + HTTP), en verbose y solo en dev.
  // El desglose de la parte Rust lo da `PIMIA_TIMING=1` (api.rs).
  const started = import.meta.env.DEV ? performance.now() : 0;
  try {
    return (await invoke("pimia_api_request", { input })) as T;
  } catch (error) {
    throw toPimiaApiError(error);
  } finally {
    if (import.meta.env.DEV) {
      console.debug(
        `pimia ${input.method ?? "GET"} ${input.path}: ${Math.round(performance.now() - started)}ms`,
      );
    }
  }
}

/**
 * Las listas de la API llegan envueltas (`{ data: [...] }`) o como array
 * pelado según el recurso. Esto acepta las dos formas sin inventar datos.
 */
export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (typeof payload === "object" && payload !== null) {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as T[];
    }
  }
  return [];
}

/** Lo mismo para un recurso suelto: `{ data: {...} }` o el objeto directo. */
export function unwrapItem<T>(payload: unknown): T | null {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  if (data !== undefined && data !== null && typeof data === "object") {
    return data as T;
  }
  return payload as T;
}

/** Metadatos de paginación de la API, cuando vienen. */
export type PimiaPagination = {
  currentPage: number;
  lastPage: number;
  total: number;
};

export function readPagination(payload: unknown): PimiaPagination | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const meta = (payload as { meta?: unknown }).meta;
  const source = (
    typeof meta === "object" && meta !== null ? meta : payload
  ) as Record<string, unknown>;
  const currentPage = source.current_page ?? source.currentPage;
  const lastPage = source.last_page ?? source.lastPage;
  const total = source.total;
  if (
    typeof currentPage !== "number" ||
    typeof lastPage !== "number" ||
    typeof total !== "number"
  ) {
    return null;
  }
  return { currentPage, lastPage, total };
}

/**
 * El `meta.<recurso>_total_count` que añaden los índices de Pimia.
 *
 * ⚠️ Es el total **de la empresa**, no el del filtro: el controlador lo calcula
 * con un `count()` aparte que ignora `applyFilters`. Con un estado
 * seleccionado sigue diciendo 129 mientras la lista enseña 48. Sirve para «hay
 * N en total», nunca para el pie de una lista filtrada — para eso está el
 * `total` del paginador, que sí filtra.
 */
export function readCompanyCount(payload: unknown, key: string): number | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const meta = (payload as { meta?: Record<string, unknown> }).meta;
  const value = meta?.[key];
  return typeof value === "number" ? value : null;
}

/**
 * Paginación derivada cuando el recurso no la manda.
 *
 * Los índices de clientes y presupuestos devuelven `meta.<recurso>_total_count`
 * pero no `current_page`/`last_page`. Sin esto el paginador no aparecería nunca
 * y el usuario se quedaría viendo los 25 primeros de 300.
 */
export function derivePagination(
  reported: PimiaPagination | null,
  totalCount: number | null,
  page: number | undefined,
  limit: number | undefined,
): PimiaPagination | null {
  if (reported) {
    return reported;
  }
  if (totalCount === null || !limit || limit <= 0) {
    return null;
  }
  return {
    currentPage: page ?? 1,
    lastPage: Math.max(1, Math.ceil(totalCount / limit)),
    total: totalCount,
  };
}
