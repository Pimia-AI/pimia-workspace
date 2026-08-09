/**
 * Las acciones de documento de un presupuesto.
 *
 * Un módulo y no dos porque la ficha y la fila ofrecen **lo mismo**: si el menú
 * de la lista deja marcar como aceptado y la ficha no, el usuario aprende que
 * hay que buscar la acción en el sitio correcto en vez de donde esté mirando.
 * Lo único que cambia es el envoltorio — la ficha añade delante la acción
 * primaria que toca según el estado.
 *
 * Cada acción con el cuidado que merece, que no es el mismo para todas:
 *
 * - **Cambiar de estado** no pregunta: se deshace desde el mismo menú.
 * - **Duplicar** y **convertir a factura** crean un documento nuevo, y a este
 *   módulo no se le puede pedir que lo borre. Preguntan.
 * - **Enviar** sale de la app hacia una persona real: no pregunta «¿seguro?»,
 *   abre un diálogo donde se ve **qué** se manda y **a quién**
 *   (`PimiaEstimateSendDialog`).
 * - **El PDF** solo abre el navegador.
 *
 * «Marcar como enviado» se queda **además** de enviar, y no sobra: la mayoría
 * de los presupuestos salen por WhatsApp o en mano, y registrar eso no es lo
 * mismo que mandar un correo.
 */

import * as React from "react";
import {
  CheckCircle2,
  Files,
  FileText,
  MoreHorizontal,
  Receipt,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type {
  PimiaEstimate,
  PimiaEstimateManualStatus,
} from "@/features/pimia/api/estimates";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { openExternalUrl } from "@/features/pimia/api/shell";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  useChangePimiaEstimateStatus,
  useClonePimiaEstimate,
  useConvertPimiaEstimateToInvoice,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaConnectDialog } from "@/features/pimia/ui/PimiaConnectDialog";
import { PimiaEstimateSendDialog } from "@/features/pimia/ui/PimiaEstimateSendDialog";
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

/**
 * El permiso que exige convertir. Lo comprueba el guard de la API contra el
 * token; aquí se mira el grant guardado para no ofrecer un botón que va a dar
 * 403 sin explicar por qué.
 */
const CONVERT_SCOPE = "invoices:write";

/** Alias de acceso total del catálogo de Pimia: los llevan otros clientes. */
const FULL_ACCESS_SCOPES = ["mcp", "api:full"];

function grantAllows(scopes: readonly string[], scope: string) {
  return (
    scopes.includes(scope) ||
    FULL_ACCESS_SCOPES.some((alias) => scopes.includes(alias))
  );
}

const STATUS_LABELS: Record<PimiaEstimateManualStatus, string> = {
  SENT: "Marcar como enviado",
  ACCEPTED: "Marcar como aceptado",
  REJECTED: "Marcar como rechazado",
};

const STATUS_DONE: Record<PimiaEstimateManualStatus, string> = {
  SENT: "Marcado como enviado",
  ACCEPTED: "Marcado como aceptado",
  REJECTED: "Marcado como rechazado",
};

const STATUS_ICONS: Record<PimiaEstimateManualStatus, typeof CheckCircle2> = {
  SENT: Send,
  ACCEPTED: CheckCircle2,
  REJECTED: XCircle,
};

/** Lo que pregunta antes de hacerse. `null` mientras no hay nada pendiente. */
type Confirmation = "clone" | "convert" | "convertNeedsScope";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof PimiaApiError ? error.message : fallback;
}

/**
 * La acción primaria de la ficha, que cambia con el estado.
 *
 * Es el mismo criterio del panel de Pimia: en cada punto del recorrido hay una
 * sola cosa que uno viene a hacer. Un presupuesto sin mandar se manda; uno
 * mandado espera respuesta; uno aceptado se factura —el final feliz del
 * documento—; y uno rechazado o caducado se vuelve a presupuestar.
 */
