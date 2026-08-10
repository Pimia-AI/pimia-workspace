/**
 * La insignia de estado del ERP: un punto de color semántico y la etiqueta.
 *
 * El tono va por significado, no por documento — así la réplica de facturas
 * reutiliza la misma escala y «pagada» se ve verde por la misma razón por la
 * que «aceptado» lo es. El color sale de las variantes de la insignia de Buzz;
 * aquí no se declara ni un color.
 */

import type { ReactNode } from "react";

import type { PimiaEstimateStatus } from "@/features/pimia/api/estimates";
import type {
  PimiaInvoiceAeatStatus,
  PimiaInvoicePaidStatus,
  PimiaInvoiceStatus,
} from "@/features/pimia/api/invoices";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";

/** Lo que el estado significa, no de qué color es. */
export type PimiaStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const TONE_VARIANTS: Record<
  PimiaStatusTone,
  "secondary" | "info" | "success" | "warning" | "destructive"
> = {
  neutral: "secondary",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "destructive",
};

/**
 * La variante `destructive` de Buzz es sólida —está pensada para un botón de
 * borrar, no para una fila de tabla— y al lado de las demás gritaba. Se atenúa
 * con la MISMA variable, no con un color nuevo.
 */
const TONE_OVERRIDES: Partial<Record<PimiaStatusTone, string>> = {
  danger: "bg-destructive/15 text-destructive",
};

export function PimiaStatusBadge({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone: PimiaStatusTone;
}) {
  return (
    <Badge
      className={cn("gap-1.5", TONE_OVERRIDES[tone], className)}
      variant={TONE_VARIANTS[tone]}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {children}
    </Badge>
  );
}

/** El ciclo de vida de un presupuesto: DRAFT → SENT → VIEWED → resolución. */
export const ESTIMATE_STATUS_META: Record<
  PimiaEstimateStatus,
  { label: string; plural: string; tone: PimiaStatusTone }
> = {
  DRAFT: { label: "Borrador", plural: "Borradores", tone: "neutral" },
  SENT: { label: "Enviado", plural: "Enviados", tone: "info" },
  VIEWED: { label: "Visto", plural: "Vistos", tone: "info" },
  ACCEPTED: { label: "Aceptado", plural: "Aceptados", tone: "success" },
  REJECTED: { label: "Rechazado", plural: "Rechazados", tone: "danger" },
  EXPIRED: { label: "Caducado", plural: "Caducados", tone: "warning" },
};

/**
 * Un estado que la API devuelva y no conozcamos se pinta tal cual en neutro:
 * inventarse un color para lo desconocido es peor que no saberlo.
 */
export function PimiaEstimateStatusBadge({ status }: { status: string }) {
  const meta = ESTIMATE_STATUS_META[status as PimiaEstimateStatus];
  return (
    <PimiaStatusBadge tone={meta?.tone ?? "neutral"}>
      {meta?.label ?? status}
    </PimiaStatusBadge>
  );
}

/**
 * El ciclo de una factura: DRAFT → PUBLISHED → SENT → VIEWED → COMPLETED.
 *
 * PUBLISHED es el escalón que un presupuesto no tiene: número oficial asignado
 * y registro en VeriFactu. A partir de ahí el documento es irrevocable — por
 * eso su tono es `info` y no `neutral`: ya no es un papel de trabajo.
 */
export const INVOICE_STATUS_META: Record<
  PimiaInvoiceStatus,
  { label: string; plural: string; tone: PimiaStatusTone }
> = {
  DRAFT: { label: "Borrador", plural: "Borradores", tone: "neutral" },
  PUBLISHED: { label: "Publicada", plural: "Publicadas", tone: "info" },
  SENT: { label: "Enviada", plural: "Enviadas", tone: "info" },
  VIEWED: { label: "Vista", plural: "Vistas", tone: "info" },
  COMPLETED: { label: "Completada", plural: "Completadas", tone: "success" },
};

export function PimiaInvoiceStatusBadge({ status }: { status: string }) {
  const meta = INVOICE_STATUS_META[status as PimiaInvoiceStatus];
  return (
    <PimiaStatusBadge tone={meta?.tone ?? "neutral"}>
      {meta?.label ?? status}
    </PimiaStatusBadge>
  );
}

/**
 * El eje del cobro, independiente del estado. «Pagada» es verde por la misma
 * razón por la que «aceptado» lo es; «vencida» manda sobre «pendiente» porque
 * es la que pide actuar.
 */
export const INVOICE_PAID_META: Record<
  PimiaInvoicePaidStatus,
  { label: string; tone: PimiaStatusTone }
> = {
  UNPAID: { label: "Pendiente", tone: "warning" },
  PARTIALLY_PAID: { label: "Cobro parcial", tone: "warning" },
  PAID: { label: "Pagada", tone: "success" },
};

export function PimiaInvoicePaidBadge({
  isOverdue,
  paidStatus,
}: {
  /** Lo dice el servidor (`overdue`): vencida y sin cobrar del todo. */
  isOverdue?: boolean;
  paidStatus: string;
}) {
  if (isOverdue) {
    return <PimiaStatusBadge tone="danger">Vencida</PimiaStatusBadge>;
  }
  const meta = INVOICE_PAID_META[paidStatus as PimiaInvoicePaidStatus];
  return (
    <PimiaStatusBadge tone={meta?.tone ?? "neutral"}>
      {meta?.label ?? paidStatus}
    </PimiaStatusBadge>
  );
}

/**
 * El tercer eje: el registro en la AEAT.
 *
 * Las etiquetas y los tonos son **los mismos que el panel Vue**
 * (`helpers/invoice-status.js`): la misma factura no puede verse «Rechazada» en
 * rojo en un sitio y en ámbar en el otro. `pending` es ámbar y no rojo a
 * propósito — el registro no falló del todo, el reintento automático sigue en
 * marcha.
 */
export const INVOICE_AEAT_META: Record<
  PimiaInvoiceAeatStatus,
  { label: string; tone: PimiaStatusTone }
> = {
  not_applicable: { label: "No aplica", tone: "neutral" },
  queued: { label: "En cola", tone: "neutral" },
  pending: { label: "Pendiente", tone: "warning" },
  sent: { label: "Enviada", tone: "neutral" },
  accepted: { label: "Aceptada", tone: "success" },
  accepted_with_warnings: { label: "Aceptada con avisos", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  error: { label: "Error", tone: "danger" },
  annulled: { label: "Anulada", tone: "neutral" },
  sandbox_only: { label: "Solo pruebas", tone: "neutral" },
};

export function PimiaVeriFactuBadge({ status }: { status: string }) {
  const meta = INVOICE_AEAT_META[status as PimiaInvoiceAeatStatus];
  return (
    <span
      className="inline-flex items-center gap-1.5"
      data-testid="pimia-verifactu-badge"
    >
      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        VeriFactu
      </span>
      <PimiaStatusBadge tone={meta?.tone ?? "neutral"}>
        {meta?.label ?? status}
      </PimiaStatusBadge>
    </span>
  );
}
