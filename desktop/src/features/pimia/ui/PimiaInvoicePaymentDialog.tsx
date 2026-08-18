/**
 * Registrar el cobro de una factura.
 *
 * El importe llega prellenado con **lo pendiente** (`due_amount`), que es el
 * caso normal; se puede bajar para un cobro parcial. El `payment_number` no se
 * pide: lo genera el servidor con su serie, y `paid_status`/`due_amount` los
 * recalcula él — aquí no hay aritmética de deuda.
 *
 * ⚖️ **El tope de esta pantalla es una cortesía, no la garantía.** Quien impide
 * el sobrepago de verdad es el servidor (`PaymentRequest`, con un 422 que dice
 * exactamente eso), y así debe ser. Lo de aquí sirve para avisar antes de gastar
 * un viaje — y por eso, cuando no puede saber el tope, **lo dice** en vez de
 * callarse: ver `lib/payments.ts`.
 *
 * 📅 **La fecha del cobro es hoy en el calendario de quien cobra, no en UTC.**
 * Hasta el 2026-08-18 este diálogo prellenaba con
 * `new Date().toISOString().slice(0, 10)` — literalmente la línea que
 * `lib/calendar.ts` señala en su docblock como el error heredado del panel Vue:
 * `toISOString()` habla UTC, así que en España, entre medianoche y las dos de la
 * madrugada de verano, devuelve **ayer**. En un parte de trabajo eso descuadra
 * una jornada; aquí es la fecha de un **cobro**, y el 1 de julio a la una de la
 * mañana el campo se rellenaba con el 30 de junio: el dinero se apuntaba en el
 * trimestre anterior, en un modelo ya presentado o a punto de estarlo. Y salía
 * bien escrito, con su formato y todo, así que nadie lo miraba dos veces. Con
 * `todayIso()` la fecha es el día local del reloj de quien mira, que es el único
 * que significa algo cuando se cuenta caja.
 */

import * as React from "react";
import { HandCoins } from "lucide-react";

import type { PimiaInvoice } from "@/features/pimia/api/invoices";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { useRecordPimiaInvoicePayment } from "@/features/pimia/hooks/usePimiaResources";
import { todayIso } from "@/features/pimia/lib/calendar";
import { formatCents, parseAmountToCents } from "@/features/pimia/lib/money";
import { exceedsCeiling, paymentCeiling } from "@/features/pimia/lib/payments";
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
  /* El reloj se lee DOS veces a propósito, y no se memoiza.
   *
   * `PimiaLeadsScreen` sí memoiza su «hoy» (`useMemo(() => todayIso(), [])`) y
   * tiene razón para hacerlo: allí «hoy» es el criterio con el que se pintan de
   * rojo cincuenta filas, y si cada tecla del buscador volviera a mirar el reloj
   * una sesión abierta a medianoche podría comparar dos filas contra días
   * distintos. Aquí «hoy» no compara nada: es el **valor por defecto de un campo
   * editable**, y lo que se quiere es exactamente lo contrario — que sea de
   * verdad el día en que se abre el diálogo. Congelarlo al montar dejaría que
   * una ventana abierta desde ayer por la tarde prellenara la fecha de ayer en
   * el cobro que se registra esta mañana, que es el mismo bug de trimestre que
   * el docblock cuenta, sólo que por el otro lado.
   *
   * De ahí las dos lecturas: la del montaje (perezosa, para no llamar al reloj
   * en cada render) y la del efecto de abrir, que es la que manda. Y por eso el
   * efecto vuelve a poner la fecha aunque el usuario la hubiera cambiado: cada
   * apertura es un cobro nuevo. */
  const [date, setDate] = React.useState(todayIso);
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
    setDate(todayIso());
    setErrorMessage(null);
  }, [invoice.dueCents, open]);

  const amountCents = parseAmountToCents(amount);
  const ceiling = paymentCeiling(invoice.dueCents, invoice.totalCents);
  const exceeds = exceedsCeiling(amountCents, ceiling);
  const canRecord =
    amountCents !== null &&
    amountCents > 0 &&
    !exceeds &&
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
              {ceiling.source === "due"
                ? `Pendiente: ${formatCents(ceiling.cents)}. `
                : "No se ha podido leer lo pendiente de esta factura. "}
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
            {exceeds && ceiling.source === "due" ? (
              <p
                className="-mt-2 text-xs text-destructive"
                data-testid="pimia-payment-over-due"
                role="alert"
              >
                Es más de lo pendiente: cobra como mucho{" "}
                {formatCents(ceiling.cents)}.
              </p>
            ) : null}
            {exceeds && ceiling.source === "total" ? (
              <p
                className="-mt-2 text-xs text-destructive"
                data-testid="pimia-payment-over-total"
                role="alert"
              >
                Es más que el total de la factura ({formatCents(ceiling.cents)}
                ). Como no se pudo leer lo pendiente, el tope de verdad lo pone
                Pimia al guardar.
              </p>
            ) : null}
            {ceiling.source === "unknown" ? (
              <p
                className="-mt-2 text-xs text-muted-foreground"
                data-testid="pimia-payment-no-ceiling"
              >
                Aquí no se comprueba cuánto queda pendiente porque no se ha
                podido leer. Pimia lo comprueba al guardar y avisa si el importe
                se pasa.
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
