/**
 * Presupuestos — el tercer paso del corte vertical. Vista transversal, con el
 * filtro por estado que es como se mira esta lista en el día a día.
 */

import * as React from "react";

import {
  ESTIMATE_STATUSES,
  type PimiaEstimateStatus,
} from "@/features/pimia/api/estimates";
import { formatCents } from "@/features/pimia/lib/money";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaEstimatesQuery } from "@/features/pimia/hooks/usePimiaResources";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/PageHeader";

const STATUS_LABELS: Record<PimiaEstimateStatus, string> = {
  DRAFT: "Borradores",
  SENT: "Enviados",
  VIEWED: "Vistos",
  ACCEPTED: "Aceptados",
  REJECTED: "Rechazados",
  EXPIRED: "Caducados",
};

const PAGE_SIZE = 25;

export function PimiaEstimatesScreen() {
  const tenant = useActivePimiaTenant();
  const [status, setStatus] = React.useState<PimiaEstimateStatus | undefined>();
  const [page, setPage] = React.useState(1);
  const query = usePimiaEstimatesQuery({ page, limit: PAGE_SIZE, status });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const estimates = query.data?.estimates ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCents = estimates.reduce(
    (total, estimate) => total + (estimate.totalCents ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <PageHeader
        description={
          query.data?.totalCount !== null &&
          query.data?.totalCount !== undefined
            ? `${query.data.totalCount} en ${tenant.label}`
            : tenant.label
        }
        title="Presupuestos"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          onClick={() => {
            setStatus(undefined);
            setPage(1);
          }}
          size="sm"
          variant={status === undefined ? "default" : "outline"}
        >
          Todos
        </Button>
        {ESTIMATE_STATUSES.map((candidate) => (
          <Button
            data-testid={`pimia-estimate-filter-${candidate}`}
            key={candidate}
            onClick={() => {
              setStatus(candidate);
              setPage(1);
            }}
            size="sm"
            variant={status === candidate ? "default" : "outline"}
          >
            {STATUS_LABELS[candidate]}
          </Button>
        ))}
      </div>

      {query.isPending ? <PimiaRowsSkeleton /> : null}
      {query.isError ? (
        <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : null}

      {query.isSuccess && estimates.length === 0 ? (
        <PimiaEmpty>
          {status
            ? `Ningún presupuesto en «${STATUS_LABELS[status]}».`
            : "Este tenant todavía no tiene presupuestos."}
        </PimiaEmpty>
      ) : null}

      {estimates.length > 0 ? (
        <>
          <PimiaEstimateList estimates={estimates} />
          <p className="text-right text-sm text-muted-foreground">
            Total en pantalla{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatCents(totalCents)}
            </span>
          </p>
        </>
      ) : null}

      {lastPage > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            size="sm"
            variant="outline"
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <Button
            disabled={page >= lastPage || query.isFetching}
            onClick={() => setPage((current) => current + 1)}
            size="sm"
            variant="outline"
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
