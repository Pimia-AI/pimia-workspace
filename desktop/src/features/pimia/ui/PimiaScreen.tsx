/**
 * El panel del ERP: la portada de la barra izquierda.
 *
 * Tres cifras y la actividad reciente, que es el patrón de portada de la
 * referencia. Las cifras salen del recuento que devuelve la propia API
 * (`meta.*_total_count`): aquí no se calcula nada que el servidor no diga, y
 * por eso no hay comparativas ni variaciones inventadas.
 *
 * LA FRONTERA (plan §1, innegociable): nada de este árbol habla con el relay.
 * Los mensajes de canal se guardan en claro en el Postgres del relay, que no
 * administramos; los datos del ERP viajan solo por la API de Pimia, con OAuth
 * y scopes. En el código: ningún módulo de `features/pimia/` importa de
 * `shared/api/relay*`, y lo vigila `scripts/check-pimia-boundary.mjs`.
 */

import { ChevronRight, FileText, MailQuestion, Users } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  usePimiaCustomersQuery,
  usePimiaEstimatesQuery,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";

type StatCardProps = {
  hint: string;
  icon: typeof Users;
  label: string;
  onOpen: () => void;
  value: string;
};

function StatCard({ hint, icon: Icon, label, onOpen, value }: StatCardProps) {
  return (
    <button
      className="group flex flex-1 flex-col gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      type="button"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" className="h-4 w-4" />
        {label}
        <ChevronRight
          aria-hidden="true"
          className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </span>
      <span className="block truncate text-3xl font-medium tabular-nums leading-none text-foreground">
        {value}
      </span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

/** El recuento que la API manda, o una raya mientras no se sepa. */
function count(total: number | null | undefined) {
  return typeof total === "number" ? String(total) : "—";
}

export function PimiaScreen() {
  const tenant = useActivePimiaTenant();
  const { goPimiaCustomer, goPimiaEstimate, goPimiaPath } = useAppNavigation();
  const customersQuery = usePimiaCustomersQuery({ limit: 1 });
  const estimatesQuery = usePimiaEstimatesQuery({ limit: 5 });
  // Solo se lee el recuento: `limit: 1` para no traerse la lista entera por
  // una cifra.
  const sentQuery = usePimiaEstimatesQuery({ limit: 1, status: "SENT" });
  const viewedQuery = usePimiaEstimatesQuery({ limit: 1, status: "VIEWED" });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const recent = estimatesQuery.data?.estimates ?? [];
  const sent = sentQuery.data?.totalCount;
  const viewed = viewedQuery.data?.totalCount;
  const awaiting =
    typeof sent === "number" && typeof viewed === "number"
      ? sent + viewed
      : null;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PimiaPageHeader
        description={`Lo que está pasando en ${tenant.label}.`}
        title="Panel"
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <StatCard
          hint="en la cartera"
          icon={Users}
          label="Clientes"
          onOpen={() => void goPimiaPath("/pimia/clientes")}
          value={count(customersQuery.data?.companyTotalCount)}
        />
        <StatCard
          hint="emitidos en total"
          icon={FileText}
          label="Presupuestos"
          onOpen={() => void goPimiaPath("/pimia/presupuestos")}
          // El del tenant entero, no el de la página que se acaba de pedir.
          value={count(estimatesQuery.data?.companyTotalCount)}
        />
        <StatCard
          hint="enviados o vistos, sin resolver"
          icon={MailQuestion}
          label="Pendientes de respuesta"
          onOpen={() => void goPimiaPath("/pimia/presupuestos")}
          value={count(awaiting)}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Últimos presupuestos
          </h2>
          <Button
            className="h-7 px-2 text-muted-foreground"
            onClick={() => void goPimiaPath("/pimia/presupuestos")}
            size="sm"
            variant="ghost"
          >
            Ver todos
            <ChevronRight className="h-4 w-4" />
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
          <PimiaEmpty
            description="En cuanto emitas el primero lo verás aquí."
            title="Todavía no hay presupuestos"
          />
        ) : null}
        {recent.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <PimiaEstimateList
              estimates={recent}
              onOpen={(id) => void goPimiaEstimate(id)}
              onOpenCustomer={(customerId) => void goPimiaCustomer(customerId)}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
