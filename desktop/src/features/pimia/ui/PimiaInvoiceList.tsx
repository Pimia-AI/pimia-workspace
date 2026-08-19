/**
 * La tabla de facturas — el mismo patrón denso que `PimiaEstimateList`, con lo
 * que una factura tiene y un presupuesto no:
 *
 * - **Un borrador no tiene número** (se asigna al publicar): la celda lo dice
 *   en apagado en vez de fingir un identificador.
 * - **Dos insignias**: el estado del documento y el del cobro. La de cobro
 *   solo aparece desde que la factura existe de verdad (publicada); a un
 *   borrador no se le debe nada.
 * - **El importe enseña debajo lo pendiente**, que es la cifra que se mira en
 *   una factura — la base ya la enseña la ficha.
 * - Las **rectificativas** se señalan junto al número, no se esconden. Y la
 *   factura corregida también, con una marca «Rectificada» que puede salir de
 *   dos sitios, porque el dato bueno no siempre está:
 *   1. `credit_notes_count`, que lo dice el servidor sin adivinar y además
 *      dice **cuántas**.
 *   2. La vieja **heurística** de que `effective_total` no coincida con
 *      `total`, para cuando el recuento no llega.
 *   ⚠️ En este índice el recuento no llega **nunca**: la lista pide
 *   `view=summary`, y esa vista ligera trae los `effective_*` pero no
 *   `credit_notes_count` (ni `rectified_invoice_number`: del enlace manda
 *   `rectified_invoice_id`, un id que no se le enseña a nadie). No es que el
 *   campo sea «opcional» —en el contrato está declarado sin `?`, es de los
 *   pocos atributos obligatorios del recurso—: es que **esta consulta no lo
 *   pide**. Por eso aquí manda la heurística. Acierta de casualidad —los dos
 *   importes también difieren por otras razones, y con uno ilegible
 *   (`readCents` → `null`) la comparación no dice nada y la marca desaparece
 *   sin más—, pero es el único indicio que la vista ligera trae, y callarse
 *   que una factura está rectificada es peor: quien mire la lista vería el
 *   importe nominal sin ninguna señal de que hay una rectificativa contra él.
 *   Donde el recuento sí llega —la ficha, que pide el recurso entero, o el día
 *   que alguien pase filas completas a esta tabla— manda él, y entonces la
 *   marca dice «2 rectificativas» donde la resta solo sabía que algo había
 *   cambiado. La cifra grande sigue siendo la nominal a propósito — es el
 *   importe legal del documento, y es por la que ordena el servidor; debajo va
 *   el neto.
 * - **La columna «Vence» avisa de lo que está por vencer**, que es la mitad que
 *   faltaba: la insignia de cobro dice «Vencida» (lo dicta el servidor) pero
 *   nada decía «vence en 3 días», y una lista en la que la que vence mañana se
 *   ve igual que la que vence en noviembre no sirve para cobrar. La regla vive
 *   en `lib/invoices.ts` con sus pruebas, compara **cadenas** de fecha y deja el
 *   rojo en manos del servidor; aquí solo se pinta.
 *   ⚠️ `today` **baja como prop**, no se calcula por fila: cien filas serían
 *   cien relojes, y podrían cruzar la medianoche a mitad de tabla.
 * - **Las fechas pasan por `formatIsoDateShort`**, nunca por `new Date(...)`.
 *   Hasta el 2026-08-18 esta tabla montaba la fecha con `new Date("2026-08-18")`,
 *   que no es el 18 de agosto sino **medianoche UTC** del 18: al oeste de
 *   Greenwich cae en el día anterior. En un lead eso es feo; en una factura la
 *   fecha de emisión y la de vencimiento son datos fiscales —deciden trimestre,
 *   plazo de cobro e intereses de demora—, y una tabla que las corre un día
 *   miente sobre el documento sin que nada lo delate: la fecha desplazada tiene
 *   el mismo aspecto que la buena. Peor todavía, la ficha tenía su propio
 *   `formatDate` con el mismo fallo pero otro formato de mes, así que la misma
 *   factura podía leerse «01 sep» en la tabla y «31 de agosto» en su ficha.
 *   Ahora las dos entran por `ui/pimiaDates.ts`, que monta el día a mediodía
 *   local — la hora que ningún huso ni cambio de horario saca de su fecha.
 *
 * ⚠️ `formatIsoDateShort` solo entiende `YYYY-MM-DD`; cualquier otra cosa la
 * devuelve **en crudo**, incluida una marca de tiempo completa. Es a propósito y
 * es un cambio de comportamiento respecto al `new Date()` de antes, que se
 * tragaba un `2026-08-18T00:00:00Z` y lo pintaba bonito (a veces con el día
 * corrido). Hoy `api/invoices.ts` pasa `invoice_date` y `due_date` tal cual
 * llegan y el servidor manda fecha pelada; el día que mande otra forma, esta
 * tabla la enseña fea en vez de adivinarla, que es como se descubre un contrato
 * nuevo en lugar de tragárselo.
 */

