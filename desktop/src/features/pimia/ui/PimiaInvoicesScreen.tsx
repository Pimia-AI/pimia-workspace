/**
 * Facturas — la réplica del patrón que fijó Presupuestos, con los dos ejes que
 * una factura tiene: el estado del documento (pestañas) y el del cobro (un
 * filtro aparte, porque en la API son claves independientes y se combinan).
 *
 * Las cifras de arriba son recuentos, no importes: la API tampoco publica
 * agregados de dinero de facturas, y sumar la página visible para llamarlo
 * total es el bug que el pase de diseño quitó del panel.
 */

import * as React from "react";

import {
  INVOICE_STATUSES,
  type PimiaInvoicePaidStatus,
  type PimiaInvoiceStatus,
} from "@/features/pimia/api/invoices";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
  type PimiaDateRangePreset,
} from "@/features/pimia/lib/dateRanges";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaInvoicesQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaInvoiceList,
  type PimiaInvoiceSort,
} from "@/features/pimia/ui/PimiaInvoiceList";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import { PimiaStatCards } from "@/features/pimia/ui/PimiaStatCards";
import { INVOICE_STATUS_META } from "@/features/pimia/ui/PimiaStatusBadge";
import { PimiaStatusTabs } from "@/features/pimia/ui/PimiaStatusTabs";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const ALL_TAB = "todas";
const ANY_PAID = "cualquiera";

const STATUS_TABS = [
  { label: "Todas", value: ALL_TAB },
  ...INVOICE_STATUSES.map((status) => ({
    label: INVOICE_STATUS_META[status].plural,
    value: status,
  })),
];

const PAID_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Cualquier cobro", value: ANY_PAID },
  { label: "Pendientes", value: "UNPAID" },
  { label: "Cobro parcial", value: "PARTIALLY_PAID" },
  { label: "Pagadas", value: "PAID" },
];

const SORT_OPTIONS: Array<{
  label: string;
  sort: PimiaInvoiceSort;
  value: string;
}> = [
  {
    label: "Más recientes",
    sort: { direction: "desc", field: "invoice_date" },
    value: "recientes",
  },
  {
    label: "Más antiguas",
    sort: { direction: "asc", field: "invoice_date" },
    value: "antiguas",
  },
  {
    label: "Vencen antes",
    sort: { direction: "asc", field: "due_date" },
    value: "vencen",
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

function sortValue(sort: PimiaInvoiceSort): string {
  return (
    SORT_OPTIONS.find(
      (option) =>
        option.sort.field === sort.field &&
        option.sort.direction === sort.direction,
    )?.value ?? "personalizado"
  );
}

export function PimiaInvoicesScreen() {
  const tenant = useActivePimiaTenant();
  const [status, setStatus] = React.useState<PimiaInvoiceStatus | undefined>();
  const [paidStatus, setPaidStatus] = React.useState<
    PimiaInvoicePaidStatus | undefined
  >();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [range, setRange] = React.useState<PimiaDateRangePreset>("any");
  const [sort, setSort] = React.useState<PimiaInvoiceSort>({
    direction: "desc",
    field: "invoice_date",
  });
  const [pageSize, setPageSize] = React.useState(PAGE_SIZES[0]);
  const [page, setPage] = React.useState(1);
  const { goPimiaCustomer, goPimiaInvoice } = useAppNavigation();

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

  const query = usePimiaInvoicesQuery({
    fromDate: dateRange.fromDate,
    limit: pageSize,
    orderBy: sort.direction,
    orderByField: sort.field,
    page,
    paidStatus,
    search,
    status,
    toDate: dateRange.toDate,
  });

  // Recuentos con los filtros VIRTUALES del servidor: `DUE` (pendientes de
  // cobro) y `OVERDUE` (vencidas) son valores de `status` que el modelo
  // resuelve él mismo — aquí no se calcula ningún vencimiento.
  const dueQuery = usePimiaInvoicesQuery({ limit: 1, status: "DUE" });
  const overdueQuery = usePimiaInvoicesQuery({ limit: 1, status: "OVERDUE" });
  const paidQuery = usePimiaInvoicesQuery({ limit: 1, paidStatus: "PAID" });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const invoices = query.data?.invoices ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCount = query.data?.totalCount ?? null;
  const totalCents = invoices.reduce(
    (total, invoice) => total + (invoice.totalCents ?? 0),
    0,
  );

  const count = (value: number | null | undefined) =>
    typeof value === "number" ? String(value) : "—";
  const hasFilters = Boolean(search || status || paidStatus || range !== "any");

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      <PimiaPageHeader
        description="Facturas emitidas, su estado y lo que queda por cobrar."
        title="Facturas"
      />

      <PimiaStatCards
        stats={[
          {
            hint: "en el tenant",
            label: "Emitidas",
            value: count(query.data?.companyTotalCount),
          },
          {
            hint: "con importe por cobrar",
            label: "Pendientes",
            value: count(dueQuery.data?.totalCount),
          },
          {
            hint: "fuera de plazo y sin cobrar",
            label: "Vencidas",
            value: count(overdueQuery.data?.totalCount),
          },
          {
            hint: "cobradas del todo",
            label: "Pagadas",
            value: count(paidQuery.data?.totalCount),
          },
        ]}
      />

      <PimiaStatusTabs
        onValueChange={(value) => {
          setStatus(
            value === ALL_TAB ? undefined : (value as PimiaInvoiceStatus),
          );
          setPage(1);
        }}
        options={STATUS_TABS}
        testIdPrefix="pimia-invoice-filter"
        value={status ?? ALL_TAB}
      />

      <PimiaFilterBar
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar por número o cliente"
        searchTestId="pimia-invoice-search"
        searchValue={searchInput}
      >
        <>
          <Select
            onValueChange={(value) => {
              setPaidStatus(
                value === ANY_PAID
                  ? undefined
                  : (value as PimiaInvoicePaidStatus),
              );
              setPage(1);
            }}
            value={paidStatus ?? ANY_PAID}
          >
            <SelectTrigger
              className="h-9 w-44"
              data-testid="pimia-invoice-paid"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAID_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => {
              setRange(value as PimiaDateRangePreset);
              setPage(1);
            }}
            value={range}
          >
            <SelectTrigger
              className="h-9 w-44"
              data-testid="pimia-invoice-range"
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
              data-testid="pimia-invoice-sort"
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

      {query.isSuccess && invoices.length === 0 ? (
        <PimiaEmpty
          description={
            hasFilters
              ? "Prueba a quitar el filtro o a buscar otra cosa."
              : "Las facturas que emitas —a mano o convirtiendo un presupuesto aceptado— aparecerán aquí con su estado y su cobro."
          }
          title={
            hasFilters ? "Ninguna factura coincide" : "Todavía no hay facturas"
          }
        />
      ) : null}

      {invoices.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <PimiaInvoiceList
            invoices={invoices}
            onOpen={(id) => void goPimiaInvoice(id)}
            onOpenCustomer={(customerId) => void goPimiaCustomer(customerId)}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            sort={sort}
            totalCents={totalCents}
          />
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
            shown={invoices.length}
            total={totalCount}
          />
        </div>
      ) : null}
    </div>
  );
}
