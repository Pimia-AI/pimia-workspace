/**
 * El dinero en una tabla: céntimos formateados, a la derecha y en cifras de
 * ancho fijo.
 *
 * Alinear a la derecha en `tabular-nums` no es gusto: es lo que deja las comas
 * decimales en la misma columna y permite comparar una lista de un vistazo. El
 * formateo pasa SIEMPRE por `lib/money` — la API habla en céntimos enteros y
 * esa conversión vive en un solo sitio.
 */

import { formatCents } from "@/features/pimia/lib/money";
import { cn } from "@/shared/lib/cn";
import { TableCell } from "@/shared/ui/table";

type PimiaAmountProps = {
  cents: number | null | undefined;
  className?: string;
  /** Los importes a cero son ruido en una lista: se apagan. */
  dimZero?: boolean;
};

/** El importe suelto, para fichas y totales fuera de una tabla. */
export function PimiaAmount({ cents, className, dimZero }: PimiaAmountProps) {
  const isZero = !cents;
  return (
    <span
      className={cn(
        "tabular-nums",
        dimZero && isZero ? "text-muted-foreground" : undefined,
        className,
      )}
    >
      {formatCents(cents ?? 0)}
    </span>
  );
}

/** La celda de importe de una tabla del ERP. */
export function PimiaAmountCell({
  cents,
  className,
  dimZero = true,
}: PimiaAmountProps) {
  return (
    <TableCell className={cn("text-right font-medium", className)}>
      <PimiaAmount cents={cents} dimZero={dimZero} />
    </TableCell>
  );
}