import { Copy, FileText, User } from "lucide-react";

import type {
  PimiaInvoice,
  PimiaInvoiceSortField,
} from "@/features/pimia/api/invoices";
import {
  invoiceDueWarning,
  isCollectableInvoice,
} from "@/features/pimia/lib/invoices";
import { formatCents } from "@/features/pimia/lib/money";
import { PimiaAmountCell } from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import {
  PimiaSortableHead,
  type PimiaSortState,
} from "@/features/pimia/ui/PimiaSortableHead";
import {
  PimiaInvoicePaidBadge,
  PimiaInvoiceStatusBadge,
} from "@/features/pimia/ui/PimiaStatusBadge";
import { PimiaInvoiceActions } from "@/features/pimia/ui/PimiaInvoiceActions";
import { cn } from "@/shared/lib/cn";
import { DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

export type PimiaInvoiceSort = PimiaSortState<PimiaInvoiceSortField>;

type PimiaInvoiceListProps = {
  invoices: PimiaInvoice[];
  onOpen?: (invoiceId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
  onSortChange?: (sort: PimiaInvoiceSort) => void;
  /** Oculta la columna de cliente cuando ya se está dentro de uno. */
  showCustomer?: boolean;
  sort?: PimiaInvoiceSort;
  /**
   * El día de HOY en `YYYY-MM-DD` **local**, para el aviso de vencimiento.
   *
   * Baja como prop —y memoizado en la pantalla— a propósito: si cada fila
   * mirase el reloj serían cien relojes, y una sesión abierta a medianoche
   * podría pintar media tabla contra un «hoy» y la otra media contra otro. Y es
   * el día local de quien mira (`todayIso`), no el de UTC: con
   * `new Date().toISOString()` una factura que vence hoy saldría vencida a la
   * una de la madrugada española.
   */
  today: string;
  /**
   * Suma de lo que hay en pantalla, al pie.
   *
   * `null` **esconde el pie entero**, y es la única respuesta honesta cuando
   * la suma no se pudo hacer: quien la calcula (`sumStrict`) devuelve `null` en
   * cuanto una factura no trae importe legible. Ojo con «arreglar» esto
   * pintando una raya en el total — se descartó a propósito, el porqué está en
   * el comentario del `totalCents` de `PimiaInvoicesScreen`.
   */
  totalCents?: number | null;
};

export function PimiaInvoiceList({
  invoices,
  onOpen,
  onOpenCustomer,
  onSortChange,
  showCustomer = true,
  sort,
  today,
  totalCents,
}: PimiaInvoiceListProps) {
  const isSortable = Boolean(sort && onSortChange);

  const head = (
    field: PimiaInvoiceSortField,
    label: string,
    options: { align?: "left" | "right"; className?: string } = {},
  ) =>
    isSortable && sort && onSortChange ? (
      <PimiaSortableHead
        align={options.align}
        className={options.className}
        field={field}
        onSortChange={onSortChange}
        sort={sort}
      >
        {label}
      </PimiaSortableHead>
    ) : (
      <TableHead
        className={
          options.align === "right"
            ? `text-right ${options.className ?? ""}`
            : options.className
        }
      >
        {label}
      </TableHead>
    );

  return (
    <Table data-testid="pimia-invoice-list">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {head("invoice_number", "Número", { className: "w-44 pl-3" })}
          {showCustomer ? (
            <TableHead className="w-full">Cliente</TableHead>
          ) : null}
          {head("invoice_date", "Fecha", {
            className: "w-32 whitespace-nowrap",
          })}
          {head("due_date", "Vence", { className: "w-32 whitespace-nowrap" })}
          {head("status", "Estado", { className: "w-32" })}
          <TableHead className="w-32">Cobro</TableHead>
          {head("total", "Importe", {
            align: "right",
            className: "w-44 whitespace-nowrap",
          })}
          <TableHead className="w-12 pr-2">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => {
          /* El neto NO coincide con el nominal. `effective_*` los precalcula el
           * servidor; cuando no vienen (un servidor sin la vista ligera de
           * facturas) esto es `false` y la fila se pinta como antes.
           *
           * Hace dos trabajos: enseña el neto bajo el importe y, mientras el
           * recuento de rectificativas no llegue —que en este índice es
           * siempre—, es lo único que delata que la factura está rectificada. */
          const hasDifferentNet =
            invoice.effectiveTotalCents !== null &&
            invoice.effectiveTotalCents !== invoice.totalCents;
          const pendingCents = invoice.effectiveDueCents ?? invoice.dueCents;
          /* Cuántas rectificativas se han emitido contra esta factura, dicho
           * por el servidor. `null` es «no lo sé», y en este índice es lo que
           * llega en TODA fila: `view=summary` no manda `credit_notes_count`.
           * Entonces —y solo entonces— decide la heurística del neto. Un `0`
           * de verdad es otra cosa: es «no hay ninguna», y apaga la marca
           * aunque el neto difiera, porque el servidor ya ha contado. */
          const creditNotesCount = invoice.creditNotesCount;
          const isRectified =
            creditNotesCount === null ? hasDifferentNet : creditNotesCount > 0;
          const warning = invoiceDueWarning({
            dueDate: invoice.dueDate,
            isCollectable: isCollectableInvoice(invoice),
            // El mismo criterio que la insignia de cobro de esta misma fila:
            // el vencimiento NETO cuando el servidor lo publica. Si las dos
            // leyeran cosas distintas, la fila se contradiría a sí misma.
            isOverdue: invoice.effectiveOverdue ?? invoice.isOverdue,
            today,
          });

          return (
            <TableRow
              data-testid={`pimia-invoice-${invoice.id}`}
              key={invoice.id}
            >
              <TableCell className="whitespace-nowrap py-2.5 pl-3">
                {invoice.invoiceNumber ? (
                  onOpen ? (
                    <button
                      className="rounded-sm font-mono font-medium text-foreground outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`pimia-invoice-open-${invoice.id}`}
                      onClick={() => onOpen(invoice.id)}
                      type="button"
                    >
                      {invoice.invoiceNumber}
                    </button>
                  ) : (
                    <span className="font-mono font-medium text-foreground">
                      {invoice.invoiceNumber}
                    </span>
                  )
                ) : (
                  // El número no existe hasta publicar. El borrador se abre
                  // igual, pero no se le inventa un identificador.
                  <button
                    className="rounded-sm text-muted-foreground outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`pimia-invoice-open-${invoice.id}`}
                    onClick={onOpen ? () => onOpen(invoice.id) : undefined}
                    type="button"
                  >
                    Sin numerar
                  </button>
                )}
                {invoice.isCreditNote ? (
                  <span className="ml-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Rectificativa
                  </span>
                ) : null}
                {/* El otro extremo del mismo enlace: la factura corregida.
                    Con varias se dice cuántas, porque una factura rectificada
                    dos veces no cuenta la misma historia que una rectificada
                    una — pero eso solo lo sabe `credit_notes_count`. Cuando la
                    marca viene de la heurística del neto, «Rectificada» a secas
                    es todo lo que se puede afirmar sin inventarse un número. */}
                {isRectified ? (
                  <span className="ml-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {creditNotesCount !== null && creditNotesCount > 1
                      ? `${creditNotesCount} rectificativas`
                      : "Rectificada"}
                  </span>
                ) : null}
                {/* A qué factura corrige esta rectificativa. Sin el número no
                    se pinta la línea: un id pelado no es un número de factura,
                    y «rectifica —» no le dice nada a nadie.
                    ⚠️ Hoy, en el índice, no se pinta nunca: `view=summary`
                    manda `rectified_invoice_id` y no el número. Está escrito
                    para el día que esta tabla reciba filas completas, no es una
                    capacidad que el listado tenga ya. */}
                {invoice.isCreditNote && invoice.rectifiedInvoiceNumber ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    rectifica{" "}
                    <span className="font-mono">
                      {invoice.rectifiedInvoiceNumber}
                    </span>
                  </span>
                ) : null}
              </TableCell>
              {showCustomer ? (
                <TableCell className="max-w-0 truncate py-2.5 font-medium text-foreground">
                  {invoice.customerName ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">
                {formatIsoDateShort(invoice.invoiceDate)}
              </TableCell>
              <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">
                {formatIsoDateShort(invoice.dueDate)}
                {warning ? (
                  <span
                    className={cn(
                      "block text-xs",
                      warning.tone === "danger"
                        ? "text-destructive"
                        : "text-warning",
                    )}
                    data-testid={`pimia-invoice-due-warning-${invoice.id}`}
                  >
                    {warning.text}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="py-2.5">
                <PimiaInvoiceStatusBadge status={invoice.status} />
              </TableCell>
              <TableCell className="py-2.5">
                {invoice.status === "DRAFT" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  // La insignia roja mira el vencimiento NETO: una factura
                  // rectificada del todo está vencida sobre el papel y no debe
                  // nada. El estado de cobro se queda nominal — el
                  // `effective_paid_status` diría «Pagada» de algo que nadie
                  // pagó.
                  <PimiaInvoicePaidBadge
                    isOverdue={invoice.effectiveOverdue ?? invoice.isOverdue}
                    paidStatus={invoice.paidStatus}
                  />
                )}
              </TableCell>
              <PimiaAmountCell
                cents={invoice.totalCents}
                className="py-2.5"
                hint={
                  // Neto distinto del nominal: la cifra de arriba es el importe
                  // legal del documento y aquí va lo que queda de él, que es lo
                  // que se cobra. Si no, lo pendiente — y solo cuando no es ni
                  // cero ni el total entero: en esos dos la cifra de arriba ya
                  // lo dice.
                  hasDifferentNet
                    ? `Neto ${formatCents(invoice.effectiveTotalCents)}`
                    : pendingCents !== null &&
                        pendingCents > 0 &&
                        pendingCents !== invoice.totalCents
                      ? `Pendiente ${formatCents(pendingCents)}`
                      : undefined
                }
              />
              <TableCell className="py-2.5 pr-2 text-right">
                <PimiaInvoiceRowActions
                  invoice={invoice}
                  onOpen={onOpen}
                  onOpenCustomer={onOpenCustomer}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {typeof totalCents === "number" ? (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell
              className="pl-3 text-xs font-normal text-muted-foreground"
              colSpan={showCustomer ? 6 : 5}
            >
              Total en pantalla
            </TableCell>
            <PimiaAmountCell cents={totalCents} dimZero={false} />
            <TableCell className="pr-2" />
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
}

/**
 * El menú de la fila: navegación arriba y, debajo, las mismas acciones de
 * documento que ofrece la ficha (`PimiaInvoiceActions`).
 */
function PimiaInvoiceRowActions({
  invoice,
  onOpen,
  onOpenCustomer,
}: {
  invoice: PimiaInvoice;
  onOpen?: (invoiceId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const customerId = invoice.customerId;

  return (
    <PimiaInvoiceActions
      invoice={invoice}
      navigationItems={
        <>
          {onOpen ? (
            <DropdownMenuItem onSelect={() => onOpen(invoice.id)}>
              <FileText className="h-4 w-4" />
              Ver la factura
            </DropdownMenuItem>
          ) : null}
          {customerId && onOpenCustomer ? (
            <DropdownMenuItem onSelect={() => onOpenCustomer(customerId)}>
              <User className="h-4 w-4" />
              Ver el cliente
            </DropdownMenuItem>
          ) : null}
          {invoice.invoiceNumber ? (
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard?.writeText(
                  invoice.invoiceNumber as string,
                );
              }}
            >
              <Copy className="h-4 w-4" />
              Copiar el número
            </DropdownMenuItem>
          ) : null}
        </>
      }
    />
  );
}
