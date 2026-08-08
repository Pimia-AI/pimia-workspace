/**
 * La ficha de un presupuesto.
 *
 * Patrón de detalle de la referencia: el número **es** el título, con su
 * estado al lado; los metadatos en pares etiqueta-valor; las líneas en una
 * tabla; y el desglose base → descuento → IVA → total al pie de esa tabla,
 * alineado con su columna de dinero.
 *
 * Lo que esta pantalla NO hace, y es a propósito: recalcular. Los importes se
 * pintan tal como los devuelve el servidor —incluida la suma— porque las
 * invariantes fiscales son suyas y una segunda aritmética aquí solo serviría
 * para discrepar de la factura de verdad.
 */

import type { ReactNode } from "react";
import { ArrowLeft, User } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { PimiaEstimateLine } from "@/features/pimia/api/estimates";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaEstimateQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaAmount,
  PimiaAmountCell,
} from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaEstimateStatusBadge } from "@/features/pimia/ui/PimiaStatusBadge";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** `2` → `2`; `2,5` → `2,5`. Sin decimales de adorno. */
function formatQuantity(line: PimiaEstimateLine) {
  if (line.quantity === null) {
    return "—";
  }
  const quantity = line.quantity.toLocaleString("es-ES", {
    maximumFractionDigits: 3,
  });
  return line.unitName ? `${quantity} ${line.unitName}` : quantity;
}

function FieldGrid({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3">
      {rows.map((row) => (
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

/** El desglose. Cada línea solo aparece si el servidor la manda con valor. */
function TotalsRow({
  amountCents,
  emphasis,
  label,
}: {
  amountCents: number;
  emphasis?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span
        className={
          emphasis
            ? "text-sm font-semibold text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </span>
      <PimiaAmount
        cents={amountCents}
        className={
          emphasis
            ? "text-lg font-semibold text-foreground"
            : "text-sm text-foreground"
        }
      />
    </div>
  );
}

export function PimiaEstimateScreen({ estimateId }: { estimateId: string }) {
  const tenant = useActivePimiaTenant();
  const { goPimiaCustomer, goPimiaPath } = useAppNavigation();
  const query = usePimiaEstimateQuery(estimateId);

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  if (query.isError) {
    return (
      <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
    );
  }

  const estimate = query.data;
  const lines = estimate?.lines ?? [];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      {query.isPending ? <PimiaRowsSkeleton rows={4} /> : null}

      {estimate ? (
        <>
          <PimiaPageHeader
            action={
              estimate.customerId ? (
                <Button
                  onClick={() =>
                    void goPimiaCustomer(estimate.customerId as string)
                  }
                  variant="outline"
                >
                  <User className="h-4 w-4" />
                  Ver el cliente
                </Button>
              ) : null
            }
            back={
              <Button
                className="-ml-2 h-7 px-2 text-muted-foreground"
                onClick={() => void goPimiaPath("/pimia/presupuestos")}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
                Presupuestos
              </Button>
            }
            description={estimate.customerName ?? undefined}
            meta={<PimiaEstimateStatusBadge status={estimate.status} />}
            title={<span className="font-mono">{estimate.estimateNumber}</span>}
          />

          <section className="shrink-0 rounded-lg border border-border">
            {/* El cliente no se repite aquí: ya está bajo el número. */}
            <FieldGrid
              rows={[
                { label: "Fecha", value: formatDate(estimate.estimateDate) },
                {
                  label: "Válido hasta",
                  value: formatDate(estimate.expiryDate),
                },
                {
                  label: "Referencia",
                  value: estimate.referenceNumber ?? "—",
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Líneas</h2>
            {estimate.lines === null || lines.length === 0 ? (
              <PimiaEmpty
                description="El presupuesto no tiene conceptos, o el servidor no los devolvió con la ficha."
                title="Sin líneas"
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table data-testid="pimia-estimate-lines">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-full pl-3">Concepto</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">
                        Cantidad
                      </TableHead>
                      <TableHead className="w-32 whitespace-nowrap text-right">
                        Precio
                      </TableHead>
                      <TableHead className="w-32 whitespace-nowrap pr-3 text-right">
                        Importe
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="max-w-0 py-2.5 pl-3">
                          <span className="block truncate font-medium text-foreground">
                            {line.name}
                          </span>
                          {line.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {line.description}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2.5 tabular-nums text-muted-foreground">
                          {formatQuantity(line)}
                        </TableCell>
                        <PimiaAmountCell
                          cents={line.priceCents}
                          className="py-2.5 font-normal text-muted-foreground"
                          dimZero={false}
                        />
                        <PimiaAmountCell
                          cents={line.totalCents}
                          className="py-2.5 pr-3"
                          dimZero={false}
                        />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="flex justify-end">
            <div className="w-full space-y-2 rounded-lg border border-border p-4 sm:w-80">
              {estimate.subTotalCents !== null ? (
                <TotalsRow
                  amountCents={estimate.subTotalCents}
                  label="Base imponible"
                />
              ) : null}
              {estimate.discountCents ? (
                <TotalsRow
                  amountCents={-estimate.discountCents}
                  label="Descuento"
                />
              ) : null}
              {estimate.taxCents !== null ? (
                <TotalsRow amountCents={estimate.taxCents} label="Impuestos" />
              ) : null}
              <div className="border-t border-border pt-2">
                <TotalsRow
                  amountCents={estimate.totalCents ?? 0}
                  emphasis
                  label="Total"
                />
              </div>
            </div>
          </section>

          {estimate.notes ? (
            <section className="shrink-0 rounded-lg border border-border">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                Notas
              </h2>
              <p className="whitespace-pre-wrap p-4 text-sm text-muted-foreground">
                {estimate.notes}
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {query.isSuccess && !estimate ? (
        <PimiaEmpty
          description="Puede que lo hayan borrado o que el enlace esté caducado."
          title="No se encontró ese presupuesto"
        />
      ) : null}
    </div>
  );
}
