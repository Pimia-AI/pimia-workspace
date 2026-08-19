/**
 * Mandar un presupuesto por correo.
 *
 * **Esta acción sale de la app hacia una persona real y no se deshace**, así
 * que el diálogo existe para que nadie la dispare sin ver qué manda: a quién,
 * con qué asunto y con qué texto, los tres editables. Un clic suelto en un menú
 * no basta para algo que el destinatario va a leer.
 *
 * ⚠️ **El destinatario de un presupuesto no siempre es un cliente**, y de ahí
 * sale la única diferencia de fondo con el diálogo de la factura: se le manda
 * igual a una oportunidad del CRM, que todavía no está dada de alta. Sembrar el
 * campo «Para» con `customerEmail` a secas dejaba el campo **vacío** justo en
 * esos —`customer_id` llega `null` por construcción— teniendo el ERP el correo
 * cargado en el mismo objeto, y encima explicaba el hueco hablando de un cliente
 * que no existe. Quién es el destinatario lo decide `estimateGoesToLead`, la
 * misma función que pinta la insignia en la ficha y en el índice; de dónde sale
 * su dirección, `resolveEstimateMailRecipient`, aquí abajo.
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
import { estimateGoesToLead } from "@/features/pimia/ui/PimiaEstimateDocument";
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

/**
 * Por qué el campo «Para» nace vacío, cuando nace vacío.
 *
 * Son cuatro huecos **distintos** y el diálogo los dice distintos, porque lo que
 * hay que hacer con cada uno no es lo mismo: darle de alta un correo al cliente,
 * dárselo a la oportunidad en el CRM, abrir la ficha para que llegue la
 * proyección que el índice no manda, o asignarle destinatario al borrador. Un
 * único «no hay correo» los taparía los cuatro con la misma frase, y tres de
 * ellas serían mentira.
 */
type PimiaEstimateMailGap =
  | "customer-without-mail"
  | "lead-without-mail"
  | "lead-not-loaded"
  | "no-recipient";

const MAIL_GAP_NOTES: Record<PimiaEstimateMailGap, string> = {
  "customer-without-mail":
    "Este cliente no tiene email en su ficha: escribe la dirección a mano o añádesela en Pimia.",
  "lead-without-mail":
    "La oportunidad no tiene correo en el CRM: escribe la dirección a mano o añádeselo en Pimia.",
  "lead-not-loaded":
    "Este presupuesto va a una oportunidad del CRM y el servidor no ha mandado su ficha, así que aquí no consta su correo: escribe la dirección a mano, o ábrelo para verla.",
  "no-recipient":
    "Este presupuesto todavía no tiene destinatario en Pimia —ni cliente ni oportunidad—: escribe la dirección a mano.",
};

/**
 * El destinatario **real** del presupuesto: cómo se llama y qué dirección sabe
 * el ERP de él.
 *
 * `gap` es la otra mitad del trabajo, y no un adorno: cuando no hay dirección
 * que sembrar, el diálogo tiene que decir **por qué** no la hay. Sin eso el
 * usuario ve un campo vacío en un ERP que sí tenía el dato en pantalla tres
 * centímetros más arriba, y no puede saber si es un hueco del CRM o un fallo de
 * la app.
 */
export type PimiaEstimateMailRecipient = {
  /** La dirección que el ERP sabe, o `null` si no sabe ninguna. Nunca `""`. */
  email: string | null;
  /** Cómo nombrarlo en la cabecera del diálogo, o `null` si no consta. */
  name: string | null;
  /** El hueco a explicar, o `null` cuando sí hay dirección. */
  gap: PimiaEstimateMailGap | null;
  /** Si va a una oportunidad del CRM (`estimateGoesToLead`). */
  isLead: boolean;
};

