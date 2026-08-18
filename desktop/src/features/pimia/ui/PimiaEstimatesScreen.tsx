/**
 * Presupuestos — la lista que fija el patrón del ERP, tomado del
 * `invoice-list-2` de la referencia: cifras arriba, pestañas de estado, fila de
 * filtros, tabla densa con cabeceras que ordenan y pie con el recuento.
 *
 * Todo lo que filtra y ordena es **server-side** (`applyFilters` del modelo
 * `Estimate` acepta `search`, `status`, `customer_id`, `from_date`/`to_date` y
 * `orderByField`/`orderBy`), así que el orden vale para las 129 filas del
 * tenant y no para las 25 que se ven.
 *
 * Las cifras de arriba son **recuentos**, no importes: la API no publica
 * ningún agregado de dinero de presupuestos, y sumar una página y llamarlo
 * total es exactamente el bug que este pase quitó del panel.
 */

import * as React from "react";
import { Users } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  ESTIMATE_STATUSES,
  type PimiaEstimateStatus,
} from "@/features/pimia/api/estimates";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
  type PimiaDateRangePreset,
} from "@/features/pimia/lib/dateRanges";
import { sumStrict } from "@/features/pimia/lib/money";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaEstimatesQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaEstimateList,
  type PimiaEstimateSort,
} from "@/features/pimia/ui/PimiaEstimateList";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import { PimiaStatCards } from "@/features/pimia/ui/PimiaStatCards";
import { ESTIMATE_STATUS_META } from "@/features/pimia/ui/PimiaStatusBadge";
import { PimiaStatusTabs } from "@/features/pimia/ui/PimiaStatusTabs";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const ALL_TAB = "todos";

const STATUS_TABS = [
  { label: "Todos", value: ALL_TAB },
  ...ESTIMATE_STATUSES.map((status) => ({
    label: ESTIMATE_STATUS_META[status].plural,
    value: status,
  })),
];

/** Los órdenes que el índice de Pimia sabe hacer, con nombre de persona. */
const SORT_OPTIONS: Array<{
  label: string;
  sort: PimiaEstimateSort;
  value: string;
}> = [
  {
    label: "Más recientes",
    sort: { direction: "desc", field: "estimate_date" },
    value: "recientes",
  },
  {
    label: "Más antiguos",
    sort: { direction: "asc", field: "estimate_date" },
    value: "antiguos",
  },
  {
    label: "Caducan antes",
    sort: { direction: "asc", field: "expiry_date" },
    value: "caducan",
  },
  {
    label: "Importe: mayor primero",
    sort: { direction: "desc", field: "total" },
    value: "importe-desc",
  },
  {
    label: "Importe: menor primero",
    sort: { direction: "asc", field: "total" },
    value: "importe-asc",
  },
];

const PAGE_SIZES = [25, 50, 100];

function sortValue(sort: PimiaEstimateSort): string {
  return (
    SORT_OPTIONS.find(
      (option) =>
        option.sort.field === sort.field &&
        option.sort.direction === sort.direction,
    )?.value ?? "personalizado"
  );
}

