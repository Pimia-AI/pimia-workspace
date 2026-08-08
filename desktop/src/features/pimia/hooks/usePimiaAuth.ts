/**
 * Estado de conexión con Pimia, en TanStack Query.
 *
 * El backend emite `pimia-auth-changed` cada vez que algo cambia (conectar,
 * desconectar, cambiar de tenant activo), así que la caché se refresca por
 * empuje y no hace falta sondear.
 */

import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelPimiaConnect,
  connectPimiaTenant,
  disconnectPimiaTenant,
  fetchPimiaAuthStatus,
  findActiveTenant,
  PIMIA_AUTH_CHANGED_EVENT,
  setActivePimiaTenant,
  type PimiaAuthStatus,
} from "@/features/pimia/api/auth";

export const pimiaAuthQueryKey = ["pimia", "auth"] as const;

export function usePimiaAuthQuery() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const unlisten = listen<PimiaAuthStatus>(
      PIMIA_AUTH_CHANGED_EVENT,
      (event) => {
        queryClient.setQueryData(pimiaAuthQueryKey, event.payload);
        // Los datos del ERP están cacheados por tenant: al cambiar la conexión
        // hay que soltar lo que se pintó con la anterior.
        void queryClient.invalidateQueries({ queryKey: ["pimia", "data"] });
      },
    );

    return () => {
      void unlisten.then((off) => off());
    };
  }, [queryClient]);

  return useQuery({
    queryKey: pimiaAuthQueryKey,
    queryFn: fetchPimiaAuthStatus,
    staleTime: 30 * 1_000,
  });
}

/** El tenant activo, o `null` si no hay ninguno conectado. */
export function useActivePimiaTenant() {
  const { data } = usePimiaAuthQuery();
  return React.useMemo(() => findActiveTenant(data), [data]);
}

export function useConnectPimiaTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (baseUrl: string) => connectPimiaTenant(baseUrl),
    onSuccess: (status) => {
      queryClient.setQueryData(pimiaAuthQueryKey, status);
      void queryClient.invalidateQueries({ queryKey: ["pimia", "data"] });
    },
  });
}

export function useCancelPimiaConnect() {
  return useMutation({ mutationFn: () => cancelPimiaConnect() });
}

export function useDisconnectPimiaTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) => disconnectPimiaTenant(tenantId),
    onSuccess: (status) => {
      queryClient.setQueryData(pimiaAuthQueryKey, status);
      void queryClient.invalidateQueries({ queryKey: ["pimia", "data"] });
    },
  });
}

export function useSetActivePimiaTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantId: string) => setActivePimiaTenant(tenantId),
    onSuccess: (status) => {
      queryClient.setQueryData(pimiaAuthQueryKey, status);
      void queryClient.invalidateQueries({ queryKey: ["pimia", "data"] });
    },
  });
}
