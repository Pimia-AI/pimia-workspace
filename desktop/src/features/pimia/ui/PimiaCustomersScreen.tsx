/**
 * Clientes — el primer paso del corte vertical de la Fase 1
 * (clientes → detalle → presupuestos).
 */

import * as React from "react";
import { Search } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { formatCents } from "@/features/pimia/lib/money";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaCustomersQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/PageHeader";

const PAGE_SIZE = 25;

export function PimiaCustomersScreen() {
  const tenant = useActivePimiaTenant();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const { goPimiaCustomer } = useAppNavigation();

  // Debounce: la búsqueda va contra la API del tenant, no contra una lista en
  // memoria; una petición por tecla es una petición por tecla.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = usePimiaCustomersQuery({ page, limit: PAGE_SIZE, search });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const customers = query.data?.customers ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <PageHeader
        description={
          query.data?.totalCount !== null &&
          query.data?.totalCount !== undefined
            ? `${query.data.totalCount} en ${tenant.label}`
            : tenant.label
        }
        title="Clientes"
      />

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="pl-9"
          data-testid="pimia-customer-search"
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nombre o email"
          value={searchInput}
        />
      </div>

      {query.isPending ? <PimiaRowsSkeleton /> : null}
      {query.isError ? (
        <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : null}

      {query.isSuccess && customers.length === 0 ? (
        <PimiaEmpty>
          {search
            ? `Ningún cliente coincide con «${search}».`
            : "Este tenant todavía no tiene clientes."}
        </PimiaEmpty>
      ) : null}

      {customers.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {customers.map((customer) => (
            <li key={customer.id}>
              <button
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                data-testid={`pimia-customer-${customer.id}`}
                onClick={() => void goPimiaCustomer(customer.id)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {customer.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {customer.email ?? customer.companyName ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm tabular-nums text-foreground">
                    {formatCents(customer.dueAmountCents ?? 0)}
                  </span>
                  <span className="block text-2xs text-muted-foreground">
                    pendiente
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
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
