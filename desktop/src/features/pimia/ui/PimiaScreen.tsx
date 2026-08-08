/**
 * El panel del ERP: la portada de la barra izquierda.
 *
 * LA FRONTERA (plan §1, innegociable): nada de este árbol habla con el relay.
 * Los mensajes de canal se guardan en claro en el Postgres del relay, que no
 * administramos; los datos del ERP viajan solo por la API de Pimia, con OAuth
 * y scopes. En el código: ningún módulo de `features/pimia/` importa de
 * `shared/api/relay*`, y lo vigila `scripts/check-pimia-boundary.mjs`.
 */

import { FileText, Users } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { formatCents } from "@/features/pimia/lib/money";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  usePimiaCustomersQuery,
  usePimiaEstimatesQuery,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/PageHeader";

type SummaryCardProps = {
  icon: typeof Users;
  label: string;
  onOpen: () => void;
  value: string;
};

function SummaryCard({ icon: Icon, label, onOpen, value }: SummaryCardProps) {
  return (
    <button
      className="flex flex-1 items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
      onClick={onOpen}
      type="button"
    >
      <Icon aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-2xs uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-lg font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </span>
    </button>
  );
}

export function PimiaScreen() {
  const tenant = useActivePimiaTenant();
  const { goPimiaPath } = useAppNavigation();
  const customersQuery = usePimiaCustomersQuery({ limit: 1 });
  const estimatesQuery = usePimiaEstimatesQuery({ limit: 5 });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const recent = estimatesQuery.data?.estimates ?? [];
  const pendingCents = recent
    .filter(
      (estimate) => estimate.status === "SENT" || estimate.status === "VIEWED",
    )
    .reduce((total, estimate) => total + (estimate.totalCents ?? 0), 0);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PageHeader description={tenant.label} title="Pimia" />

      <div className="flex flex-col gap-3 sm:flex-row">
        <SummaryCard
          icon={Users}
          label="Clientes"
          onOpen={() => void goPimiaPath("/pimia/clientes")}
          value={
            customersQuery.data?.totalCount !== null &&
            customersQuery.data?.totalCount !== undefined
              ? String(customersQuery.data.totalCount)
              : "—"
          }
        />
        <SummaryCard
          icon={FileText}
          label="Presupuestos"
          onOpen={() => void goPimiaPath("/pimia/presupuestos")}
          value={
            estimatesQuery.data?.totalCount !== null &&
            estimatesQuery.data?.totalCount !== undefined
              ? String(estimatesQuery.data.totalCount)
              : "—"
          }
        />
        <SummaryCard
          icon={FileText}
          label="Pendiente de respuesta"
          onOpen={() => void goPimiaPath("/pimia/presupuestos")}
          value={formatCents(pendingCents)}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Últimos presupuestos
          </h2>
          <Button
            onClick={() => void goPimiaPath("/pimia/presupuestos")}
            size="sm"
            variant="ghost"
          >
            Ver todos
          </Button>
        </div>
        {estimatesQuery.isPending ? <PimiaRowsSkeleton rows={4} /> : null}
        {estimatesQuery.isError ? (
          <PimiaErrorState
            error={estimatesQuery.error}
            onRetry={() => estimatesQuery.refetch()}
          />
        ) : null}
        {estimatesQuery.isSuccess && recent.length === 0 ? (
          <PimiaEmpty>Todavía no hay presupuestos en este tenant.</PimiaEmpty>
        ) : null}
        {recent.length > 0 ? <PimiaEstimateList estimates={recent} /> : null}
      </section>
    </div>
  );
}
