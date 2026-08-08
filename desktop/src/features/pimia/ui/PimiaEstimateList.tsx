/**
 * La tabla de presupuestos, compartida por el detalle de cliente y la pantalla
 * general. Solo pinta: los datos y la paginación los pone quien la usa.
 *
 * Es la lista densa de la referencia: cabeceras apagadas, una fila por
 * documento, el estado como insignia semántica y el importe a la derecha en
 * cifras de ancho fijo.
 */

import type { PimiaEstimate } from "@/features/pimia/api/estimates";
import { PimiaAmountCell } from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaEstimateStatusBadge } from "@/features/pimia/ui/PimiaStatusBadge";
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

type PimiaEstimateListProps = {
  estimates: PimiaEstimate[];
  /** Oculta la columna de cliente cuando ya se está dentro de uno. */
  showCustomer?: boolean;
  /** Suma de lo que hay en pantalla, al pie y en la columna del importe. */
  totalCents?: number | null;
};

export function PimiaEstimateList({
  estimates,
  showCustomer = true,
  totalCents,
}: PimiaEstimateListProps) {
  return (
    <Table data-testid="pimia-estimate-list">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {/* La columna de cliente se queda con el sobrante: las demás miden
              lo que mide su contenido, y el nombre es lo único que puede ser
              largo de verdad. */}
          <TableHead className="w-40 pl-3">Número</TableHead>
          {showCustomer ? (
            <TableHead className="w-full">Cliente</TableHead>
          ) : null}
          <TableHead className="w-32">Fecha</TableHead>
          <TableHead className="w-32">Válido hasta</TableHead>
          <TableHead className="w-36">Estado</TableHead>
          <TableHead className="w-36 pr-3 text-right">Importe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {estimates.map((estimate) => (
          <TableRow
            data-testid={`pimia-estimate-${estimate.id}`}
            key={estimate.id}
          >
            <TableCell className="whitespace-nowrap pl-3 font-mono font-medium text-foreground">
              {estimate.estimateNumber}
            </TableCell>
            {showCustomer ? (
              <TableCell className="max-w-0 truncate">
                {estimate.customerName ?? "—"}
              </TableCell>
            ) : null}
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(estimate.estimateDate)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(estimate.expiryDate)}
            </TableCell>
            <TableCell>
              <PimiaEstimateStatusBadge status={estimate.status} />
            </TableCell>
            <PimiaAmountCell cents={estimate.totalCents} className="pr-3" />
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
            <PimiaAmountCell
              cents={totalCents}
              className="pr-3"
              dimZero={false}
            />
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
}
