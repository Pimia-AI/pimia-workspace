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
import { sumStrict } from "@/features/pimia/lib/money";
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
  /* El «Total en pantalla» del pie de la tabla, en ESTRICTO.
   *
   * ⚠️ Hasta el 2026-08-18 esto era un `reduce` con `?? 0` escrito en la propia
   * prop, y fue el pie que se quedó fuera del barrido: `PimiaEstimatesScreen` y
   * `PimiaInvoicesScreen` pasaron a `sumStrict` y este no, precisamente porque
   * estaba escondido dentro del JSX en vez de tener nombre aquí arriba.
   *
   * Muerde en la ficha de un cliente con tres presupuestos, uno de ellos con el
   * `total` en una forma que `readCents` no supo leer: la fila pinta su raya
   * —`PimiaAmountCell` ya lo hace— y justo debajo, en la MISMA tabla, el pie
   * afirmaba «Total en pantalla 3.000,00 €» cuando el real es mayor. La tabla se
   * contradecía a sí misma a dos centímetros de distancia, y ganaba la mentira,
   * porque el pie es la cifra que se copia a un correo. Y aquí más que en
   * ningún sitio: esto es lo que se le dice a ESE cliente que tiene contratado.
   *
   * `sumStrict` devuelve `null` en cuanto un sumando no es un número finito, y
   * con `null` la lista esconde el pie entero (el porqué de esconderlo en vez de
   * rayarlo está en el docblock de `totalCents` en `PimiaEstimateList`).
   *
   * Sobre la lista vacía: `sumStrict` suma `0` cuando no hay sumandos, que es el
   * total honesto de una lista sin filas, pero `estimates` también está vacía
   * mientras la petición vuela. Aquí ese `0` no llega a pintarse nunca porque la
   * tabla entera —pie incluido— cuelga de `estimates.length > 0`. */
  const totalCents = sumStrict(
    estimates.map((estimate) => estimate.totalCents),
  );

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
                  totalCents={totalCents}
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
