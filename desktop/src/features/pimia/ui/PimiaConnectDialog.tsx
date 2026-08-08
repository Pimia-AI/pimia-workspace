/**
 * Conectar un tenant de Pimia.
 *
 * La autorización se abre en el **navegador del sistema**, no en un webview
 * embebido: el usuario ve la barra de direcciones del tenant y su gestor de
 * contraseñas funciona. Mientras está fuera, este diálogo se queda esperando —
 * puede tardar minutos, así que hay un botón de cancelar de verdad.
 */

import * as React from "react";
import { ExternalLink } from "lucide-react";

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
  const connect = useConnectPimiaTenant();
  const cancel = useCancelPimiaConnect();
  const isConnecting = connect.isPending;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isConnecting) {
      void cancel.mutateAsync();
    }
    if (!nextOpen) {
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
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
    }
  };

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
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" />
                Esperando a que autorices en el navegador…
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
            <Button
              disabled={isConnecting || baseUrl.trim() === ""}
              type="submit"
            >
              <ExternalLink className="h-4 w-4" />
              Autorizar en el navegador
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