/**
 * De quién es el correo con el que se siembra el campo «Para».
 *
 * El criterio es el del papel y el del índice —`estimateGoesToLead`, que mira
 * los **dos** ids— y no una tercera regla escrita aquí: el que recibe el correo
 * tiene que ser el mismo a quien el documento va dirigido, o se le manda a una
 * persona el presupuesto que lleva escrito el nombre de otra.
 *
 * ⛔ **No hay respaldo cruzado**: a un presupuesto de cliente sin correo NO se
 * le pone la dirección del lead que arrastre, ni al revés. Sería mandarle el
 * papel a quien no lo pidió, y el hueco se explica —ver `gap`— en vez de
 * rellenarse con lo primero que haya a mano.
 *
 * ⚠️ Con la relación `lead` sin cargar no se afirma que la oportunidad no tenga
 * correo: el índice pide `view=summary` y el contrato no promete la proyección,
 * así que ahí lo que falta es el dato, no el correo (`lead-not-loaded`).
 */
export function resolveEstimateMailRecipient(
  estimate: PimiaEstimate,
): PimiaEstimateMailRecipient {
  if (estimateGoesToLead(estimate)) {
    const lead = estimate.lead;
    if (!lead) {
      return { email: null, name: null, gap: "lead-not-loaded", isLead: true };
    }
    return {
      email: lead.email,
      /* Lo mismo que escribe el papel en «Presupuesto para»: la persona, si no
         la organización, si no el título de la oportunidad. */
      name: lead.personName ?? lead.organizationName ?? lead.title,
      gap: lead.email === null ? "lead-without-mail" : null,
      isLead: true,
    };
  }

  /* Sin cliente y sin oportunidad: un borrador al que todavía no se le ha
     puesto destinatario, que es un estado real y no un error de lectura. */
  if (estimate.customerId === null) {
    return { email: null, name: null, gap: "no-recipient", isLead: false };
  }

  return {
    email: estimate.customerEmail,
    name: estimate.customerName,
    gap: estimate.customerEmail === null ? "customer-without-mail" : null,
    isLead: false,
  };
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

  const recipient = resolveEstimateMailRecipient(estimate);
  // La dirección, suelta y como primitivo: es lo que siembra el campo y lo
  // único de lo que depende el efecto de abajo.
  const recipientEmail = recipient.email;

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
    setTo(recipientEmail ?? "");
    // El panel usa «Nuevo presupuesto» a secas; con el número, quien lo recibe
    // sabe de cuál se le habla sin abrir el adjunto.
    setSubject(`Presupuesto ${estimate.estimateNumber}`);
    setTouched(false);
    setErrorMessage(null);
  }, [estimate.estimateNumber, open, recipientEmail]);

  React.useEffect(() => {
    if (open && !touched && typeof mailBody.data === "string") {
      setBody(mailBody.data);
    }
  }, [mailBody.data, open, touched]);

  /* Con dirección sembrada desde el CRM se dice de dónde salió: el usuario está
     a punto de escribirle a alguien que no está dado de alta, y esa dirección no
     la ha tecleado él. Sin hueco que explicar y con cliente, no hay nota: la
     cabecera ya lo ha nombrado. */
  const recipientNote = recipient.gap
    ? MAIL_GAP_NOTES[recipient.gap]
    : recipient.isLead
      ? "La dirección sale de la ficha de la oportunidad en el CRM, que todavía no es un cliente dado de alta."
      : null;

  const canSend =
    looksLikeEmail(to) &&
    subject.trim() !== "" &&
    body.trim() !== "" &&
    !send.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const trimmedTo = to.trim();
    try {
      await send.mutateAsync({
        estimateId: estimate.id,
        mail: { to: trimmedTo, subject, body },
      });
      onOpenChange(false);
      onSent?.(trimmedTo);
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
              {/* El nombre del destinatario de verdad, sea cliente o del CRM.
                  Sin punto propio si el nombre ya lo trae: «Peñalba S.L..» es
                  el clásico de concatenar razones sociales. */}
              {recipient.name
                ? `A ${recipient.name}${recipient.name.endsWith(".") ? "" : "."}`
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
            {recipientNote ? (
              <p
                className="-mt-2 text-xs text-muted-foreground"
                data-testid="pimia-estimate-send-recipient-note"
              >
                {recipientNote}
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
