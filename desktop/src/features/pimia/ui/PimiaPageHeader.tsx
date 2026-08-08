/**
 * La cabecera de una pantalla del ERP: título, descripción en una línea y la
 * acción primaria a la derecha.
 *
 * Es el patrón de la referencia (shadcnblocks admin, «Orders List / Track
 * payments… / + Create Order») compuesto con las variables de Buzz. No usa el
 * `PageHeader` compartido a propósito: aquel es la escala del shell de
 * mensajería (24 px semibold sobre descripción de 16 px) y el ERP quiere la
 * suya —30 px medium sobre 14 px apagados—, que es la que da la densidad de un
 * panel de gestión. Sigue siendo el único `h1` de la página.
 */

import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

type PimiaPageHeaderProps = {
  /** Acción primaria, alineada al final de la cabecera. */
  action?: ReactNode;
  /** Migas o botón de vuelta, encima del título. */
  back?: ReactNode;
  className?: string;
  description?: ReactNode;
  /** Insignias o metadatos que acompañan al título en su misma línea. */
  meta?: ReactNode;
  title: ReactNode;
};

export function PimiaPageHeader({
  action,
  back,
  className,
  description,
  meta,
  title,
}: PimiaPageHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {back}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="min-w-0 truncate text-3xl font-medium tracking-tight text-foreground">
              {title}
            </h1>
            {meta}
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
