/**
 * El pie de una tabla del ERP: cuántas filas se están viendo de cuántas, y la
 * navegación entre páginas.
 *
 * El recuento va siempre, aunque haya una sola página: en una lista de
 * documentos, saber que son doce y no doce-de-trescientos es la mitad de la
 * información.
 */

import { describeRange } from "@/features/pimia/lib/pagination";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

type PimiaPaginationProps = {
  className?: string;
  /** Deshabilita la navegación mientras la página siguiente está en vuelo. */
  isBusy?: boolean;
  lastPage: number;
  onPageChange: (page: number) => void;
  page: number;
  /** Filas por página, para calcular el rango. */
  pageSize: number;
  /** Filas en pantalla. */
  shown: number;
  /** Total conocido; `null` cuando la API no lo manda. */
  total: number | null;
};

export function PimiaPagination({
  className,
  isBusy,
  lastPage,
  onPageChange,
  page,
  pageSize,
  shown,
  total,
}: PimiaPaginationProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-t border-border px-3 py-2.5",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        {describeRange(page, pageSize, shown, total)}
      </p>
      {lastPage > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1 || isBusy}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            size="sm"
            variant="outline"
          >
            Anterior
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page} / {lastPage}
          </span>
          <Button
            disabled={page >= lastPage || isBusy}
            onClick={() => onPageChange(page + 1)}
            size="sm"
            variant="outline"
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
