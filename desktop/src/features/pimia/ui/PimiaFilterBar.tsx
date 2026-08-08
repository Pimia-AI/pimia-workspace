/**
 * La fila de filtros que va bajo la cabecera de una lista: búsqueda a la
 * izquierda, filtros extra a continuación y las acciones de tabla al final.
 *
 * La búsqueda va contra la API del tenant, así que quien la use debe rebotarla
 * (`debounce`); aquí solo se pinta.
 */

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Input } from "@/shared/ui/input";

type PimiaFilterBarProps = {
  /** Filtros adicionales, a la derecha de la búsqueda. */
  children?: ReactNode;
  className?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchTestId?: string;
  searchValue?: string;
  /** Acciones alineadas al final de la fila. */
  trailing?: ReactNode;
};

export function PimiaFilterBar({
  children,
  className,
  onSearchChange,
  searchPlaceholder = "Buscar",
  searchTestId,
  searchValue,
  trailing,
}: PimiaFilterBarProps) {
  // Como en la referencia: cuando hay filtros, la búsqueda se va al final de
  // la fila; cuando es lo único que hay, se queda al principio en vez de
  // quedarse sola y descolgada a la derecha.
  const search = onSearchChange ? (
    <div className="relative w-full sm:w-72">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="h-9 pl-9"
        data-testid={searchTestId}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        value={searchValue ?? ""}
      />
    </div>
  ) : null;
  const hasFilters = Boolean(children);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {hasFilters ? null : search}
      {children}
      {hasFilters || trailing ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasFilters ? search : null}
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
