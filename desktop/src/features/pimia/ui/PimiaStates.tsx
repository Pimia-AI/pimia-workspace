/**
 * Los estados que toda pantalla del ERP comparte: sin conectar, cargando,
 * error y vacío.
 *
 * Están juntos a propósito. Un módulo del ERP sin tenant conectado no es un
 * error: es el estado normal antes de autorizar, y decirlo igual en todas las
 * pantallas evita que cada módulo invente el suyo. El vacío se cuida como el
 * resto — una lista sin filas es la primera pantalla que ve un tenant nuevo, y
 * debería invitar a la primera acción en vez de disculparse.
 */

import * as React from "react";
import { AlertCircle, FileText, Plug } from "lucide-react";

import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { PimiaConnectDialog } from "@/features/pimia/ui/PimiaConnectDialog";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/cn";

/** El marco común de los estados a pantalla completa. */
function PimiaStatePanel({
  action,
  children,
  icon: Icon,
  tone = "neutral",
  testId,
  title,
  ...rest
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  icon: typeof Plug;
  testId?: string;
  title: string;
  tone?: "neutral" | "danger";
} & React.HTMLAttributes<HTMLDivElement>) {
  const isDanger = tone === "danger";
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid={testId}
      {...rest}
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border",
          isDanger
            ? "border-destructive/30 bg-destructive/10"
            : "border-border bg-muted/40",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            "h-5 w-5",
            isDanger ? "text-destructive" : "text-muted-foreground",
          )}
        />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {children ? (
          <div className="max-w-sm text-sm text-muted-foreground">
            {children}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PimiaNotConnected() {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false);

  return (
    <>
      <PimiaStatePanel
        action={
          <Button onClick={() => setIsConnectOpen(true)}>
            <Plug className="h-4 w-4" />
            Conectar un tenant
          </Button>
        }
        icon={Plug}
        testId="pimia-not-connected"
        title="Conecta tu Pimia"
      >
        Los datos del ERP viajan por la API de Pimia con tus permisos, nunca por
        el relay de mensajería.
      </PimiaStatePanel>
      <PimiaConnectDialog
        onOpenChange={setIsConnectOpen}
        open={isConnectOpen}
      />
    </>
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
    <>
      <PimiaStatePanel
        action={
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
        }
        icon={AlertCircle}
        role="alert"
        testId="pimia-error-state"
        title={apiError?.message ?? "No se pudieron cargar los datos de Pimia"}
        tone="danger"
      >
        {missingScope ? (
          <>
            Falta el permiso <code className="font-mono">{missingScope}</code>.
            Vuelve a autorizar el tenant para concederlo.
          </>
        ) : null}
      </PimiaStatePanel>
      <PimiaConnectDialog
        onOpenChange={setIsConnectOpen}
        open={isConnectOpen}
      />
    </>
  );
}

/**
 * El esqueleto tiene la forma de la tabla que va a sustituir: mismo marco,
 * misma altura de fila. Un rectángulo suelto que luego se convierte en otra
 * cosa hace que la pantalla salte.
 */
export function PimiaRowsSkeleton({ rows = 6 }: { rows?: number }) {
  const placeholders = Array.from(
    { length: rows },
    (_, index) => `pimia-skeleton-${index}`,
  );

  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      data-testid="pimia-loading"
    >
      <div className="flex h-10 items-center border-b border-border px-3">
        <Skeleton className="h-3 w-24" />
      </div>
      {placeholders.map((id) => (
        <div
          className="flex h-12 items-center justify-between gap-4 border-b border-border px-3 last:border-b-0"
          key={id}
        >
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

type PimiaEmptyProps = {
  /** La primera acción a la que el vacío invita, cuando la hay. */
  action?: React.ReactNode;
  description?: React.ReactNode;
  title: string;
};

export function PimiaEmpty({ action, description, title }: PimiaEmptyProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-12 text-center"
      data-testid="pimia-empty"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/40">
        <FileText
          aria-hidden="true"
          className="h-5 w-5 text-muted-foreground"
        />
      </span>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
