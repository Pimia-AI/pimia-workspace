/**
 * El pie de una tabla del ERP: cuántas filas se están viendo de cuántas, y la
 * navegación entre páginas.
 *
 * El recuento va siempre, aunque haya una sola página: en una lista de
 * documentos, saber que son doce y no doce-de-trescientos es la mitad de la
 * información.
 *
 * **El pie va siempre visible, anclado a la base de la tarjeta.** Con páginas
 * de 25 filas, un pie al final del documento queda fuera del pliegue y la
 * paginación *parece no existir* — pasó con las 373 facturas del tenant de
 * pruebas. No se resuelve con `sticky` (flotaría por encima de las filas,
 * cortando el listado): la tarjeta que envuelve tabla + pie ocupa el alto
 * disponible (`flex min-h-0 flex-1 flex-col`), el cuerpo de la tabla scrollea
 * en su propio contenedor (`min-h-0 flex-1 overflow-y-auto`) y este pie es el
 * último hijo estático, así que descansa en la base sin tapar nada.
 */

import { describeRange } from "@/features/pimia/lib/pagination";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

type PimiaPaginationProps = {
  className?: string;
  /** Deshabilita la navegación mientras la página siguiente está en vuelo. */
  isBusy?: boolean;
  lastPage: number;
  onPageChange: (page: number) => void;
  /** Sin esto no se ofrece elegir cuántas filas por página. */
  onPageSizeChange?: (pageSize: number) => void;
  page: number;
  /** Filas por página, para calcular el rango. */
  pageSize: number;
  pageSizes?: number[];
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
  onPageSizeChange,
  page,
  pageSize,
  pageSizes = [25, 50, 100],
  shown,
  total,
}: PimiaPaginationProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {describeRange(page, pageSize, shown, total)}
        </p>
        {/* La página siguiente se pide manteniendo las filas de la anterior
            (`placeholderData`), así que sin esta señal el cambio de página
            parece no haber hecho nada. Va aquí, donde se pulsó. */}
        {isBusy ? (
          <Spinner
            aria-label="Cargando la página"
            className="h-3.5 w-3.5 border-2 text-muted-foreground"
          />
        ) : null}
        {onPageSizeChange ? (
          <Select
            onValueChange={(value) => onPageSizeChange(Number(value))}
            value={String(pageSize)}
          >
            <SelectTrigger
              className="h-7 w-[7.5rem] text-xs"
              data-testid="pimia-page-size"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} por página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
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