function primaryActionFor(
  status: string,
): PimiaEstimateManualStatus | "send" | "convert" | "clone" | null {
  switch (status) {
    // Un borrador todavía no ha salido, así que lo que toca es mandarlo. El
    // «marcar como enviado» sigue en el menú para el que lo mandó por fuera.
    case "DRAFT":
      return "send";
    case "SENT":
    case "VIEWED":
      return "ACCEPTED";
    case "ACCEPTED":
      return "convert";
    case "REJECTED":
    case "EXPIRED":
      return "clone";
    default:
      return null;
  }
}

type PimiaEstimateActionsProps = {
  estimate: PimiaEstimate;
  /**
   * Items de navegación que van arriba del menú (ver la ficha, ver el cliente,
   * copiar el número). Los pone quien usa el menú porque solo él sabe a dónde
   * puede navegar desde donde está.
   */
  navigationItems?: React.ReactNode;
  /** La acción primaria contextual, delante del menú. Solo en la ficha. */
  showPrimaryAction?: boolean;
};

export function PimiaEstimateActions({
  estimate,
  navigationItems,
  showPrimaryAction = false,
}: PimiaEstimateActionsProps) {
  const tenant = useActivePimiaTenant();
  const { goPimiaEstimate } = useAppNavigation();
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(
    null,
  );
  const [isReconnectOpen, setIsReconnectOpen] = React.useState(false);
  const [isSendOpen, setIsSendOpen] = React.useState(false);

  const changeStatus = useChangePimiaEstimateStatus();
  const clone = useClonePimiaEstimate();
  const convert = useConvertPimiaEstimateToInvoice();

  const canConvert = grantAllows(tenant?.scopes ?? [], CONVERT_SCOPE);
  const isBusy = changeStatus.isPending || clone.isPending || convert.isPending;

  const handleStatus = async (status: PimiaEstimateManualStatus) => {
    try {
      await changeStatus.mutateAsync({ estimateId: estimate.id, status });
      toast.success(`${STATUS_DONE[status]} ${estimate.estimateNumber}`);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo cambiar el estado"));
    }
  };

  const handlePdf = async () => {
    if (!estimate.pdfUrl) {
      return;
    }
    try {
      await openExternalUrl(estimate.pdfUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo abrir el PDF",
      );
    }
  };

  const handleClone = async () => {
    setConfirmation(null);
    try {
      const copy = await clone.mutateAsync(estimate.id);
      if (!copy) {
        toast.success("Presupuesto duplicado");
        return;
      }
      // Llevar al duplicado y no quedarse en el original: se duplica para
      // editarlo, y el número nuevo lo pone el servidor.
      toast.success(`Duplicado en ${copy.estimateNumber}`);
      void goPimiaEstimate(copy.id);
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo duplicar el presupuesto"));
    }
  };

  const handleConvert = async () => {
    setConfirmation(null);
    try {
      const invoice = await convert.mutateAsync(estimate.id);
      // Sin módulo de facturas todavía en el workspace: el aviso dice qué se
      // creó y ofrece terminarla donde sí se puede.
      toast.success("Factura borrador creada", {
        action:
          tenant && invoice
            ? {
                label: "Abrir en Pimia",
                onClick: () => {
                  void openExternalUrl(
                    `${tenant.baseUrl}/admin/invoices/${invoice.id}/view`,
                  ).catch(() => {
                    toast.error("No se pudo abrir el panel de Pimia");
                  });
                },
              }
            : undefined,
        description: `A partir de ${estimate.estimateNumber}. Se numera al emitirla.`,
      });
    } catch (error) {
      // El grant podía estar al día en el llavero y haber caducado el permiso
      // en el servidor: el 403 manda sobre lo que dijera `tenant.scopes`.
      if (error instanceof PimiaApiError && error.kind === "forbidden") {
        setConfirmation("convertNeedsScope");
        return;
      }
      toast.error(errorMessage(error, "No se pudo convertir en factura"));
    }
  };

  const requestConvert = () => {
    setConfirmation(canConvert ? "convert" : "convertNeedsScope");
  };

  const statuses = (
    Object.keys(STATUS_LABELS) as PimiaEstimateManualStatus[]
  ).filter((status) => status !== estimate.status);

  const primary = primaryActionFor(estimate.status);

  return (
    <>
      {showPrimaryAction && primary ? (
        <Button
          data-testid="pimia-estimate-primary-action"
          disabled={isBusy}
          onClick={() => {
            if (primary === "send") {
              setIsSendOpen(true);
            } else if (primary === "convert") {
              requestConvert();
            } else if (primary === "clone") {
              setConfirmation("clone");
            } else {
              void handleStatus(primary);
            }
          }}
        >
          {isBusy ? <Spinner className="h-3.5 w-3.5" /> : null}
          {primary === "send" ? (
            <>
              <Send className="h-4 w-4" />
              Enviar
            </>
          ) : primary === "convert" ? (
            <>
              <Receipt className="h-4 w-4" />
              Convertir en factura
            </>
          ) : primary === "clone" ? (
            <>
              <Files className="h-4 w-4" />
              Duplicar
            </>
          ) : (
            <>
              {React.createElement(STATUS_ICONS[primary], {
                className: "h-4 w-4",
              })}
              {STATUS_LABELS[primary]}
            </>
          )}
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Acciones de ${estimate.estimateNumber}`}
            className={
              showPrimaryAction ? undefined : "h-7 w-7 text-muted-foreground"
            }
            data-testid={`pimia-estimate-actions-${estimate.id}`}
            disabled={isBusy}
            size="icon"
            variant={showPrimaryAction ? "outline" : "ghost"}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {navigationItems}
          {navigationItems ? <DropdownMenuSeparator /> : null}

          {/* Siempre disponible: mandar un presupuesto nunca es inválido para
              el servidor, y el estado solo cambia cómo se llama la acción. */}
          <DropdownMenuItem onSelect={() => setIsSendOpen(true)}>
            <Send className="h-4 w-4" />
            {estimate.status === "DRAFT" ? "Enviar por correo" : "Reenviar"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {statuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onSelect={() => void handleStatus(status)}
            >
              {React.createElement(STATUS_ICONS[status], {
                className: "h-4 w-4",
              })}
              {STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setConfirmation("clone")}>
            <Files className="h-4 w-4" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={requestConvert}>
            <Receipt className="h-4 w-4" />
            Convertir en factura
          </DropdownMenuItem>

          {/* Solo si el servidor mandó la dirección: una entrada que no puede
              abrir nada es justo lo que este menú no tiene. */}
          {estimate.pdfUrl ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handlePdf()}>
                <FileText className="h-4 w-4" />
                Abrir el PDF
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Fuera del menú a propósito: dentro de `DropdownMenuContent` el diálogo
          se desmontaría con él en cuanto se elige la opción. */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
        open={confirmation !== null}
      >
        <AlertDialogContent data-testid="pimia-estimate-confirm">
          {confirmation === "clone" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Duplicar {estimate.estimateNumber}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se crea un presupuesto nuevo en borrador con las mismas líneas
                  e impuestos, con la fecha de hoy. Pimia le pone el siguiente
                  número de la serie.
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

          {confirmation === "convert" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Convertir {estimate.estimateNumber} en factura?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se crea una factura <strong>borrador y sin numerar</strong>{" "}
                  con las líneas de este presupuesto. No gasta número de la
                  serie: Pimia se lo pone al emitirla, y hasta entonces se puede
                  descartar desde el panel.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleConvert()}>
                  Convertir en factura
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}

          {confirmation === "convertNeedsScope" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Falta un permiso</AlertDialogTitle>
                <AlertDialogDescription>
                  Convertir un presupuesto crea una factura de verdad, así que
                  Pimia pide también el permiso{" "}
                  <code className="font-mono">{CONVERT_SCOPE}</code>. Este
                  tenant se conectó antes de que la app lo pidiera: vuelve a
                  autorizarlo y la acción queda disponible.
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

      <PimiaEstimateSendDialog
        estimate={estimate}
        onOpenChange={setIsSendOpen}
        onSent={(to) => {
          // El servidor ENCOLA el correo, así que lo honesto es decir que se
          // mandó, no que llegó.
          toast.success(`${estimate.estimateNumber} enviado a ${to}`);
        }}
        open={isSendOpen}
      />
    </>
  );
}
