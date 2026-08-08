/**
 * La lista de presupuestos, compartida por el detalle de cliente y la pantalla
 * general. Solo pinta: los datos y la paginación los pone quien la usa.
 */

import type { PimiaEstimate } from "@/features/pimia/api/estimates";
import { formatCents } from "@/features/pimia/lib/money";
import { Badge } from "@/shared/ui/badge";

/** Estados del ciclo de vida: DRAFT → SENT → VIEWED → ACCEPTED/RECHAZADO/CADUCADO. */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  VIEWED: "Visto",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  EXPIRED: "Caducado",
};

const STATUS_VARIANTS: Record<
  string,
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "warning"
  | "success"
  | "info"
> = {
  DRAFT: "secondary",
  SENT: "info",
  VIEWED: "info",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type PimiaEstimateListProps = {
  estimates: PimiaEstimate[];
  /** Oculta la columna de cliente cuando ya se está dentro de uno. */
  showCustomer?: boolean;
};

export function PimiaEstimateList({
  estimates,
  showCustomer = true,
}: PimiaEstimateListProps) {
  return (
    <ul
      className="divide-y divide-border rounded-lg border border-border"
      data-testid="pimia-estimate-list"
    >
      {estimates.map((estimate) => (
        <li
          className="flex items-center gap-4 px-4 py-3"
          data-testid={`pimia-estimate-${estimate.id}`}
          key={estimate.id}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm text-foreground">
              {estimate.estimateNumber}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {showCustomer && estimate.customerName
                ? `${estimate.customerName} · `
                : ""}
              {formatDate(estimate.estimateDate)}
            </span>
          </span>
          <Badge
            className="shrink-0"
            variant={STATUS_VARIANTS[estimate.status] ?? "secondary"}
          >
            {STATUS_LABELS[estimate.status] ?? estimate.status}
          </Badge>
          <span className="shrink-0 text-right text-sm tabular-nums text-foreground">
            {formatCents(estimate.totalCents ?? 0)}
          </span>
        </li>
      ))}
    </ul>
  );
}
