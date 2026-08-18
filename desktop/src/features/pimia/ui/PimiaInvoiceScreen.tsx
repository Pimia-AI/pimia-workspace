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
 *
 * ⚠️ **Las fechas se escriben con `formatIsoDateLong` y nunca con `new Date()`.**
 * Hasta el 2026-08-18 esta ficha tenía su propio `formatDate` con
 * `new Date("2026-08-18")`, que no es el 18 de agosto: es **medianoche UTC** del
 * 18, y al oeste de Greenwich cae en el día anterior. En una factura eso no es
 * cosmético — la fecha de emisión decide el trimestre en el que declara y la de
 * vencimiento decide desde cuándo se deben intereses de demora—, y una fecha
 * corrida un día tiene exactamente el mismo aspecto que la buena. Encima el
 * mismo fallo vivía duplicado en `PimiaInvoiceList` con otro formato de mes, así
 * que una factura de fin de mes podía leerse «01 sep» en la tabla y «31 de
 * agosto» aquí. Las dos entran ya por `ui/pimiaDates.ts`, que monta el día a
 * mediodía local. Como allí, una cadena que no sea `YYYY-MM-DD` se enseña en
 * crudo en vez de adivinarle un formato.
 */

import * as React from "react";
import type { ReactNode } from "react";
import { ArrowLeft, User } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type {
  PimiaEstimateLine,
  PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import { hasAeatState, isAeatUrgent } from "@/features/pimia/api/invoices";
import { resolveDocumentTaxes, taxLabel } from "@/features/pimia/lib/taxes";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaInvoiceQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaAmount,
  PimiaAmountCell,
} from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateLong } from "@/features/pimia/ui/pimiaDates";
import { PimiaInvoiceActions } from "@/features/pimia/ui/PimiaInvoiceActions";
import { PimiaInvoiceVeriFactu } from "@/features/pimia/ui/PimiaInvoiceVeriFactu";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import {
  PimiaInvoicePaidBadge,
  PimiaInvoiceStatusBadge,
  PimiaVeriFactuBadge,
} from "@/features/pimia/ui/PimiaStatusBadge";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

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

/**
 * Los impuestos de UNA línea, en la celda estrecha de la tabla.
 *
 * `PimiaEstimateTax.amountCents` es `number | null` —`normalizeTaxes` lo llena
 * con `readCents(raw.amount)`, que se rinde en cuanto el importe no viene como
 * entero de céntimos—, así que el hueco se deja pasar hasta `PimiaAmount` en vez
 * de formatearlo como cero. Un IVA ilegible escrito «0,00 €» afirma que esta
 * línea no lleva impuesto, y la etiqueta de al lado, que sigue diciendo «IVA
 * 21%», demuestra que esa afirmación es falsa: la fila se contradice a sí misma
 * y aun así se lee como una cifra buena.
 *
 * Que la colección entera venga a `null` o vacía se pinta con la misma raya: a
 * este nivel de detalle la tabla no separa «no lleva impuestos» de «no vinieron
 * con la ficha», y no merece un tercer símbolo.
 */
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
          <PimiaAmount
            cents={tax.amountCents}
            className="whitespace-nowrap text-right text-foreground"
          />
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * Una fila del desglose: la etiqueta a la izquierda, el importe a la derecha.
 *
 * ⚠️ **`amountCents` admite `null` a propósito y ese `null` tiene que llegar
 * entero hasta `PimiaAmount`.** Hasta el 2026-08-18 el tipo era `number`, y el
 * «Total» en negrita de más abajo llamaba con `invoice.totalCents ?? 0`: el
 * hueco moría en el llamante, antes de que la celda de dinero —que sí sabe
 * distinguirlo— pudiera pintar la raya.
 *
 * Y el hueco no es teórico —pero ojo con contarlo mal, que es fácil—.
 * `readCents` **sí** lee la cadena decimal que este ERP manda hoy (`"1000.00"`
 * → 1000: un `decimal:2` de un entero siempre acaba en ceros). Lo que devuelve
 * `null` es un decimal con céntimos de verdad (`"1234.56"`), porque eso ya
 * sería otra unidad y adivinarla es justo el error que `lib/money.ts` existe
 * para no cometer. O sea que el hueco aparece cuando el servidor **cambia la
 * forma** de un importe sin avisar, y `due_amount` ya demostró que eso pasa: el
 * mismo dinero viaja como entero en un recurso y como cadena en otro.
 *
 * El día que pase, la misma factura pintaba «—» en la fila de la lista, se le
 * caía el pie «Total en pantalla»... y aquí, en el sitio donde más se mira,
 * decía «Total 0,00 €» en negrita. «Debe cero» y «no se pudo leer lo que debe»
 * son dos hechos distintos, y en una factura confundirlos es peor que en
 * ninguna otra pantalla: quien lo lee da el documento por saldado.
 *
 * Por eso aquí no hay ni un `?? 0`. Quien no tiene importe manda `null`,
 * `PimiaAmount` pinta la raya apagada, y el énfasis del total no se la enciende
 * —esa es la decisión 2 de `PimiaAmountCell`—, así que un dato que falta no se
 * lee nunca como un dato enfático.
 */
