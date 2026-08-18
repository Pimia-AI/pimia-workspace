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
 *
 * ⚠️ **Las fechas pasan por `ui/pimiaDates`, no por `new Date()`.** Hasta el
 * 2026-08-18 esta ficha tenía su propio `formatDate` con un `new Date(value)`
 * sobre el `YYYY-MM-DD` de la API, que es **medianoche UTC**: al oeste de
 * Greenwich el «Vencimiento» se escribía un día antes del real. Y la ficha era
 * el peor sitio para que pasara, porque la tabla tenía su propio `formatDate`
 * con la misma avería pero **otro formato**, así que el mismo presupuesto podía
 * enseñar dos días distintos según por dónde se mirase y ninguno de los dos
 * delataba al otro. Ahora las dos pantallas comparten el mismo montaje a
 * mediodía local y solo cambia el largo del mes: `formatIsoDateLong` aquí, donde
 * sobra sitio, y `formatIsoDateShort` en la tabla, que compite por el ancho.
 */

import * as React from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Copy, User } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type {
  PimiaEstimateLine,
  PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import { resolveDocumentTaxes, taxLabel } from "@/features/pimia/lib/taxes";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaEstimateQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaAmount,
  PimiaAmountCell,
} from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateLong } from "@/features/pimia/ui/pimiaDates";
import { PimiaEstimateActions } from "@/features/pimia/ui/PimiaEstimateActions";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaEstimateStatusBadge } from "@/features/pimia/ui/PimiaStatusBadge";
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

/**
 * Una tarjeta de datos con sus pares etiqueta-valor, como las dos que el panel
 * de Pimia pone en la cabecera de un presupuesto.
 */
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
 * Los impuestos de una celda: el nombre a la izquierda y el importe a la
 * derecha, en columna. Puestos en una sola cadena («IVA 21% 525,00 €») el ojo
 * no encuentra dónde empieza el dinero, que es justo lo que hay que poder
 * comparar entre líneas.
 *
 * ⚠️ El importe sale por `PimiaAmount`, no por `formatCents`. El `amountCents`
 * de un impuesto de línea es `number | null` —`readCents` devuelve `null`
 * cuando el `amount` del impuesto llega en una forma que no sabe leer— y el
 * `?? 0` que había aquí hasta el 2026-08-18 lo pintaba «0,00 €» en la columna
 * de Impuestos. Un IVA que de verdad vale cero y un IVA que no se pudo leer se
 * veían carácter por carácter igual, y el de cero es el que invita a pensar en
 * una exención y a no volver a mirar.
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
 * Una línea del desglose. Cada una solo aparece si el concepto viene en el
 * documento —quien llama decide eso—, pero el importe **entra como
 * `number | null`** y baja tal cual a `PimiaAmount`, que ya sabe que un hueco
 * se pinta con una raya y no con un cero.
 *
 * ⚠️ Hasta el 2026-08-18 el tipo era `number` a secas, y por eso los llamantes
 * se lo daban con un `?? 0` — incluido el «Total» en negrita de la ficha. Esa
 * anotación era la que mataba el hueco: un presupuesto cuyo `total` llega en
 * una forma que `readCents` no sabe leer se pintaba «—» en la fila de la lista,
 * desaparecía del pie «Total en pantalla»… y al abrir la ficha el usuario leía
 * **«Total 0,00 €»** en cuerpo grande. La cifra más mirada de las tres era la
 * única que seguía mintiendo, y como mentía con el aspecto exacto de un dato
 * bueno, nadie tenía motivo para ir a contrastarla con las otras dos.
 *
 * El `emphasis` manda en el tamaño y en el peso, nunca en el color del hueco:
 * `PimiaAmount` pone su `text-muted-foreground` **después** del `className`, así
 * que un total ilegible sale grande pero apagado. Se ve que falta; no se lee
 * como un dato enfático.
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
  const documentTaxes = resolveDocumentTaxes(
    estimate?.taxes ?? null,
    estimate?.lines ?? null,
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6">
      {query.isPending ? <PimiaRowsSkeleton rows={4} /> : null}

      {estimate ? (
        <>
          <PimiaPageHeader
            action={
              // La acción primaria la decide el estado del documento
              // (`PimiaEstimateActions`), así que «ver el cliente» baja al
              // menú: dos botones compitiendo por el mismo sitio dejan de
              // decir cuál es el siguiente paso.
              <div className="flex items-center gap-2">
                <PimiaEstimateActions
                  estimate={estimate}
                  navigationItems={
                    <>
                      {estimate.customerId ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            void goPimiaCustomer(estimate.customerId as string)
                          }
                        >
                          <User className="h-4 w-4" />
                          Ver el cliente
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onSelect={() => {
                          void navigator.clipboard?.writeText(
                            estimate.estimateNumber,
                          );
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Copiar el número
                      </DropdownMenuItem>
                    </>
                  }
                  showPrimaryAction
                />
              </div>
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

          <div className="flex shrink-0 flex-col gap-4 lg:flex-row">
            <FieldCard
              rows={[
                { label: "Número", value: estimate.estimateNumber },
                {
                  label: "Fecha",
                  value: formatIsoDateLong(estimate.estimateDate),
                },
                {
                  label: "Vencimiento",
                  value: formatIsoDateLong(estimate.expiryDate),
                },
                {
                  label: "Referencia",
                  value: estimate.referenceNumber ?? "—",
                },
              ]}
              title="Presupuesto"
            />
            <FieldCard
              rows={[
                { label: "Cliente", value: estimate.customerName ?? "—" },
                { label: "Email", value: estimate.customerEmail ?? "—" },
                { label: "Teléfono", value: estimate.customerPhone ?? "—" },
              ]}
              title="Cliente"
            />
          </div>

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
              {/* Uno por uno: el IVA y la retención de IRPF sumados dan un
                  neto que esconde las dos. Si el documento los lleva por
                  línea, se agregan de ahí — igual que hace el panel.

                  El importe baja sin `?? 0`, y desde el 2026-08-18 el hueco
                  está cerrado **también río arriba**: `resolveDocumentTaxes`
                  (`lib/taxes.ts`) agrega con `sumStrict`, así que un importe
                  ilegible deja el total de ESE impuesto en `null` en vez de
                  disolverse en un cero. Antes solo se conservaba cuando el
                  impuesto aparecía en una única línea, o sea que el mismo
                  documento mentía o no según cuántas líneas tuviera. */}
              {documentTaxes.length > 0 ? (
                documentTaxes.map((tax) => (
                  <TotalsRow
                    amountCents={tax.amountCents}
                    key={tax.id}
                    label={taxLabel(tax)}
                  />
                ))
              ) : estimate.taxCents !== null ? (
                <TotalsRow amountCents={estimate.taxCents} label="Impuestos" />
              ) : null}
              <div className="border-t border-border pt-2">
                <TotalsRow
                  amountCents={estimate.totalCents}
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
