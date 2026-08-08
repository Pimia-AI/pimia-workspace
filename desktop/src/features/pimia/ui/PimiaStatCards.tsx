/**
 * La tira de cifras que va sobre una lista del ERP.
 *
 * Patrón de la referencia (su `invoice-list-2`): una sola caja dividida, cada
 * celda con su etiqueta apagada y su cifra grande. Aquí no se calcula nada:
 * quien la usa le pasa números que el servidor haya dicho. La regla que costó
 * un bug en el panel: **una cifra agregada sobre una página no es un total** —
 * si no se puede saber de verdad, se pone una raya.
 */

import { cn } from "@/shared/lib/cn";

export type PimiaStat = {
  /** Línea pequeña bajo la cifra: qué se está contando exactamente. */
  hint?: string;
  label: string;
  /** Ya formateado. `—` cuando todavía no se sabe. */
  value: string;
};

export function PimiaStatCards({
  className,
  stats,
}: {
  className?: string;
  stats: PimiaStat[];
}) {
  return (
    <div
      className={cn(
        // `shrink-0`: la tira vive dentro de una columna flex con la tabla
        // debajo, y sin esto el flex la encoge y le corta la línea de ayuda.
        "grid shrink-0 grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border sm:grid-cols-4 sm:divide-y-0",
        className,
      )}
      data-testid="pimia-stat-cards"
    >
      {stats.map((stat) => (
        <div className="px-4 py-5 text-center" key={stat.label}>
          <p className="truncate text-sm font-medium text-muted-foreground">
            {stat.label}
          </p>
          <p className="mt-1.5 truncate text-3xl font-semibold tabular-nums leading-none text-foreground">
            {stat.value}
          </p>
          {stat.hint ? (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {stat.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
