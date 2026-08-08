/**
 * Estado de conexión con los tenants de Pimia.
 *
 * Aquí no hay tokens: el `TokenSet` vive en el llavero del SO y no cruza nunca
 * al webview. Lo que se ve es la conexión (host, permisos concedidos, cuándo
 * caduca), que es lo que la UI necesita para decidir qué enseñar.
 */

import { invoke } from "@tauri-apps/api/core";

import { toPimiaApiError } from "@/features/pimia/api/pimiaClient";

export type PimiaTenant = {
  id: string;
  baseUrl: string;
  /** El host: `sdkdemo.taskai.work`. */
  label: string;
  scopes: string[];
  /** Epoch en ms. */
  connectedAt: number;
  /** Epoch en ms; ausente si el tenant no da caducidad. */
  expiresAt?: number;
  hasRefreshToken: boolean;
};

export type PimiaAuthStatus = {
  tenants: PimiaTenant[];
  activeTenantId: string | null;
};

export const PIMIA_AUTH_CHANGED_EVENT = "pimia-auth-changed";

export async function fetchPimiaAuthStatus(): Promise<PimiaAuthStatus> {
  try {
    return (await invoke("pimia_auth_status")) as PimiaAuthStatus;
  } catch (error) {
    throw toPimiaApiError(error);
  }
}

/**
 * Abre el navegador del sistema y **no resuelve hasta que el usuario vuelve**.
 * Puede tardar minutos: es una persona autorizando, no una petición.
 */
export async function connectPimiaTenant(
  baseUrl: string,
): Promise<PimiaAuthStatus> {
  try {
    return (await invoke("pimia_connect_tenant", {
      input: { baseUrl },
    })) as PimiaAuthStatus;
  } catch (error) {
    throw toPimiaApiError(error);
  }
}

export async function cancelPimiaConnect(): Promise<boolean> {
  return (await invoke("pimia_cancel_connect")) as boolean;
}

/**
 * En qué punto está la autorización según el backend.
 *
 * La promesa de `connectPimiaTenant` no es fuente de verdad fiable: si el
 * webview se recarga a media invocación —una recarga de Vite, un reinicio— el
 * callback del comando se pierde y la promesa no se resuelve nunca. Preguntando
 * la fase, la UI puede decir «esto ya no está en marcha» en vez de dejar un
 * spinner eterno.
 */
export type PimiaConnectPhase = "idle" | "awaitingBrowser" | "exchanging";

export async function fetchPimiaConnectPhase(): Promise<PimiaConnectPhase> {
  return (await invoke("pimia_connect_phase")) as PimiaConnectPhase;
}

export async function disconnectPimiaTenant(
  tenantId: string,
): Promise<PimiaAuthStatus> {
  try {
    return (await invoke("pimia_disconnect_tenant", {
      tenantId,
    })) as PimiaAuthStatus;
  } catch (error) {
    throw toPimiaApiError(error);
  }
}

export async function setActivePimiaTenant(
  tenantId: string,
): Promise<PimiaAuthStatus> {
  try {
    return (await invoke("pimia_set_active_tenant", {
      tenantId,
    })) as PimiaAuthStatus;
  } catch (error) {
    throw toPimiaApiError(error);
  }
}

export function findActiveTenant(status: PimiaAuthStatus | undefined) {
  if (!status) {
    return null;
  }
  return (
    status.tenants.find((tenant) => tenant.id === status.activeTenantId) ??
    status.tenants[0] ??
    null
  );
}
