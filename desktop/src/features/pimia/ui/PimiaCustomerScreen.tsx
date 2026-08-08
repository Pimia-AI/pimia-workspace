/**
 * Detalle de cliente — el segundo paso del corte vertical, y el punto donde
 * clientes y presupuestos se juntan.
 *
 * Patrón de ficha de la referencia: identidad y acciones arriba, secciones
 * tituladas debajo y los metadatos como pares etiqueta-valor. Lo que el
 * usuario viene a hacer aquí —emitir un presupuesto— es la acción primaria de
 * la cabecera, y también la salida del vacío.
 */

import * as React from "react";
import { ArrowLeft, Plus } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  usePimiaCustomerQuery,
  usePimiaEstimatesQuery,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaEstimateCreateDialog } from "@/features/pimia/ui/PimiaEstimateCreateDialog";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";

type DetailRow = {
  label: string;
  value: React.ReactNode;
};

/** Una sección con título, del patrón de ficha de la referencia. */
function PimiaCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailGrid({ rows }: { rows: DetailRow[] }) {
  const visible = rows.filter((row) => row.value);

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3">
      {visible.map((row) => (
        <div className="min-w-0 space-y-0.5" key={row.label}>
          <dt className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {row.label}
          </dt>
          <dd className="truncate text-sm text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PimiaCustomerScreen({ customerId }: { customerId: string }) {
  const tenant = useActivePimiaTenant();
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const { goPimiaEstimate, goPimiaPath } = useAppNavigation();
  const customerQuery = usePimiaCustomerQuery(customerId);
  const estimatesQuery = usePimiaEstimatesQuery({ customerId, limit: 50 });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  if (customerQuery.isError) {
    return (
      <PimiaErrorState
        error={customerQuery.error}
        onRetry={() => customerQuery.refetch()}
      />
    );
  }

  const customer = customerQuery.data;
  const estimates = estimatesQuery.data?.estimates ?? [];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      {customerQuery.isPending ? <PimiaRowsSkeleton rows={3} /> : null}

      {customer ? (
        <>
          <PimiaPageHeader
            action={
              <Button
                data-testid="pimia-new-estimate"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Nuevo presupuesto
              </Button>
            }
            back={
              <Button
                className="-ml-2 h-7 px-2 text-muted-foreground"
                onClick={() => void goPimiaPath("/pimia/clientes")}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
                Clientes
              </Button>
            }
            description={
              customer.companyName && customer.companyName !== customer.name
                ? customer.companyName
                : (customer.taxId ?? undefined)
            }
            title={customer.name}
          />

          <PimiaCard title="Ficha">
            <DetailGrid
              rows={[
                { label: "Email", value: customer.email },
                { label: "Teléfono", value: customer.phone },
                { label: "Contacto", value: customer.contactName },
                { label: "NIF / CIF", value: customer.taxId },
                {
                  label: "Pendiente",
                  value: (
                    <PimiaAmount
                      cents={customer.dueAmountCents}
                      className="font-medium"
                      dimZero
                    />
                  ),
                },
              ]}
            />
          </PimiaCard>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Presupuestos
            </h2>
            {estimatesQuery.isPending ? <PimiaRowsSkeleton rows={3} /> : null}
            {estimatesQuery.isError ? (
              <PimiaErrorState
                error={estimatesQuery.error}
                onRetry={() => estimatesQuery.refetch()}
              />
            ) : null}
            {estimatesQuery.isSuccess && estimates.length === 0 ? (
              <PimiaEmpty
                action={
                  <Button
                    onClick={() => setIsCreateOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                    Nuevo presupuesto
                  </Button>
                }
                description="Cuando emitas uno para este cliente aparecerá aquí."
                title="Sin presupuestos todavía"
              />
            ) : null}
            {estimates.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <PimiaEstimateList
                  estimates={estimates}
                  onOpen={(id) => void goPimiaEstimate(id)}
                  showCustomer={false}
                  totalCents={estimates.reduce(
                    (total, estimate) => total + (estimate.totalCents ?? 0),
                    0,
                  )}
                />
              </div>
            ) : null}
          </section>

          <PimiaEstimateCreateDialog
            customerId={customer.id}
            customerName={customer.name}
            onOpenChange={setIsCreateOpen}
            open={isCreateOpen}
          />
        </>
      ) : null}

      {customerQuery.isSuccess && !customer ? (
        <PimiaEmpty
          description="Puede que lo hayan borrado o que el enlace esté caducado."
          title="No se encontró ese cliente"
        />
      ) : null}
    </div>
  );
}
