/**
 * Las pestañas de estado que van bajo la cabecera de una lista.
 *
 * Es el patrón de la referencia (subrayado, no píldoras): el estado es la
 * partición natural de un listado de documentos y merece la jerarquía de una
 * pestaña, no la de un filtro más. Se compone sobre el bloque `tabs` de Buzz
 * cambiando solo su piel; el primitivo no se toca.
 */

import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

export type PimiaStatusTabOption = {
  label: string;
  value: string;
};

type PimiaStatusTabsProps = {
  className?: string;
  onValueChange: (value: string) => void;
  options: PimiaStatusTabOption[];
  /** Prefijo de `data-testid` de cada pestaña. */
  testIdPrefix?: string;
  value: string;
};

export function PimiaStatusTabs({
  className,
  onValueChange,
  options,
  testIdPrefix,
  value,
}: PimiaStatusTabsProps) {
  return (
    <Tabs className={className} onValueChange={onValueChange} value={value}>
      <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
        {options.map((option) => (
          <TabsTrigger
            className="-mb-px rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            data-testid={
              testIdPrefix ? `${testIdPrefix}-${option.value}` : undefined
            }
            key={option.value}
            value={option.value}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
