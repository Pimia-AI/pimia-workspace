/**
 * Detalle de cliente — el segundo paso del corte vertical, y el punto donde
 * clientes y presupuestos se juntan.
 */

import * as React from "react";
import { ArrowLeft, Plus } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { formatCents } from "@/features/pimia/lib/money";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  usePimiaCustomerQuery,
  usePimiaEstimatesQuery,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaEstimateCreateDialog } from "@/features/pimia/ui/PimiaEstimateCreateDialog";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/PageHeader";

type DetailRow = {
  label: string;
  value: string | null;
};

function DetailGrid({ rows }: { rows: DetailRow[] }) {
  const visible = rows.filter((row) => row.value);
  if (visible.length === 0) {
    return null;
  }

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border p-4 sm:grid-cols-3">
      {visible.map((row) => (
        <div key={row.label}>
          <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
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
  const { goPimiaPath } = useAppNavigation();
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
      <Button
        className="w-fit -ml-2"
        onClick={() => void goPimiaPath("/pimia/clientes")}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="h-4 w-4" />
        Clientes
      </Button>

      {customerQuery.isPending ? <PimiaRowsSkeleton rows={3} /> : null}

      {customer ? (
        <>
          <PageHeader
            action={
              <Button
                data-testid="pimia-new-estimate"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Nuevo presupuesto
              </Button>
            }
            description={customer.companyName ?? customer.email ?? undefined}
            title={customer.name}
          />

          <DetailGrid
            rows={[
              { label: "Email", value: customer.email },
              { label: "Teléfono", value: customer.phone },
              { label: "Contacto", value: customer.contactName },
              { label: "NIF / CIF", value: customer.taxId },
              {
                label: "Pendiente",
                value: formatCents(customer.dueAmountCents ?? 0),
              },
            ]}
          />

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
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
              <PimiaEmpty>
                Este cliente todavía no tiene presupuestos.
              </PimiaEmpty>
            ) : null}
            {estimates.length > 0 ? (
              <PimiaEstimateList estimates={estimates} showCustomer={false} />
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
        <PimiaEmpty>No se encontró ese cliente.</PimiaEmpty>
      ) : null}
    </div>
  );
}
