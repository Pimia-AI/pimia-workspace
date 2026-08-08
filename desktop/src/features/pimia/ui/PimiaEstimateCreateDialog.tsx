/**
 * Alta de presupuesto.
 *
 * Lo que este formulario NO hace, a propósito: calcular impuestos, validar la
 * numeración o decidir estados. **La lógica de negocio es del servidor** —
 * cadena VeriFactu, invariantes fiscales, series— y replicarla aquí sería
 * construir una segunda verdad. Se manda el borrador y se consume la respuesta.
 *
 * Lo que sí hace: pedir el número justo antes de crear y reintentar si otro se
 * lo lleva (ver `api/estimates.ts`), y mandar siempre `discount`/`discount_type`
 * /`discount_val` porque sin ellos el servidor responde 500 en vez de 422.
 */

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import type { PimiaEstimateDraftLine } from "@/features/pimia/api/estimates";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { useCreatePimiaEstimate } from "@/features/pimia/hooks/usePimiaResources";
import { formatCents, parseAmountToCents } from "@/features/pimia/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Spinner } from "@/shared/ui/spinner";

type DraftLine = {
  id: number;
  name: string;
  quantity: string;
  price: string;
};

function emptyLine(id: number): DraftLine {
  return { id, name: "", quantity: "1", price: "" };
}

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

type PimiaEstimateCreateDialogProps = {
  customerId: string;
  customerName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function PimiaEstimateCreateDialog({
  customerId,
  customerName,
  onOpenChange,
  open,
}: PimiaEstimateCreateDialogProps) {
  const [lines, setLines] = React.useState<DraftLine[]>([emptyLine(0)]);
  const [expiryDate, setExpiryDate] = React.useState(() => isoDate(30));
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const create = useCreatePimiaEstimate();

  const parsedLines: PimiaEstimateDraftLine[] = [];
  let hasInvalidLine = false;
  for (const line of lines) {
    const priceCents = parseAmountToCents(line.price);
    const quantity = Number.parseFloat(line.quantity.replace(",", "."));
    if (
      line.name.trim() === "" ||
      priceCents === null ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      hasInvalidLine = true;
      continue;
    }
    parsedLines.push({ name: line.name.trim(), quantity, priceCents });
  }

  const subtotalCents = parsedLines.reduce(
    (total, line) => total + Math.round(line.priceCents * line.quantity),
    0,
  );
  const canSubmit = parsedLines.length > 0 && !create.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      await create.mutateAsync({
        customerId,
        estimateDate: isoDate(),
        expiryDate,
        items: parsedLines,
      });
      setLines([emptyLine(0)]);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof PimiaApiError
          ? error.message
          : String(error ?? "no se pudo crear el presupuesto"),
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-2xl"
        data-testid="pimia-estimate-create-dialog"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nuevo presupuesto</DialogTitle>
            <DialogDescription>
              Para {customerName}. Pimia asigna el número al crearlo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div className="flex items-start gap-2" key={line.id}>
                  <Input
                    aria-label={`Concepto de la línea ${index + 1}`}
                    className="flex-1"
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Concepto"
                    value={line.name}
                  />
                  <Input
                    aria-label={`Cantidad de la línea ${index + 1}`}
                    className="w-20"
                    inputMode="decimal"
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id
                            ? { ...item, quantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="1"
                    value={line.quantity}
                  />
                  <Input
                    aria-label={`Precio de la línea ${index + 1}`}
                    className="w-28"
                    inputMode="decimal"
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id
                            ? { ...item, price: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="0,00 €"
                    value={line.price}
                  />
                  <Button
                    aria-label={`Quitar la línea ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    emptyLine((current.at(-1)?.id ?? 0) + 1),
                  ])
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                Añadir línea
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label
                className="flex items-center gap-2 text-sm text-muted-foreground"
                htmlFor="pimia-estimate-expiry"
              >
                Válido hasta
                <Input
                  className="w-40"
                  id="pimia-estimate-expiry"
                  onChange={(event) => setExpiryDate(event.target.value)}
                  type="date"
                  value={expiryDate}
                />
              </label>
              <span className="text-sm text-muted-foreground">
                Base imponible{" "}
                <span
                  className="font-medium tabular-nums text-foreground"
                  data-testid="pimia-estimate-subtotal"
                >
                  {formatCents(subtotalCents)}
                </span>
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Los impuestos y la numeración los aplica Pimia al guardar.
            </p>

            {hasInvalidLine && parsedLines.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Se ignorarán las líneas sin concepto, cantidad o precio válidos.
              </p>
            ) : null}
            {errorMessage ? (
              <p
                className="text-sm text-destructive"
                data-testid="pimia-estimate-error"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button disabled={!canSubmit} type="submit">
              {create.isPending ? <Spinner className="h-3.5 w-3.5" /> : null}
              Crear presupuesto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
