/**
 * Las estadísticas de un cliente, en TanStack Query.
 *
 * ## Por qué no está en `hooks/usePimiaResources.ts`
 *
 * Debería, y ahí es donde acabará: es una consulta de datos del ERP como las
 * demás y la clave copia su forma para que la invalidación por tenant
 * (`useInvalidateTenantData`) siga alcanzándola. Vive aparte sólo porque este
 * trabajo se hizo con carriles en paralelo sobre el mismo worktree y aquel
 * fichero no era de ninguno: meterle una función más era la única edición de
 * este cambio que podía pisar el trabajo de otro. 🔓 **Al portar, se sube
 * ahí** y este fichero desaparece.
 *
 * ## Las dos decisiones que sí son de fondo
 *
 * 1. **`retry: false`.** El fallo esperado de este endpoint es un `403` por
 *    permisos —el contrato no declara qué scope exige, sólo que puede
 *    responder `403` (`api.d.ts:6165`)—, y un permiso que falta no se arregla
 *    insistiendo: reintentar sería tardar tres veces más en enseñar el mismo
 *    bloque degradado. Mismo criterio que el detalle remoto de VeriFactu.
 * 2. **Consulta propia, no la de la ficha.** La respuesta trae el cliente
 *    entero además del `meta`, así que podría sustituir a `GET /customers/{id}`
 *    y ahorrar una petición; no se hace, para que su `403` se lleve por delante
 *    un bloque de cifras y no la ficha del cliente. El porqué largo está en el
 *    docblock de `getCustomerStats`.
 */

import { useQuery } from "@tanstack/react-query";

import { getCustomerStats } from "@/features/pimia/api/customers";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";

/** El mismo que en `usePimiaResources.ts`: un token vale para un solo tenant. */
const DATA_STALE_TIME = 30 * 1000;

export function usePimiaCustomerStatsQuery(customerId: string | undefined) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: [
      "pimia",
      "data",
      tenant?.id ?? "none",
      "customerStats",
      customerId,
    ],
    queryFn: () => getCustomerStats(customerId as string),
    enabled: Boolean(tenant) && Boolean(customerId),
    retry: false,
    staleTime: DATA_STALE_TIME,
  });
}
