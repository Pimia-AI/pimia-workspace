/**
 * La tabla de presupuestos, compartida por el detalle de cliente y la pantalla
 * general. Solo pinta: los datos, el orden y la paginación los pone quien la
 * usa.
 *
 * Es la lista densa de la referencia (`invoice-list-2`): cabeceras que ordenan
 * contra el servidor, el estado como insignia semántica, el importe a la
 * derecha en cifras de ancho fijo con la base debajo, y un menú de acciones
 * por fila.
 *
 * La segunda línea solo aparece donde hay un dato de verdad que poner. La
 * referencia la usa en casi todas las celdas (descripción, email del cliente),
 * pero el índice de presupuestos de Pimia devuelve del cliente solo el nombre:
 * rellenar el hueco por simetría sería inventar densidad.
 */

import { Copy, FileText, User } from "lucide-react";

import type {
  PimiaEstimate,
  PimiaEstimateSortField,
} from "@/features/pimia/api/estimates";
import { formatCents } from "@/features/pimia/lib/money";
import { PimiaAmountCell } from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaEstimateActions } from "@/features/pimia/ui/PimiaEstimateActions";
import {
  PimiaSortableHead,
  type PimiaSortState,
} from "@/features/pimia/ui/PimiaSortableHead";
import { PimiaEstimateStatusBadge } from "@/features/pimia/ui/PimiaStatusBadge";
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
    month: "short",
    year: "numeric",
  });
}

export type PimiaEstimateSort = PimiaSortState<PimiaEstimateSortField>;

type PimiaEstimateListProps = {
  estimates: PimiaEstimate[];
  /** Abre la ficha del presupuesto. Sin esto el número no es un enlace. */
  onOpen?: (estimateId: string) => void;
  /** Abre la ficha del cliente del presupuesto. */
  onOpenCustomer?: (customerId: string) => void;
  onSortChange?: (sort: PimiaEstimateSort) => void;
  /** Oculta la columna de cliente cuando ya se está dentro de uno. */
  showCustomer?: boolean;
  /** Sin esto las cabeceras no ordenan (el detalle de cliente no lo necesita). */
  sort?: PimiaEstimateSort;
  /** Suma de lo que hay en pantalla, al pie y en la columna del importe. */
  totalCents?: number | null;
};

export function PimiaEstimateList({
  estimates,
  onOpen,
  onOpenCustomer,
  onSortChange,
  showCustomer = true,
  sort,
  totalCents,
}: PimiaEstimateListProps) {
  const isSortable = Boolean(sort && onSortChange);

  /** Cabecera ordenable si la pantalla lo pidió, y si no, una normal. */
  const head = (
    field: PimiaEstimateSortField,
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
    <Table data-testid="pimia-estimate-list">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {head("estimate_number", "Número", { className: "w-48 pl-3" })}
          {showCustomer ? (
            <TableHead className="w-full">Cliente</TableHead>
          ) : null}
          {head("estimate_date", "Fecha", {
            className: "w-32 whitespace-nowrap",
          })}
          {head("expiry_date", "Válido hasta", {
            className: "w-36 whitespace-nowrap",
          })}
          {head("status", "Estado", { className: "w-36" })}
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
        {estimates.map((estimate) => (
          <TableRow
            data-testid={`pimia-estimate-${estimate.id}`}
            key={estimate.id}
          >
            <TableCell className="whitespace-nowrap py-2.5 pl-3">
              {onOpen ? (
                // El número es el enlace a la ficha: un botón de verdad, para
                // que el teclado llegue igual que el ratón.
                <button
                  className="rounded-sm font-mono font-medium text-foreground outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`pimia-estimate-open-${estimate.id}`}
                  onClick={() => onOpen(estimate.id)}
                  type="button"
                >
                  {estimate.estimateNumber}
                </button>
              ) : (
                <span className="font-mono font-medium text-foreground">
                  {estimate.estimateNumber}
                </span>
              )}
            </TableCell>
            {showCustomer ? (
              <TableCell className="max-w-0 truncate py-2.5 font-medium text-foreground">
                {estimate.customerName ?? "—"}
              </TableCell>
            ) : null}
            <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">
              {formatDate(estimate.estimateDate)}
            </TableCell>
            <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">
              {formatDate(estimate.expiryDate)}
            </TableCell>
            <TableCell className="py-2.5">
              <PimiaEstimateStatusBadge status={estimate.status} />
            </TableCell>
            <PimiaAmountCell
              cents={estimate.totalCents}
              className="py-2.5"
              hint={
                // Solo cuando aporta: si no hay impuestos, base y total son la
                // misma cifra escrita dos veces.
                estimate.subTotalCents !== null &&
                estimate.subTotalCents !== estimate.totalCents
                  ? `Base ${formatCents(estimate.subTotalCents)}`
                  : undefined
              }
            />
            <TableCell className="py-2.5 pr-2 text-right">
              <PimiaEstimateRowActions
                estimate={estimate}
                onOpen={onOpen}
                onOpenCustomer={onOpenCustomer}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {typeof totalCents === "number" ? (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell
              className="pl-3 text-xs font-normal text-muted-foreground"
              colSpan={showCustomer ? 5 : 4}
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
 * El menú de la fila: navegar desde aquí, y encima las acciones de documento,
 * que son las mismas que ofrece la ficha (`PimiaEstimateActions`). Todo lo que
 * sale hace algo — nada en gris que prometa y no cumpla.
 */
function PimiaEstimateRowActions({
  estimate,
  onOpen,
  onOpenCustomer,
}: {
  estimate: PimiaEstimate;
  onOpen?: (estimateId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const customerId = estimate.customerId;

  return (
    <PimiaEstimateActions
      estimate={estimate}
      navigationItems={
        <>
          {onOpen ? (
            <DropdownMenuItem onSelect={() => onOpen(estimate.id)}>
              <FileText className="h-4 w-4" />
              Ver el presupuesto
            </DropdownMenuItem>
          ) : null}
          {customerId && onOpenCustomer ? (
            <DropdownMenuItem onSelect={() => onOpenCustomer(customerId)}>
              <User className="h-4 w-4" />
              Ver el cliente
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(estimate.estimateNumber);
            }}
          >
            <Copy className="h-4 w-4" />
            Copiar el número
          </DropdownMenuItem>
        </>
      }
    />
  );
}
