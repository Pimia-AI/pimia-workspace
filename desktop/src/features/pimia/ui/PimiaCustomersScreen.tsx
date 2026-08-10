/**
 * Clientes — el primer paso del corte vertical de la Fase 1
 * (clientes → detalle → presupuestos).
 *
 * Misma anatomía que Presupuestos: cabecera, fila de filtros, tabla densa y
 * pie con el recuento. Aquí la fila entera es el enlace al detalle, así que va
 * como botón y no como celda con enlace dentro.
 */

import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaCustomersQuery } from "@/features/pimia/hooks/usePimiaResources";
import { PimiaAmountCell } from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { cn } from "@/shared/lib/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

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

  const query = usePimiaCustomersQuery({ limit: PAGE_SIZE, page, search });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const customers = query.data?.customers ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCount = query.data?.totalCount ?? null;

  return (
    // El panel no scrollea como un documento: la cabecera y el buscador se
    // quedan, y el scroll vive dentro de la tarjeta de la tabla para que el pie
    // de paginación descanse siempre en su base.
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-6">
      <PimiaPageHeader
        description="La cartera del tenant y lo que cada cliente tiene pendiente."
        title="Clientes"
      />

      <PimiaFilterBar
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar por nombre o email"
        searchTestId="pimia-customer-search"
        searchValue={searchInput}
      />

      {query.isPending ? <PimiaRowsSkeleton /> : null}
      {query.isError ? (
        <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : null}

      {query.isSuccess && customers.length === 0 ? (
        <PimiaEmpty
          description={
            search
              ? `Ningún cliente coincide con «${search}».`
              : "Los clientes que des de alta en Pimia aparecerán aquí."
          }
          title={search ? "Sin coincidencias" : "Todavía no hay clientes"}
        />
      ) : null}

      {customers.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto transition-opacity",
              query.isFetching && "opacity-60",
            )}
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {/* El nombre se queda con el sobrante; las demás miden lo que
                    mide su contenido. */}
                  <TableHead className="w-full pl-3">Cliente</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="w-40">NIF / CIF</TableHead>
                  <TableHead className="w-40 pr-3 text-right">
                    Pendiente
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow className="group" key={customer.id}>
                    <TableCell className="max-w-0 truncate pl-3">
                      {/* El nombre es el enlace al detalle: un botón de verdad,
                        para que el teclado llegue igual que el ratón. */}
                      <button
                        className="max-w-full truncate rounded-sm text-left font-medium text-foreground outline-hidden group-hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`pimia-customer-${customer.id}`}
                        onClick={() => void goPimiaCustomer(customer.id)}
                        type="button"
                      >
                        {customer.name}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {customer.email ?? customer.phone ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-muted-foreground">
                      {customer.taxId ?? "—"}
                    </TableCell>
                    <PimiaAmountCell
                      cents={customer.dueAmountCents}
                      className="pr-3"
                    />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PimiaPagination
            isBusy={query.isFetching}
            lastPage={lastPage}
            onPageChange={setPage}
            page={page}
            pageSize={PAGE_SIZE}
            shown={customers.length}
            total={totalCount}
          />
        </div>
      ) : null}
    </div>
  );
}
