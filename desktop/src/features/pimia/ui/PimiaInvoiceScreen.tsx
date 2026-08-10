/**
 * La ficha de una factura — el molde de `PimiaEstimateScreen`, con las
 * diferencias que el documento impone:
 *
 * - **Un borrador no tiene número**: el título lo dice («Borrador») en vez de
 *   fingir un identificador. El número aparece al publicar y desde entonces es
 *   el título, como en el presupuesto.
 * - **Dos insignias**: estado del documento y estado del cobro.
 * - **El desglose termina en lo pendiente**, no en el total: en una factura la
 *   pregunta es cuánto falta por cobrar.
 *
 * Como su molde, esta pantalla no recalcula nada: importes, vencimiento y
 * deuda llegan del servidor y se pintan tal cual.
 */

import * as React from "react";
import type { ReactNode } from "react";
import { ArrowLeft, User } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type {
  PimiaEstimateLine,
  PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import { formatCents } from "@/features/pimia/lib/money";
import { resolveDocumentTaxes, taxLabel } from "@/features/pimia/lib/taxes";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaInvoiceQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaAmount,
  PimiaAmountCell,
} from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import {
  PimiaInvoicePaidBadge,
  PimiaInvoiceStatusBadge,
} from "@/features/pimia/ui/PimiaStatusBadge";
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

function formatQuantity(line: PimiaEstimateLine) {
  if (line.quantity === null) {
    return "—";
  }
  const quantity = line.quantity.toLocaleString("es-ES", {
    maximumFractionDigits: 3,
  });
  return line.unitName ? `${quantity} ${line.unitName}` : quantity;
}

function FieldCard({
  rows,
  title,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
  title: string;
}) {
  return (
    <section className="min-w-0 flex-1 rounded-lg border border-border">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
        {title}
      </h2>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div
            className="flex items-baseline justify-between gap-4 px-4 py-2.5"
            key={row.label}
          >
            <dt className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd className="min-w-0 truncate text-sm text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TaxLines({ taxes }: { taxes: PimiaEstimateTax[] | null }) {
  if (!taxes || taxes.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {taxes.map((tax) => (
        <React.Fragment key={tax.id}>
          <span className="whitespace-nowrap text-muted-foreground">
            {taxLabel(tax)}
          </span>
          <span className="whitespace-nowrap text-right tabular-nums text-foreground">
            {formatCents(tax.amountCents ?? 0)}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

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

export function PimiaInvoiceScreen({ invoiceId }: { invoiceId: string }) {
  const tenant = useActivePimiaTenant();
  const { goPimiaCustomer, goPimiaPath } = useAppNavigation();
  const query = usePimiaInvoiceQuery(invoiceId);

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  if (query.isError) {
    return (
      <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
    );
  }

  const invoice = query.data;
  const lines = invoice?.lines ?? [];
  const documentTaxes = resolveDocumentTaxes(
    invoice?.taxes ?? null,
    invoice?.lines ?? null,
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      {query.isPending ? <PimiaRowsSkeleton rows={4} /> : null}

      {invoice ? (
        <>
          <PimiaPageHeader
            action={
              invoice.customerId ? (
                <Button
                  onClick={() =>
                    void goPimiaCustomer(invoice.customerId as string)
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
                onClick={() => void goPimiaPath("/pimia/facturas")}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
                Facturas
              </Button>
            }
            description={invoice.customerName ?? undefined}
            meta={
              <span className="flex flex-wrap items-center gap-1.5">
                <PimiaInvoiceStatusBadge status={invoice.status} />
                {invoice.status !== "DRAFT" ? (
                  <PimiaInvoicePaidBadge
                    isOverdue={invoice.isOverdue}
                    paidStatus={invoice.paidStatus}
                  />
                ) : null}
              </span>
            }
            title={
              invoice.invoiceNumber ? (
                <span className="font-mono">{invoice.invoiceNumber}</span>
              ) : (
                // Sin fingir identificadores: el número existe al publicar.
                "Borrador"
              )
            }
          />

          <div className="flex shrink-0 flex-col gap-4 lg:flex-row">
            <FieldCard
              rows={[
                {
                  label: "Número",
                  value: invoice.invoiceNumber ?? "Se asigna al publicar",
                },
                { label: "Fecha", value: formatDate(invoice.invoiceDate) },
                { label: "Vencimiento", value: formatDate(invoice.dueDate) },
                {
                  label: "Referencia",
                  value: invoice.referenceNumber ?? "—",
                },
              ]}
              title={invoice.isCreditNote ? "Factura rectificativa" : "Factura"}
            />
            <FieldCard
              rows={[
                { label: "Cliente", value: invoice.customerName ?? "—" },
                { label: "Email", value: invoice.customerEmail ?? "—" },
                { label: "Teléfono", value: invoice.customerPhone ?? "—" },
              ]}
              title="Cliente"
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Líneas</h2>
            {invoice.lines === null || lines.length === 0 ? (
              <PimiaEmpty
                description="La factura no tiene conceptos, o el servidor no los devolvió con la ficha."
                title="Sin líneas"
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table data-testid="pimia-invoice-lines">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-full pl-3">Concepto</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">
                        Cantidad
                      </TableHead>
                      <TableHead className="w-32 whitespace-nowrap text-right">
                        Precio
                      </TableHead>
                      <TableHead className="w-52 whitespace-nowrap">
                        Impuestos
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
                        <TableCell className="py-2.5">
                          <TaxLines taxes={line.taxes} />
                        </TableCell>
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
              {invoice.subTotalCents !== null ? (
                <TotalsRow
                  amountCents={invoice.subTotalCents}
                  label="Base imponible"
                />
              ) : null}
              {invoice.discountCents ? (
                <TotalsRow
                  amountCents={-invoice.discountCents}
                  label="Descuento"
                />
              ) : null}
              {documentTaxes.length > 0 ? (
                documentTaxes.map((tax) => (
                  <TotalsRow
                    amountCents={tax.amountCents ?? 0}
                    key={tax.id}
                    label={taxLabel(tax)}
                  />
                ))
              ) : invoice.taxCents !== null ? (
                <TotalsRow amountCents={invoice.taxCents} label="Impuestos" />
              ) : null}
              <div className="border-t border-border pt-2">
                <TotalsRow
                  amountCents={invoice.totalCents ?? 0}
                  emphasis
                  label="Total"
                />
              </div>
              {/* La pregunta de una factura: cuánto falta. Solo si hay deuda
                  parcial — con todo pendiente o todo cobrado, el total y la
                  insignia ya lo dicen. */}
              {invoice.dueCents !== null &&
              invoice.dueCents > 0 &&
              invoice.dueCents !== invoice.totalCents ? (
                <TotalsRow
                  amountCents={invoice.dueCents}
                  label="Pendiente de cobro"
                />
              ) : null}
            </div>
          </section>

          {invoice.notes ? (
            <section className="shrink-0 rounded-lg border border-border">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                Notas
              </h2>
              <p className="whitespace-pre-wrap p-4 text-sm text-muted-foreground">
                {invoice.notes}
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {query.isSuccess && !invoice ? (
        <PimiaEmpty
          description="Puede que el enlace esté caducado."
          title="No se encontró esa factura"
        />
      ) : null}
    </div>
  );
}
