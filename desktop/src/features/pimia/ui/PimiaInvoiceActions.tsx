/**
 * Las acciones de documento de una factura — el molde de
 * `PimiaEstimateActions`: ficha y fila ofrecen lo mismo, la primaria cambia con
 * el estado, y el cuidado es proporcional a lo que cuesta deshacer.
 *
 * Aquí lo irreversible de verdad es **publicar**: número oficial de la serie y
 * registro en VeriFactu (AEAT). Su diálogo cuenta eso, y el de enviar avisa de
 * que un borrador se publica primero. Registrar un cobro escribe en el dominio
 * `payments` — con un grant viejo se explica y se ofrece reautorizar, igual
 * que convertir en presupuestos.
 *
 * ⚖️ Borrar no está, a propósito: una factura emitida no se borra, **se
 * rectifica** — y esa es justo la acción que aquí ocupa su lugar. VeriFactu no
 * está en este menú a propósito: sus acciones dependen de un estado que solo se
 * ve en la ficha, y ofrecerlas desde una fila sería pedir a ciegas.
 */

import * as React from "react";
import {
  CheckCircle2,
  Files,
  FileMinus2,
  FileText,
  HandCoins,
  MoreHorizontal,
  Send,
  Stamp,
} from "lucide-react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { PimiaInvoice } from "@/features/pimia/api/invoices";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { openExternalUrl } from "@/features/pimia/api/shell";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  useClonePimiaInvoice,
  useCreatePimiaCreditNote,
  useMarkPimiaInvoiceSent,
  usePublishPimiaInvoice,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaConnectDialog } from "@/features/pimia/ui/PimiaConnectDialog";
import { PimiaInvoicePaymentDialog } from "@/features/pimia/ui/PimiaInvoicePaymentDialog";
import { PimiaInvoiceSendDialog } from "@/features/pimia/ui/PimiaInvoiceSendDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Spinner } from "@/shared/ui/spinner";

const PAYMENTS_SCOPE = "payments:write";
const FULL_ACCESS_SCOPES = ["mcp", "api:full"];

function grantAllows(scopes: readonly string[], scope: string) {
  return (
    scopes.includes(scope) ||
    FULL_ACCESS_SCOPES.some((alias) => scopes.includes(alias))
  );
}

type Confirmation =
  | "publish"
  | "markSent"
  | "clone"
  | "creditNote"
  | "paymentNeedsScope";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof PimiaApiError ? error.message : fallback;
}

/**
 * La primaria según el recorrido: un borrador se publica; una publicada o
 * vista se cobra en cuanto está enviada; una pagada del todo no pide nada más
 * que el menú.
 */
function primaryActionFor(
  invoice: PimiaInvoice,
): "publish" | "send" | "payment" | null {
  if (invoice.status === "DRAFT") {
    return "publish";
  }
  if (invoice.status === "PUBLISHED") {
    return "send";
  }
  if (invoice.paidStatus !== "PAID" && !invoice.isCreditNote) {
    return "payment";
  }
  return null;
}

