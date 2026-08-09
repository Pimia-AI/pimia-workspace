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
  changeEstimateStatus,
  cloneEstimate,
  convertEstimateToInvoice,
  createEstimate,
  getEstimate,
  listEstimates,
  type ListEstimatesInput,
  type PimiaEstimateDraft,
  type PimiaEstimateManualStatus,
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

export function usePimiaEstimateQuery(estimateId: string | undefined) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "estimate", estimateId),
    queryFn: () => getEstimate(estimateId as string),
    enabled: Boolean(tenant) && Boolean(estimateId),
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

/**
 * Invalida **todo** lo leído de este tenant.
 *
 * Las acciones de documento no son quirúrgicas: cambiar el estado de un
 * presupuesto mueve su ficha, su fila en la lista, los recuentos de las
 * pestañas y la lista dentro de la ficha de su cliente. Y ninguna de las tres
 * devuelve el recurso actualizado —`status` contesta `{success: true}` a
 * secas—, así que no hay nada que sembrar en la caché. Tirar del tenant entero
 * cuesta un puñado de peticiones y es lo único que no deja una cifra vieja
 * en pantalla.
 */
function useInvalidateTenantData() {
  const queryClient = useQueryClient();
  const tenant = useActivePimiaTenant();

  return () => {
    void queryClient.invalidateQueries({ queryKey: dataKey(tenant?.id) });
  };
}

export function useChangePimiaEstimateStatus() {
  const invalidate = useInvalidateTenantData();

  return useMutation({
    mutationFn: (input: {
      estimateId: string;
      status: PimiaEstimateManualStatus;
    }) => changeEstimateStatus(input.estimateId, input.status),
    onSuccess: invalidate,
  });
}

export function useClonePimiaEstimate() {
  const invalidate = useInvalidateTenantData();

  return useMutation({
    mutationFn: (estimateId: string) => cloneEstimate(estimateId),
    onSuccess: invalidate,
  });
}

export function useConvertPimiaEstimateToInvoice() {
  const invalidate = useInvalidateTenantData();

  return useMutation({
    mutationFn: (estimateId: string) => convertEstimateToInvoice(estimateId),
    // El presupuesto cambia al convertirse (`checkForEstimateConvertAction`
    // puede moverle el estado), así que se relee igual que en las demás.
    onSuccess: invalidate,
  });
}
