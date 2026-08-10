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
  fetchEstimateMailBody,
  fetchInvoiceMailBody,
} from "@/features/pimia/api/company";
import {
  changeEstimateStatus,
  cloneEstimate,
  convertEstimateToInvoice,
  createEstimate,
  getEstimate,
  listEstimates,
  sendEstimate,
  type ListEstimatesInput,
  type PimiaEstimateDraft,
  type PimiaEstimateMail,
  type PimiaEstimateManualStatus,
} from "@/features/pimia/api/estimates";
import {
  cloneInvoice,
  createCreditNote,
  getInvoice,
  getInvoiceVeriFactu,
  listInvoices,
  markInvoiceSent,
  publishInvoice,
  recordInvoicePayment,
  retryInvoiceVeriFactu,
  sendInvoice,
  syncInvoiceVeriFactu,
  type ListInvoicesInput,
  type PimiaInvoiceMail,
  type PimiaInvoicePaymentDraft,
} from "@/features/pimia/api/invoices";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";

function dataKey(tenantId: string | undefined, ...rest: unknown[]) {
  return ["pimia", "data", tenantId ?? "none", ...rest] as const;
}

/**
 * Cuánto vale lo ya leído al volver a montar una pantalla.
 *
 * Con el `staleTime: 0` por defecto, cada cambio de pantalla repetía la ráfaga
 * entera (lista + recuentos: 4-5 peticiones, cada una un RTT al tenant). Son
 * datos de un solo usuario editando, y toda escritura desde la app invalida el
 * tenant entero (`useInvalidateTenantData`), que refetchea aunque nada esté
 * stale — así que lo único que se pospone hasta 30 s es ver cambios hechos
 * desde fuera (la web, un agente).
 */
const DATA_STALE_TIME = 30 * 1000;

export function usePimiaCustomersQuery(input: ListCustomersInput = {}) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "customers", input),
    queryFn: () => listCustomers(input),
    enabled: Boolean(tenant),
    placeholderData: (previous) => previous,
    staleTime: DATA_STALE_TIME,
  });
}

export function usePimiaCustomerQuery(customerId: string | undefined) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "customer", customerId),
    queryFn: () => getCustomer(customerId as string),
    enabled: Boolean(tenant) && Boolean(customerId),
    staleTime: DATA_STALE_TIME,
  });
}

export function usePimiaEstimateQuery(estimateId: string | undefined) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "estimate", estimateId),
    queryFn: () => getEstimate(estimateId as string),
    enabled: Boolean(tenant) && Boolean(estimateId),
    staleTime: DATA_STALE_TIME,
  });
}

export function usePimiaEstimatesQuery(input: ListEstimatesInput = {}) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "estimates", input),
    queryFn: () => listEstimates(input),
    enabled: Boolean(tenant),
    placeholderData: (previous) => previous,
    staleTime: DATA_STALE_TIME,
  });
}

export function usePimiaInvoicesQuery(input: ListInvoicesInput = {}) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "invoices", input),
    queryFn: () => listInvoices(input),
    enabled: Boolean(tenant),
    placeholderData: (previous) => previous,
    staleTime: DATA_STALE_TIME,
  });
}

export function usePimiaInvoiceQuery(invoiceId: string | undefined) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "invoice", invoiceId),
    queryFn: () => getInvoice(invoiceId as string),
    enabled: Boolean(tenant) && Boolean(invoiceId),
    staleTime: DATA_STALE_TIME,
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

/**
 * La plantilla de correo de la empresa, para prellenar el envío.
 *
 * Cuelga de `["pimia","data",<tenant>]` como todo lo demás, pero con
 * `staleTime` largo: sale de `/bootstrap`, que devuelve el mundo entero, y un
 * ajuste de empresa no cambia mientras alguien redacta un correo.
 */
export function usePimiaEstimateMailBodyQuery(enabled: boolean) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "estimateMailBody"),
    queryFn: () => fetchEstimateMailBody(),
    enabled: Boolean(tenant) && enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSendPimiaEstimate() {
  const invalidate = useInvalidateTenantData();

  return useMutation({
    mutationFn: (input: { estimateId: string; mail: PimiaEstimateMail }) =>
      sendEstimate(input.estimateId, input.mail),
    // Enviar mueve el estado del borrador a «enviado», así que la ficha y la
    // lista tienen que releerse igual que con un cambio de estado a mano.
    onSuccess: invalidate,
  });
}

export function usePimiaInvoiceMailBodyQuery(enabled: boolean) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "invoiceMailBody"),
    queryFn: () => fetchInvoiceMailBody(),
    enabled: Boolean(tenant) && enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function usePublishPimiaInvoice() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (invoiceId: string) => publishInvoice(invoiceId),
    onSuccess: invalidate,
  });
}

export function useMarkPimiaInvoiceSent() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (invoiceId: string) => markInvoiceSent(invoiceId),
    onSuccess: invalidate,
  });
}

export function useSendPimiaInvoice() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (input: { invoiceId: string; mail: PimiaInvoiceMail }) =>
      sendInvoice(input.invoiceId, input.mail),
    onSuccess: invalidate,
  });
}

export function useClonePimiaInvoice() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (invoiceId: string) => cloneInvoice(invoiceId),
    onSuccess: invalidate,
  });
}

export function useRecordPimiaInvoicePayment() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (draft: PimiaInvoicePaymentDraft) =>
      recordInvoicePayment(draft),
    onSuccess: invalidate,
  });
}

/**
 * Crea la rectificativa. Como `clone`, devuelve el documento nuevo para poder
 * llevar a él — pero aquí además cambia el mundo alrededor (una fila más en la
 * lista, otra en el contador del mes), así que se invalida el tenant entero.
 */
export function useCreatePimiaCreditNote() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (invoiceId: string) => createCreditNote(invoiceId),
    onSuccess: invalidate,
  });
}

/**
 * El detalle remoto de VeriFactu, solo cuando hace falta.
 *
 * `enabled` lo decide la ficha: se pide únicamente en los estados de fallo,
 * que es donde vive el motivo. Sale de la API de VeriFactu a través del ERP —
 * una llamada de red hacia fuera— así que no se pide «por si acaso», y su
 * resultado no se reintenta solo: un fallo aquí deja el bloque en pie con su
 * mensaje, como en el panel.
 */
export function usePimiaInvoiceVeriFactuQuery(
  invoiceId: string | undefined,
  enabled: boolean,
) {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: dataKey(tenant?.id, "invoiceVeriFactu", invoiceId),
    queryFn: () => getInvoiceVeriFactu(invoiceId as string),
    enabled: Boolean(tenant) && Boolean(invoiceId) && enabled,
    retry: false,
  });
}

export function useSyncPimiaInvoiceVeriFactu() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (invoiceId: string) => syncInvoiceVeriFactu(invoiceId),
    onSuccess: invalidate,
  });
}

export function useRetryPimiaInvoiceVeriFactu() {
  const invalidate = useInvalidateTenantData();
  return useMutation({
    mutationFn: (invoiceId: string) => retryInvoiceVeriFactu(invoiceId),
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
