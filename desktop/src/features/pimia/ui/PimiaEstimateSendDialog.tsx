/**
 * Mandar un presupuesto por correo.
 *
 * **Esta acción sale de la app hacia una persona real y no se deshace**, así
 * que el diálogo existe para que nadie la dispare sin ver qué manda: a quién,
 * con qué asunto y con qué texto, los tres editables. Un clic suelto en un menú
 * no basta para algo que el destinatario va a leer.
 *
 * Lo que **no** se pide es el remitente: lo pone el ERP con el correo
 * configurado de la empresa, y el que mandara un cliente se ignora (factSaas
 * #314/#315). Enseñarlo como campo sería prometer una elección que no existe.
 *
 * El cuerpo llega con la plantilla que la empresa tiene puesta —HTML, con
 * marcadores que sustituye el servidor al enviar—, igual que hace el panel de
 * Pimia. Aquí no se sustituye nada: verlos es más honesto que enseñar un texto
 * ya resuelto que luego el servidor vuelve a componer a su manera.
 */

import * as React from "react";
import { AlertTriangle, Send } from "lucide-react";

import type { PimiaEstimate } from "@/features/pimia/api/estimates";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import {
  usePimiaEstimateMailBodyQuery,
  useSendPimiaEstimate,
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

/**
 * Un filtro deliberadamente flojo: solo descarta lo que seguro no es una
 * dirección. Quien valida de verdad es el servidor de correo, y un patrón
 * estricto aquí solo serviría para rechazar direcciones válidas y raras.
 */
function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

type PimiaEstimateSendDialogProps = {
  estimate: PimiaEstimate;
  onOpenChange: (open: boolean) => void;
  onSent?: (to: string) => void;
  open: boolean;
};

export function PimiaEstimateSendDialog({
  estimate,
  onOpenChange,
  onSent,
  open,
}: PimiaEstimateSendDialogProps) {
  const send = useSendPimiaEstimate();
  // Solo se pide la plantilla cuando el diálogo se abre: sale de `/bootstrap`,
  // que devuelve el mundo entero, y no hace falta para pintar la ficha.
  const mailBody = usePimiaEstimateMailBodyQuery(open);

  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Al abrir se siembra desde el documento; mientras esté abierto no se pisa lo
  // que el usuario haya escrito, ni aunque la plantilla llegue después.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    setTo(estimate.customerEmail ?? "");
    // El panel usa «Nuevo presupuesto» a secas; con el número, quien lo recibe
    // sabe de cuál se le habla sin abrir el adjunto.
    setSubject(`Presupuesto ${estimate.estimateNumber}`);
    setTouched(false);
    setErrorMessage(null);
  }, [estimate.customerEmail, estimate.estimateNumber, open]);

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
        estimateId: estimate.id,
        mail: { to: recipient, subject, body },
      });
      onOpenChange(false);
      onSent?.(recipient);
    } catch (error) {
      setErrorMessage(
        error instanceof PimiaApiError
          ? error.message
          : "No se pudo enviar el presupuesto",
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-w-2xl"
        data-testid="pimia-estimate-send-dialog"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {/* El mismo verbo con el que se llegó aquí: si el menú dijo
                  «Reenviar», el diálogo no puede titularse «Enviar». */}
              {estimate.status === "DRAFT" ? "Enviar" : "Reenviar"}{" "}
              <span className="font-mono">{estimate.estimateNumber}</span>
            </DialogTitle>
            <DialogDescription>
              {/* Sin punto propio si el nombre ya lo trae: «Peñalba S.L..» es
                  el clásico de concatenar razones sociales. */}
              {estimate.customerName
                ? `A ${estimate.customerName}${estimate.customerName.endsWith(".") ? "" : "."}`
                : "Revisa el destinatario antes de mandarlo."}{" "}
              El remitente lo pone Pimia con el correo configurado de tu
              empresa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div
              className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
              data-testid="pimia-estimate-send-warning"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <p>
                El correo <strong className="font-medium">sale ya</strong> y no
                se puede deshacer. El presupuesto pasará a «enviado».
              </p>
            </div>

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-send-to"
            >
              Para
              <Input
                id="pimia-send-to"
                onChange={(event) => setTo(event.target.value)}
                placeholder="cliente@ejemplo.es"
                type="email"
                value={to}
              />
            </label>
            {!estimate.customerEmail ? (
              <p className="-mt-2 text-xs text-muted-foreground">
                Este cliente no tiene email en su ficha: escribe la dirección a
                mano o añádesela en Pimia.
              </p>
            ) : null}

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-send-subject"
            >
              Asunto
              <Input
                id="pimia-send-subject"
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
            </label>

            <label
              className="flex flex-col gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              htmlFor="pimia-send-body"
            >
              Mensaje
              <textarea
                className="min-h-28 w-full rounded-md border border-input/40 bg-background px-3 py-2 text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                id="pimia-send-body"
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
                : "Admite HTML. Pimia sustituye los marcadores al enviar: {ESTIMATE_NUMBER}, {COMPANY_NAME}…"}
            </p>

            {errorMessage ? (
              <p
                className="text-sm text-destructive"
                data-testid="pimia-estimate-send-error"
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
              data-testid="pimia-estimate-send-confirm"
              disabled={!canSend}
              type="submit"
            >
              {send.isPending ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
