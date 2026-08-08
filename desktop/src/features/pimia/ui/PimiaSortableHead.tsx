/**
 * Una cabecera de tabla que ordena — **contra el servidor**, no la página.
 *
 * El índice de Pimia acepta `orderByField` y `orderBy` (ver `applyFilters` de
 * `Estimate`), así que la flecha reordena las 129 filas del tenant y no las 25
 * que se están viendo. Ordenar solo la página visible es la clase de mentira
 * que hace desconfiar de una tabla entera.
 */

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { TableHead } from "@/shared/ui/table";

export type PimiaSortState<TField extends string> = {
  direction: "asc" | "desc";
  field: TField;
};

type PimiaSortableHeadProps<TField extends string> = {
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
  field: TField;
  onSortChange: (sort: PimiaSortState<TField>) => void;
  sort: PimiaSortState<TField>;
};

export function PimiaSortableHead<TField extends string>({
  align = "left",
  children,
  className,
  field,
  onSortChange,
  sort,
}: PimiaSortableHeadProps<TField>) {
  const isActive = sort.field === field;
  const Icon = !isActive
    ? ChevronsUpDown
    : sort.direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <TableHead className={className}>
      <button
        // Un campo nuevo empieza por descendente: lo más reciente y lo más
        // caro es lo que se quiere ver primero casi siempre.
        className={cn(
          "-mx-1 flex w-full items-center gap-1.5 rounded-sm px-1 py-1 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" ? "justify-end" : "justify-start",
          isActive ? "text-foreground" : undefined,
        )}
        onClick={() =>
          onSortChange({
            direction:
              isActive && sort.direction === "desc" ? "asc" : ("desc" as const),
            field,
          })
        }
        type="button"
      >
        {children}
        <Icon
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isActive ? "opacity-100" : "opacity-40",
          )}
        />
      </button>
    </TableHead>
  );
}