export function PimiaEstimatesScreen() {
  const tenant = useActivePimiaTenant();
  const [status, setStatus] = React.useState<PimiaEstimateStatus | undefined>();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [range, setRange] = React.useState<PimiaDateRangePreset>("any");
  const [sort, setSort] = React.useState<PimiaEstimateSort>({
    direction: "desc",
    field: "estimate_date",
  });
  const [pageSize, setPageSize] = React.useState(PAGE_SIZES[0]);
  const [page, setPage] = React.useState(1);
  const { goPimiaCustomer, goPimiaEstimate, goPimiaPath } = useAppNavigation();

  // La búsqueda va contra la API del tenant, no contra una lista en memoria:
  // una petición por tecla es una petición por tecla.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const dateRange = React.useMemo(
    () => resolveDateRange(range, new Date()),
    [range],
  );

  const query = usePimiaEstimatesQuery({
    fromDate: dateRange.fromDate,
    limit: pageSize,
    orderBy: sort.direction,
    orderByField: sort.field,
    page,
    search,
    status,
    toDate: dateRange.toDate,
  });

  // Recuentos por estado. `limit: 1` porque solo se lee el total del
  // paginador: no hace falta traerse las filas para contarlas.
  const sentQuery = usePimiaEstimatesQuery({ limit: 1, status: "SENT" });
  const viewedQuery = usePimiaEstimatesQuery({ limit: 1, status: "VIEWED" });
  const acceptedQuery = usePimiaEstimatesQuery({
    limit: 1,
    status: "ACCEPTED",
  });
  const expiredQuery = usePimiaEstimatesQuery({ limit: 1, status: "EXPIRED" });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const estimates = query.data?.estimates ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCount = query.data?.totalCount ?? null;
  /* El «Total en pantalla» del pie, en ESTRICTO.
   *
   * ⚠️ Hasta el 2026-08-18 esto era un `reduce` con `?? 0`, y ese `?? 0` no
   * daba un total «casi bueno»: daba uno **más pequeño que el real con
   * exactamente el mismo aspecto que el bueno**. Un `total` que `readCents` no
   * supo leer entraba en la suma valiendo cero y salía invisible — sin signo,
   * sin color, sin una cifra rara que invitara a mirar dos veces. Y se pintaba
   * en el pie de la misma tabla donde esa fila ya estaba enseñando su raya, así
   * que la tabla se contradecía a sí misma y ganaba la mentira, porque el pie es
   * lo que la gente copia.
   *
   * `sumStrict` devuelve `null` en cuanto un sumando no es un número finito, y
   * con `null` la lista **esconde el pie entero** (el porqué de esconderlo en
   * vez de rayarlo está en el docblock de `totalCents` en `PimiaEstimateList`).
   *
   * Sobre el `?? []` de arriba: `sumStrict` suma `0` para una lista vacía, que
   * es el total honesto de una lista sin sumandos, pero `estimates` también está
   * vacía **mientras la petición vuela**. Aquí no engaña porque toda la tarjeta
   * de la tabla —pie incluido— cuelga de `estimates.length > 0`: ese `0` no
   * llega nunca a pintarse. */
  const totalCents = sumStrict(
    estimates.map((estimate) => estimate.totalCents),
  );

  const count = (value: number | null | undefined) =>
    typeof value === "number" ? String(value) : "—";
  /* «Sin respuesta» son dos peticiones distintas, y por eso se suman con la
   * misma regla que los importes: si una de las dos no ha vuelto (`undefined`)
   * o el servidor no mandó su total (`null`), el resultado es `null` y `count()`
   * pinta la raya. Contar la que falta como 0 daría una cifra menor que la real
   * —«3 sin respuesta» cuando son 11— indistinguible de la buena. */
  const awaiting = sumStrict([
    sentQuery.data?.totalCount,
    viewedQuery.data?.totalCount,
  ]);
  const hasFilters = Boolean(search || status || range !== "any");

  return (
    // El panel no scrollea como un documento: la cabecera, los totales y los
    // filtros se quedan, y el scroll vive dentro de la tarjeta de la tabla para
    // que el pie de paginación descanse siempre en su base.
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-6">
      <PimiaPageHeader
        description="Presupuestos emitidos, su estado y lo que hay en juego."
        title="Presupuestos"
      />

      <PimiaStatCards
        stats={[
          {
            hint: "en el tenant",
            label: "Emitidos",
            value: count(query.data?.companyTotalCount),
          },
          {
            hint: "enviados o vistos",
            label: "Sin respuesta",
            value: count(awaiting),
          },
          {
            hint: "listos para facturar",
            label: "Aceptados",
            value: count(acceptedQuery.data?.totalCount),
          },
          {
            hint: "fuera de plazo",
            label: "Caducados",
            value: count(expiredQuery.data?.totalCount),
          },
        ]}
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
      >
        <>
          <Select
            onValueChange={(value) => {
              setRange(value as PimiaDateRangePreset);
              setPage(1);
            }}
            value={range}
          >
            <SelectTrigger
              className="h-9 w-44"
              data-testid="pimia-estimate-range"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_PRESETS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {DATE_RANGE_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => {
              const option = SORT_OPTIONS.find(
                (candidate) => candidate.value === value,
              );
              if (option) {
                setSort(option.sort);
                setPage(1);
              }
            }}
            value={sortValue(sort)}
          >
            <SelectTrigger
              className="h-9 w-52"
              data-testid="pimia-estimate-sort"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      </PimiaFilterBar>

      {query.isPending ? <PimiaRowsSkeleton /> : null}
      {query.isError ? (
        <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : null}

      {query.isSuccess && estimates.length === 0 ? (
        <PimiaEmpty
          action={
            hasFilters ? null : (
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
            hasFilters
              ? "Prueba a quitar el filtro o a buscar otra cosa."
              : "Se emiten desde la ficha del cliente. Los que emitas aparecerán aquí con su estado y su importe."
          }
          title={
            hasFilters
              ? "Ningún presupuesto coincide"
              : "Todavía no hay presupuestos"
          }
        />
      ) : null}

      {estimates.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto transition-opacity",
              query.isFetching && "opacity-60",
            )}
          >
            <PimiaEstimateList
              estimates={estimates}
              onOpen={(id) => void goPimiaEstimate(id)}
              onOpenCustomer={(customerId) => void goPimiaCustomer(customerId)}
              onSortChange={(next) => {
                setSort(next);
                setPage(1);
              }}
              sort={sort}
              totalCents={totalCents}
            />
          </div>
          <PimiaPagination
            isBusy={query.isFetching}
            lastPage={lastPage}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            page={page}
            pageSize={pageSize}
            pageSizes={PAGE_SIZES}
            shown={estimates.length}
            total={totalCount}
          />
        </div>
      ) : null}
    </div>
  );
}