export function PimiaInvoiceActions({
  invoice,
  navigationItems,
  showPrimaryAction = false,
}: {
  invoice: PimiaInvoice;
  navigationItems?: React.ReactNode;
  showPrimaryAction?: boolean;
}) {
  const tenant = useActivePimiaTenant();
  const { goPimiaInvoice } = useAppNavigation();
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(
    null,
  );
  const [isReconnectOpen, setIsReconnectOpen] = React.useState(false);
  const [isSendOpen, setIsSendOpen] = React.useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = React.useState(false);

  const publish = usePublishPimiaInvoice();
  const markSent = useMarkPimiaInvoiceSent();
  const clone = useClonePimiaInvoice();
  const creditNote = useCreatePimiaCreditNote();

  const canRecordPayment = grantAllows(tenant?.scopes ?? [], PAYMENTS_SCOPE);
  const isBusy =
    publish.isPending ||
    markSent.isPending ||
    clone.isPending ||
    creditNote.isPending;
  const isDraft = invoice.status === "DRAFT";

  /**
   * Las dos condiciones que el servidor comprueba y la UI puede saber: ni de un
   * borrador (no hay nada emitido que corregir) ni de otra rectificativa. La
   * tercera —que ya exista la suya— solo la sabe el servidor, y su 422 trae el
   * número de la que existe, así que se ofrece y se enseña lo que conteste.
   */
  const canCreditNote = !isDraft && !invoice.isCreditNote;

  const handlePublish = async () => {
    setConfirmation(null);
    try {
      await publish.mutateAsync(invoice.id);
      toast.success("Factura publicada", {
        description: "Con número oficial y registrada en VeriFactu.",
      });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo publicar la factura"));
    }
  };

  const handleMarkSent = async () => {
    setConfirmation(null);
    try {
      await markSent.mutateAsync(invoice.id);
      toast.success("Marcada como enviada");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo marcar como enviada"));
    }
  };

  const handleClone = async () => {
    setConfirmation(null);
    try {
      const copy = await clone.mutateAsync(invoice.id);
      toast.success("Duplicada en un borrador nuevo");
      if (copy) {
        void goPimiaInvoice(copy.id);
      }
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo duplicar la factura"));
    }
  };

  const handleCreditNote = async () => {
    setConfirmation(null);
    try {
      const created = await creditNote.mutateAsync(invoice.id);
      toast.success(
        created?.invoiceNumber
          ? `Rectificativa ${created.invoiceNumber} creada`
          : "Rectificativa creada",
      );
      if (created) {
        void goPimiaInvoice(created.id);
      }
    } catch (error) {
      // El 422 de «ya existe una rectificativa» trae su número dentro: es más
      // útil que cualquier texto propio, así que se enseña tal cual.
      toast.error(errorMessage(error, "No se pudo crear la rectificativa"));
    }
  };

  const handlePdf = async () => {
    if (!invoice.pdfUrl) {
      return;
    }
    try {
      await openExternalUrl(invoice.pdfUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo abrir el PDF",
      );
    }
  };

  const requestPayment = () => {
    if (canRecordPayment) {
      setIsPaymentOpen(true);
    } else {
      setConfirmation("paymentNeedsScope");
    }
  };

  const primary = primaryActionFor(invoice);

  return (
    <>
      {showPrimaryAction && primary ? (
        <Button
          data-testid="pimia-invoice-primary-action"
          disabled={isBusy}
          onClick={() => {
            if (primary === "publish") {
              setConfirmation("publish");
            } else if (primary === "send") {
              setIsSendOpen(true);
            } else {
              requestPayment();
            }
          }}
        >
          {isBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
          {primary === "publish" ? (
            <>
              <Stamp className="h-4 w-4" />
              Publicar
            </>
          ) : primary === "send" ? (
            <>
              <Send className="h-4 w-4" />
              Enviar
            </>
          ) : (
            <>
              <HandCoins className="h-4 w-4" />
              Registrar cobro
            </>
          )}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Acciones de ${invoice.invoiceNumber ?? "la factura sin numerar"}`}
            className={
              showPrimaryAction ? undefined : "h-7 w-7 text-muted-foreground"
            }
            data-testid={`pimia-invoice-actions-${invoice.id}`}
            disabled={isBusy}
            size="icon"
            variant={showPrimaryAction ? "outline" : "ghost"}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {navigationItems}
          {navigationItems ? <DropdownMenuSeparator /> : null}

          {isDraft ? (
            <DropdownMenuItem onSelect={() => setConfirmation("publish")}>
              <Stamp className="h-4 w-4" />
              Publicar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setIsSendOpen(true)}>
            <Send className="h-4 w-4" />
            {isDraft
              ? "Publicar y enviar por correo"
              : invoice.status === "PUBLISHED"
                ? "Enviar por correo"
                : "Reenviar"}
          </DropdownMenuItem>
          {/* El servidor solo acepta SENT desde borrador o publicada. */}
          {isDraft || invoice.status === "PUBLISHED" ? (
            <DropdownMenuItem onSelect={() => setConfirmation("markSent")}>
              <CheckCircle2 className="h-4 w-4" />
              Marcar como enviada
            </DropdownMenuItem>
          ) : null}
          {!isDraft &&
          invoice.paidStatus !== "PAID" &&
          !invoice.isCreditNote ? (
            <DropdownMenuItem onSelect={requestPayment}>
              <HandCoins className="h-4 w-4" />
              Registrar cobro
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          {/* ⚖️ El lugar de «borrar»: una emitida no se borra, se rectifica. */}
          {canCreditNote ? (
            <DropdownMenuItem onSelect={() => setConfirmation("creditNote")}>
              <FileMinus2 className="h-4 w-4" />
              Crear rectificativa
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setConfirmation("clone")}>
            <Files className="h-4 w-4" />
            Duplicar
          </DropdownMenuItem>
          {/* Sin publicar no hay PDF: el documento aún no existe hacia fuera. */}
          {invoice.pdfUrl ? (
            <DropdownMenuItem onSelect={() => void handlePdf()}>
              <FileText className="h-4 w-4" />
              Abrir el PDF
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
        open={confirmation !== null}
      >
        <AlertDialogContent data-testid="pimia-invoice-confirm">
          {confirmation === "publish" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Publicar esta factura?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se le asigna el <strong>número oficial</strong> de la serie y
                  se registra en <strong>VeriFactu</strong> (AEAT). A partir de
                  ahí la factura no se puede borrar ni renumerar: los errores se
                  corrigen con una rectificativa.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handlePublish()}>
                  Publicar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}

          {confirmation === "markSent" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Marcar como enviada?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isDraft ? (
                    <>
                      Es un borrador, así que primero se{" "}
                      <strong>publica</strong> —número oficial y VeriFactu— y
                      después queda como enviada. No manda ningún correo.
                    </>
                  ) : (
                    <>
                      Registra que la factura salió por fuera (correo aparte, en
                      mano). No manda ningún correo.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleMarkSent()}>
                  Marcar como enviada
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}

          {confirmation === "clone" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Duplicar la factura?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se crea un <strong>borrador nuevo, sin número</strong>, con
                  las mismas líneas e impuestos y la fecha de hoy. No toca la
                  factura original.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleClone()}>
                  Duplicar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}

          {confirmation === "creditNote" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Crear la rectificativa de{" "}
                  {invoice.invoiceNumber ?? "esta factura"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se emite una <strong>factura nueva</strong> de la serie{" "}
                  <span className="font-mono">R-</span>, con su propio número
                  oficial desde el primer momento y las mismas líneas e
                  impuestos <strong>en negativo</strong>. Queda emitida y
                  saldada, enlazada a esta factura, que{" "}
                  <strong>no se toca</strong>: la rectificativa la corrige, no
                  la sustituye ni la borra. Solo puede haber una por factura.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleCreditNote()}>
                  Crear rectificativa
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}

          {confirmation === "paymentNeedsScope" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Falta un permiso</AlertDialogTitle>
                <AlertDialogDescription>
                  Registrar un cobro crea un pago de verdad, así que Pimia pide
                  el permiso <code className="font-mono">{PAYMENTS_SCOPE}</code>
                  . Este tenant se conectó antes de que la app lo pidiera:
                  vuelve a autorizarlo y la acción queda disponible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Ahora no</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmation(null);
                    setIsReconnectOpen(true);
                  }}
                >
                  Volver a autorizar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      <PimiaConnectDialog
        onOpenChange={setIsReconnectOpen}
        open={isReconnectOpen}
      />

      <PimiaInvoiceSendDialog
        invoice={invoice}
        onOpenChange={setIsSendOpen}
        onSent={(to) => {
          toast.success(
            `${invoice.invoiceNumber ?? "Factura"} enviada a ${to}`,
          );
        }}
        open={isSendOpen}
      />

      <PimiaInvoicePaymentDialog
        invoice={invoice}
        onOpenChange={setIsPaymentOpen}
        onRecorded={() => {
          toast.success("Cobro registrado");
        }}
        open={isPaymentOpen}
      />
    </>
  );
}
