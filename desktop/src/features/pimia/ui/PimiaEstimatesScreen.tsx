/**
 * Presupuestos — el tercer paso del corte vertical, y la lista que fija el
 * patrón del ERP: cabecera con la acción primaria, pestañas de estado,
 * fila de filtros, tabla densa y pie con el recuento.
 *
 * El estado va en pestañas y no en botones porque es la partición natural de
 * la lista; la búsqueda va aparte, en la fila de filtros, porque es
 * transversal a todas ellas.
 */

import * as React from "react";
import { Users } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  ESTIMATE_STATUSES,
  type PimiaEstimateStatus,
} from "@/features/pimia/api/estimates";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaEstimatesQuery } from "@/features/pimia/hooks/usePimiaResources";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import { ESTIMATE_STATUS_META } from "@/features/pimia/ui/PimiaStatusBadge";
import { PimiaStatusTabs } from "@/features/pimia/ui/PimiaStatusTabs";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";

const PAGE_SIZE = 25;
const ALL_TAB = "todos";

const STATUS_TABS = [
  { label: "Todos", value: ALL_TAB },
  ...ESTIMATE_STATUSES.map((status) => ({
    label: ESTIMATE_STATUS_META[status].plural,
    value: status,
  })),
];

export function PimiaEstimatesScreen() {
  const tenant = useActivePimiaTenant();
  const [status, setStatus] = React.useState<PimiaEstimateStatus | undefined>();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const { goPimiaPath } = useAppNavigation();

  // La búsqueda va contra la API del tenant, no contra una lista en memoria:
  // una petición por tecla es una petición por tecla.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = usePimiaEstimatesQuery({
    limit: PAGE_SIZE,
    page,
    search,
    status,
  });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const estimates = query.data?.estimates ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCount = query.data?.totalCount ?? null;
  const totalCents = estimates.reduce(
    (total, estimate) => total + (estimate.totalCents ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PimiaPageHeader
        description="Presupuestos emitidos, su estado y lo que hay en juego."
        title="Presupuestos"
      />

      <PimiaStatusTabs
        onValueChange={(value) => {
          setStatus(
            value === ALL_TAB ? undefined : (value as PimiaEstimateStatus),
          );
          setPage(1);
        }}
        options={STATUS_TABS}
        testIdPrefix="pimia-estimate-filter"
        value={status ?? ALL_TAB}
      />

      <PimiaFilterBar
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar por número o cliente"
        searchTestId="pimia-estimate-search"
        searchValue={searchInput}
      />

      {query.isPending ? <PimiaRowsSkeleton /> : null}
      {query.isError ? (
        <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : null}

      {query.isSuccess && estimates.length === 0 ? (
        <PimiaEmpty
          action={
            search || status ? null : (
              // Un presupuesto se emite desde su cliente, así que la primera
              // acción de esta pantalla vacía es ir a elegirlo.
              <Button
                onClick={() => void goPimiaPath("/pimia/clientes")}
                size="sm"
                variant="outline"
              >
                <Users className="h-4 w-4" />
                Elegir un cliente
              </Button>
            )
          }
          description={
            search || status
              ? "Prueba a quitar el filtro o a buscar otra cosa."
              : "Se emiten desde la ficha del cliente. Los que emitas aparecerán aquí con su estado y su importe."
          }
          title={
            search || status
              ? "Ningún presupuesto coincide"
              : "Todavía no hay presupuestos"
          }
        />
      ) : null}

      {estimates.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <PimiaEstimateList estimates={estimates} totalCents={totalCents} />
          <PimiaPagination
            isBusy={query.isFetching}
            lastPage={lastPage}
            onPageChange={setPage}
            page={page}
            pageSize={PAGE_SIZE}
            shown={estimates.length}
            total={totalCount}
          />
        </div>
      ) : null}
    </div>
  );
}
