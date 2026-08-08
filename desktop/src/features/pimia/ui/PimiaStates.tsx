/**
 * Los estados que toda pantalla del ERP comparte: sin conectar, cargando,
 * error y vacío.
 *
 * Están juntos a propósito. Un módulo del ERP sin tenant conectado no es un
 * error: es el estado normal antes de autorizar, y decirlo igual en todas las
 * pantallas evita que cada módulo invente el suyo.
 */

import * as React from "react";
import { AlertCircle, Plug } from "lucide-react";

import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { PimiaConnectDialog } from "@/features/pimia/ui/PimiaConnectDialog";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

export function PimiaNotConnected() {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false);

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="pimia-not-connected"
    >
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">
          Conecta tu Pimia
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Los datos del ERP viajan por la API de Pimia con tus permisos, nunca
          por el relay de mensajería.
        </p>
      </div>
      <Button onClick={() => setIsConnectOpen(true)}>
        <Plug className="h-4 w-4" />
        Conectar un tenant
      </Button>
      <PimiaConnectDialog
        onOpenChange={setIsConnectOpen}
        open={isConnectOpen}
      />
    </div>
  );
}

type PimiaErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
};

/**
 * Un error del ERP con la acción que corresponde a su causa: reconectar si el
 * grant murió, pedir permiso si falta un scope, reintentar si fue la red.
 */
export function PimiaErrorState({ error, onRetry }: PimiaErrorStateProps) {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false);
  const apiError = error instanceof PimiaApiError ? error : null;
  const needsReconnect = apiError?.kind === "unauthorized";
  const missingScope =
    apiError?.kind === "forbidden" ? apiError.missingScope : null;

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="pimia-error-state"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="h-6 w-6 text-destructive" />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          {apiError?.message ?? "No se pudieron cargar los datos de Pimia"}
        </p>
        {missingScope ? (
          <p className="text-sm text-muted-foreground">
            Falta el permiso <code className="font-mono">{missingScope}</code>.
            Vuelve a autorizar el tenant para concederlo.
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {needsReconnect || missingScope ? (
          <Button onClick={() => setIsConnectOpen(true)}>
            <Plug className="h-4 w-4" />
            Volver a autorizar
          </Button>
        ) : null}
        {onRetry ? (
          <Button onClick={onRetry} variant="outline">
            Reintentar
          </Button>
        ) : null}
      </div>
      <PimiaConnectDialog
        onOpenChange={setIsConnectOpen}
        open={isConnectOpen}
      />
    </div>
  );
}

export function PimiaRowsSkeleton({ rows = 6 }: { rows?: number }) {
  const placeholders = Array.from(
    { length: rows },
    (_, index) => `pimia-skeleton-${index}`,
  );

  return (
    <div className="space-y-2" data-testid="pimia-loading">
      {placeholders.map((id) => (
        <Skeleton className="h-12 w-full rounded-lg" key={id} />
      ))}
    </div>
  );
}

export function PimiaEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
      data-testid="pimia-empty"
    >
      {children}
    </p>
  );
}
