/**
 * Conectar un tenant de Pimia.
 *
 * La autorización se abre en el **navegador del sistema**, no en un webview
 * embebido: el usuario ve la barra de direcciones del tenant y su gestor de
 * contraseñas funciona. Mientras está fuera, este diálogo se queda esperando —
 * puede tardar minutos, así que hay un botón de cancelar de verdad.
 *
 * ⚠️ Y por eso el diálogo **no se fía solo de su promesa**. Si el webview se
 * recarga a media invocación —una recarga de Vite en desarrollo, un reinicio de
 * la app— el callback del comando se pierde (Tauri avisa con «Couldn't find
 * callback id …»), la promesa no se resuelve nunca y el spinner se queda para
 * siempre. Fue exactamente cómo se colgó el primer login real. Así que mientras
 * espera se le pregunta al backend en qué fase está, y si dice que ya no hay
 * nada en marcha se cuenta y se ofrece reintentar.
 */

import * as React from "react";
import { ExternalLink } from "lucide-react";

import {
  fetchPimiaConnectPhase,
  type PimiaConnectPhase,
} from "@/features/pimia/api/auth";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import {
  useCancelPimiaConnect,
  useConnectPimiaTenant,
} from "@/features/pimia/hooks/usePimiaAuth";
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

/** Cada cuánto se comprueba que la autorización sigue viva. */
const PHASE_POLL_MS = 2_000;

const PHASE_LABEL: Record<Exclude<PimiaConnectPhase, "idle">, string> = {
  awaitingBrowser: "Esperando a que autorices en el navegador…",
  exchanging: "Autorizado. Guardando el acceso…",
};

const ORPHANED_MESSAGE =
  "La autorización se interrumpió (la ventana se recargó por medio). Vuelve a intentarlo.";

type PimiaConnectDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function PimiaConnectDialog({
  onOpenChange,
  open,
}: PimiaConnectDialogProps) {
  const [baseUrl, setBaseUrl] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<PimiaConnectPhase>("idle");
  const connect = useConnectPimiaTenant();
  const cancel = useCancelPimiaConnect();
  // Se muestra en marcha solo si el backend lo confirma: una promesa huérfana
  // deja `connect.isPending` en `true` para siempre.
  const isConnecting = connect.isPending && phase !== "idle";

  // Mientras el diálogo cree que hay una autorización en vuelo, se le pregunta
  // al backend. En cuanto dice `idle` sin que la promesa haya resuelto, es que
  // el callback se quedó huérfano.
  React.useEffect(() => {
    if (!open || !connect.isPending) {
      return;
    }

    let cancelled = false;
    const check = async () => {
      try {
        const next = await fetchPimiaConnectPhase();
        if (cancelled) return;
        setPhase(next);
        if (next === "idle") {
          setErrorMessage(ORPHANED_MESSAGE);
        }
      } catch {
        // Si ni siquiera se puede preguntar, no se inventa nada: se deja como
        // está y el siguiente sondeo lo reintenta.
      }
    };

    void check();
    const timer = setInterval(() => void check(), PHASE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connect.isPending, open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isConnecting) {
      void cancel.mutateAsync();
    }
    if (!nextOpen) {
      setErrorMessage(null);
      setPhase("idle");
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setPhase("awaitingBrowser");
    try {
      await connect.mutateAsync(baseUrl);
      setBaseUrl("");
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof PimiaApiError
          ? error.message
          : String(error ?? "no se pudo conectar");
      // Cerrar el diálogo cancela la autorización, y esa cancelación vuelve por
      // aquí segundos después: pintarla dejaría un error rojo esperando en un
      // diálogo que el usuario ya cerró a propósito.
      if (/cancelad/i.test(message)) {
        return;
      }
      setErrorMessage(message);
    } finally {
      setPhase("idle");
    }
  };

  const canSubmit = !isConnecting && baseUrl.trim() !== "";

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent data-testid="pimia-connect-dialog">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Conectar un tenant de Pimia</DialogTitle>
            <DialogDescription>
              Se abrirá tu navegador para que autorices el acceso. Los permisos
              que concedas se guardan en el llavero del sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="pimia-tenant-url"
            >
              Dirección del tenant
            </label>
            <Input
              autoFocus
              disabled={isConnecting}
              id="pimia-tenant-url"
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="sdkdemo.taskai.work"
              value={baseUrl}
            />
            <p className="text-xs text-muted-foreground">
              El dominio donde vive tu Pimia. Un token vale para un solo tenant;
              puedes conectar varios y cambiar entre ellos.
            </p>
            {errorMessage ? (
              <p
                className="text-sm text-destructive"
                data-testid="pimia-connect-error"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}
            {isConnecting ? (
              <p
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-testid="pimia-connect-phase"
              >
                <Spinner className="h-3.5 w-3.5" />
                {PHASE_LABEL[phase]}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button disabled={!canSubmit} type="submit">
              <ExternalLink className="h-4 w-4" />
              Autorizar en el navegador
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
