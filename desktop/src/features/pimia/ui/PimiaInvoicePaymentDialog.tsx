/**
 * Registrar el cobro de una factura.
 *
 * El importe llega prellenado con **lo pendiente** (`due_amount`), que es el
 * caso normal; se puede bajar para un cobro parcial. El `payment_number` no se
 * pide: lo genera el servidor con su serie, y `paid_status`/`due_amount` los
 * recalcula él — aquí no hay aritmética de deuda.
 */

import * as React from "react";
import { HandCoins } from "lucide-react";

import type { PimiaInvoice } from "@/features/pimia/api/invoices";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { useRecordPimiaInvoicePayment } from "@/features/pimia/hooks/usePimiaResources";
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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function PimiaInvoicePaymentDialog({
  invoice,
  onOpenChange,
  onRecorded,
  open,
}: {
  invoice: PimiaInvoice;
  onOpenChange: (open: boolean) => void;
  onRecorded?: (amountCents: number) => void;
  open: boolean;
}) {
  const record = useRecordPimiaInvoicePayment();
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(isoToday);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setAmount(
      invoice.dueCents !== null && invoice.dueCents > 0
        ? (invoice.dueCents / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setDate(isoToday());
    setErrorMessage(null);
  }, [invoice.dueCents, open]);

  const amountCents = parseAmountToCents(amount);
  const exceedsDue =
    amountCents !== null &&
    invoice.dueCents !== null &&
    amountCents > invoice.dueCents;
  const canRecord =
    amountCents !== null &&
    amountCents > 0 &&
    !exceedsDue &&
    date !== "" &&
    Boolean(invoice.customerId) &&
    !record.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (amountCents === null || !invoice.customerId) {
      return;
    }
    setErrorMessage(null);
    try {
      await record.mutateAsync({
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amountCents,
        paymentDate: date,
      });
      onOpenChange(false);
      onRecorded?.(amountCents);
    } catch (error) {
      setErrorMessage(
        error instanceof PimiaApiError
          ? error.message
          : "No se pudo registrar el cobro",
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-md"
        data-testid="pimia-invoice-payment-dialog"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              Registrar cobro de{" "}
              <span className="font-mono">
                {invoice.invoiceNumber ?? "la factura"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {invoice.dueCents !== null
                ? `Pendiente: ${formatCents(invoice.dueCents)}. `
                : null}
              Pimia asigna el número de recibo y recalcula la deuda al guardar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-payment-amount"
            >
              Importe cobrado
              <Input
                id="pimia-payment-amount"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00 €"
                value={amount}
              />
            </label>
            {exceedsDue ? (
              <p className="-mt-2 text-xs text-destructive" role="alert">
                Es más de lo pendiente: cobra como mucho{" "}
                {formatCents(invoice.dueCents ?? 0)}.
              </p>
            ) : null}

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-payment-date"
            >
              Fecha del cobro
              <Input
                className="w-44"
                id="pimia-payment-date"
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>

            {errorMessage ? (
              <p
                className="text-sm text-destructive"
                data-testid="pimia-invoice-payment-error"
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
            <Button
              data-testid="pimia-invoice-payment-confirm"
              disabled={!canRecord}
              type="submit"
            >
              {record.isPending ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <HandCoins className="h-4 w-4" />
              )}
              Registrar cobro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
