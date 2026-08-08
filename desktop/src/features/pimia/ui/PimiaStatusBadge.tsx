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