function TotalsRow({
  amountCents,
  emphasis,
  label,
}: {
  amountCents: number | null;
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
              <div className="flex items-center gap-2">
                <PimiaInvoiceActions
                  invoice={invoice}
                  navigationItems={
                    invoice.customerId ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          void goPimiaCustomer(invoice.customerId as string)
                        }
                      >
                        <User className="h-4 w-4" />
                        Ver el cliente
                      </DropdownMenuItem>
                    ) : null
                  }
                  showPrimaryAction
                />
              </div>
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
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <PimiaInvoiceStatusBadge status={invoice.status} />
                {invoice.status !== "DRAFT" ? (
                  <PimiaInvoicePaidBadge
                    isOverdue={invoice.isOverdue}
                    paidStatus={invoice.paidStatus}
                  />
                ) : null}
                {/* El tercer eje, a la misma altura que los otros dos: el
                    estado ante la AEAT se lee de un vistazo, y el bloque de
                    abajo solo añade la prueba o el arreglo. */}
                {hasAeatState(invoice.aeatStatus) ? (
                  <PimiaVeriFactuBadge status={invoice.aeatStatus as string} />
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

          {/* Un registro rechazado o en error es lo más urgente de la página:
              sube aquí, como el bloque tintado del panel. Lo que salió bien
              baja con el resto — la insignia de arriba ya lo dice. */}
          {isAeatUrgent(invoice.aeatStatus) ? (
            <PimiaInvoiceVeriFactu invoice={invoice} />
          ) : null}

          <div className="flex shrink-0 flex-col gap-4 lg:flex-row">
            <FieldCard
              rows={[
                {
                  label: "Número",
                  value: invoice.invoiceNumber ?? "Se asigna al publicar",
                },
                {
                  label: "Fecha",
                  value: formatIsoDateLong(invoice.invoiceDate),
                },
                {
                  label: "Vencimiento",
                  value: formatIsoDateLong(invoice.dueDate),
                },
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
                  // El hueco pasa tal cual, y desde el 2026-08-18 llega honesto
                  // por las DOS ramas de `resolveDocumentTaxes`: la de cabecera
                  // se devuelve intacta, y la que agrega de las líneas (el caso
                  // `tax_per_item`) suma con `sumStrict`, así que un IVA
                  // ilegible llega como `null` y esta fila pinta su raya en vez
                  // de un cero que nadie podría discutir.
                  <TotalsRow
                    amountCents={tax.amountCents}
                    key={tax.id}
                    label={taxLabel(tax)}
                  />
                ))
              ) : invoice.taxCents !== null ? (
                <TotalsRow amountCents={invoice.taxCents} label="Impuestos" />
              ) : null}
              <div className="border-t border-border pt-2">
                <TotalsRow
                  amountCents={invoice.totalCents}
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

          {!isAeatUrgent(invoice.aeatStatus) ? (
            <PimiaInvoiceVeriFactu invoice={invoice} />
          ) : null}

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
