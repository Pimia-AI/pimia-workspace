/**
 * Los datos del ERP en TanStack Query.
 *
 * Todas las claves cuelgan de `["pimia", "data", <tenant>]`: un token vale para
 * un solo tenant, así que la caché no puede compartirse entre ellos. Al cambiar
 * de tenant activo, `usePimiaAuth` invalida `["pimia", "data"]` entero.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getCustomer,
  listCustomers,
  type ListCustomersInput,
} from "@/features/pimia/api/customers";
import {
  createEstimate,
  listEstimates,
  type ListEstimatesInput,
  type PimiaEstimateDraft,
} from "@/features/pimia/api/estimates";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";

function dataKey(tenantId: string | undefined, ...rest: unknown[]) {
  return ["pimia", "data", tenantId ?? "none", ...rest] as const;
}

export function usePimiaCustomersQuery(input: ListCustomersInput = {}) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "customers", input),
    queryFn: () => listCustomers(input),
    enabled: Boolean(tenant),
    placeholderData: (previous) => previous,
  });
}

export function usePimiaCustomerQuery(customerId: string | undefined) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "customer", customerId),
    queryFn: () => getCustomer(customerId as string),
    enabled: Boolean(tenant) && Boolean(customerId),
  });
}

export function usePimiaEstimatesQuery(input: ListEstimatesInput = {}) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "estimates", input),
    queryFn: () => listEstimates(input),
    enabled: Boolean(tenant),
    placeholderData: (previous) => previous,
  });
}

export function useCreatePimiaEstimate() {
  const queryClient = useQueryClient();
  const tenant = useActivePimiaTenant();

  return useMutation({
    mutationFn: (draft: PimiaEstimateDraft) => createEstimate(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: dataKey(tenant?.id, "estimates"),
      });
    },
  });
}
