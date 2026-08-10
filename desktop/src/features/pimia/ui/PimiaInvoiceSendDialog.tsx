/**
 * Mandar una factura por correo. El molde de `PimiaEstimateSendDialog` con la
 * diferencia que importa: **enviar un borrador lo PUBLICA primero** (número
 * oficial + registro en VeriFactu), y eso el diálogo lo dice antes, no se
 * descubre después. El remitente tampoco es un campo: lo pone el ERP.
 */

import * as React from "react";
import { AlertTriangle, Send } from "lucide-react";

import type { PimiaInvoice } from "@/features/pimia/api/invoices";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import {
  usePimiaInvoiceMailBodyQuery,
  useSendPimiaInvoice,
} from "@/features/pimia/hooks/usePimiaResources";
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

function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function PimiaInvoiceSendDialog({
  invoice,
  onOpenChange,
  onSent,
  open,
}: {
  invoice: PimiaInvoice;
  onOpenChange: (open: boolean) => void;
  onSent?: (to: string) => void;
  open: boolean;
}) {
  const send = useSendPimiaInvoice();
  const mailBody = usePimiaInvoiceMailBodyQuery(open);
  const isDraft = invoice.status === "DRAFT";

  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setTo(invoice.customerEmail ?? "");
    // Un borrador no tiene número que citar: el asunto genérico es honesto, y
    // el servidor lo numerará al publicar en este mismo envío.
    setSubject(
      invoice.invoiceNumber ? `Factura ${invoice.invoiceNumber}` : "Su factura",
    );
    setTouched(false);
    setErrorMessage(null);
  }, [invoice.customerEmail, invoice.invoiceNumber, open]);

  React.useEffect(() => {
    if (open && !touched && typeof mailBody.data === "string") {
      setBody(mailBody.data);
    }
  }, [mailBody.data, open, touched]);

  const canSend =
    looksLikeEmail(to) &&
    subject.trim() !== "" &&
    body.trim() !== "" &&
    !send.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const recipient = to.trim();
    try {
      await send.mutateAsync({
        invoiceId: invoice.id,
        mail: { to: recipient, subject, body },
      });
      onOpenChange(false);
      onSent?.(recipient);
    } catch (error) {
      setErrorMessage(
        error instanceof PimiaApiError
          ? error.message
          : "No se pudo enviar la factura",
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-2xl"
        data-testid="pimia-invoice-send-dialog"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isDraft ? "Publicar y enviar" : "Enviar"}{" "}
              {invoice.invoiceNumber ? (
                <span className="font-mono">{invoice.invoiceNumber}</span>
              ) : (
                "la factura"
              )}
            </DialogTitle>
            <DialogDescription>
              {invoice.customerName
                ? `A ${invoice.customerName}${invoice.customerName.endsWith(".") ? "" : "."}`
                : "Revisa el destinatario antes de mandarla."}{" "}
              El remitente lo pone Pimia con el correo configurado de tu
              empresa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div
              className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
              data-testid="pimia-invoice-send-warning"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <p>
                {isDraft ? (
                  <>
                    Enviar un borrador lo <strong>publica primero</strong>: se
                    le asigna número oficial y se registra en VeriFactu. Después
                    el correo <strong>sale ya</strong> y nada de esto se puede
                    deshacer.
                  </>
                ) : (
                  <>
                    El correo <strong>sale ya</strong> y no se puede deshacer.
                  </>
                )}
              </p>
            </div>

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-invoice-send-to"
            >
              Para
              <Input
                id="pimia-invoice-send-to"
                onChange={(event) => setTo(event.target.value)}
                placeholder="cliente@ejemplo.es"
                type="email"
                value={to}
              />
            </label>

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-invoice-send-subject"
            >
              Asunto
              <Input
                id="pimia-invoice-send-subject"
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </label>

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-invoice-send-body"
            >
              Mensaje
              <textarea
                className="min-h-28 w-full rounded-md border border-input/40 bg-background px-3 py-2 text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                id="pimia-invoice-send-body"
                onChange={(event) => {
                  setTouched(true);
                  setBody(event.target.value);
                }}
                value={body}
              />
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              {mailBody.isPending && !touched
                ? "Cargando la plantilla de tu empresa…"
                : "Admite HTML. Pimia sustituye los marcadores al enviar: {INVOICE_NUMBER}, {COMPANY_NAME}…"}
            </p>

            {errorMessage ? (
              <p
                className="text-sm text-destructive"
                data-testid="pimia-invoice-send-error"
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
              data-testid="pimia-invoice-send-confirm"
              disabled={!canSend}
              type="submit"
            >
              {send.isPending ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isDraft ? "Publicar y enviar" : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
