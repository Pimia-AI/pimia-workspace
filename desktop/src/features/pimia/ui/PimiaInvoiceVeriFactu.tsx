/**
 * El bloque VeriFactu de la ficha de una factura: en qué estado quedó el
 * registro en la AEAT y qué se puede hacer al respecto.
 *
 * La paridad es el panel Vue (`views/invoices/View.vue`), con una diferencia
 * deliberada: allí los botones **solo** salen en los estados de fallo, así que
 * una factura atascada en «En cola» no tiene desde dónde refrescarse. Aquí
 * «Sincronizar» sale también en vuelo, que es cuando el estado local puede
 * estar viejo y releerlo no cambia nada en la AEAT.
 *
 * ⛔ **La regla que gobierna qué se ofrece: sin registro no hay nada que
 * tocar.** `sync` y `retry` contestan 422 sin `verifactu_record_id`, y eso
 * pasa en más casos de los que parece:
 *
 * - `pending` — el registro falló al publicar y el reintento automático está en
 *   marcha; el registro **nunca se creó**.
 * - `sandbox_only` — el plan no llega a producción; no se mandó.
 * - `error` — ambiguo: puede ser un registro rechazado por la AEAT (existe) o
 *   los reintentos automáticos agotados sin crearlo (no existe). Los dos
 *   escriben el mismo `aeat_status` y la fila no distingue.
 *
 * Ese último se resuelve **sondeando** `/verifactu/detail`, que es lo único que
 * lo sabe: su 422 «not registered» dice que no hay registro. Mientras el sondeo
 * está en vuelo no se promete un botón que vaya a fallar.
 */

import type * as React from "react";
import { QrCode, RefreshCw, RotateCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  AEAT_FAILURE_STATUSES,
  hasAeatState,
  type PimiaInvoice,
} from "@/features/pimia/api/invoices";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { openExternalUrl } from "@/features/pimia/api/shell";
import {
  usePimiaInvoiceVeriFactuQuery,
  useRetryPimiaInvoiceVeriFactu,
  useSyncPimiaInvoiceVeriFactu,
} from "@/features/pimia/hooks/usePimiaResources";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/lib/cn";

/** Estados en los que el registro sigue su curso y releerlo tiene sentido. */
const AEAT_IN_FLIGHT: readonly string[] = ["queued", "sent"];

/** Estados que significan «no existe registro», sin necesidad de sondear. */
const AEAT_UNREGISTERED: readonly string[] = ["pending", "sandbox_only"];

/** Nombra la región con su propio `<h2>`, igual que las tarjetas del raíl. */
const TITLE_ID = "pimia-invoice-verifactu-title";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof PimiaApiError ? error.message : fallback;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-all text-right font-mono text-xs text-foreground">
        {value}
      </span>
    </div>
  );
}

export function PimiaInvoiceVeriFactu({ invoice }: { invoice: PimiaInvoice }) {
  const status = invoice.aeatStatus;
  const isFailure = AEAT_FAILURE_STATUSES.includes(status ?? "");
  const isInFlight = AEAT_IN_FLIGHT.includes(status ?? "");

  // El sondeo solo en el fallo: es una llamada a la AEAT a través del ERP, y
  // en los demás estados no hay motivo que leer.
  const detail = usePimiaInvoiceVeriFactuQuery(invoice.id, isFailure);
  const sync = useSyncPimiaInvoiceVeriFactu();
  const retry = useRetryPimiaInvoiceVeriFactu();

  if (!hasAeatState(status)) {
    return null;
  }

  const isBusy = sync.isPending || retry.isPending;

  // Lo que sabemos del registro: los dos estados que ya lo dicen, y para
  // `error`/`rejected` lo que conteste el sondeo. `undefined` mientras está en
  // vuelo — no se promete un botón antes de saber si va a fallar.
  //
  // ⚠️ Si el sondeo se cae (red, la API de VeriFactu apagada), se **asume que
  // hay registro** y se ofrecen las acciones. Es lo que hace el panel, y por
  // una buena razón: ante la duda, esconder el reintento deja al usuario sin la
  // única salida de un rechazo. Como mucho, el 422 lo cuenta en un aviso.
  const isRegistered = AEAT_UNREGISTERED.includes(status ?? "")
    ? false
    : isFailure
      ? detail.isError || detail.data?.isRegistered
      : true;

  const handleSync = async () => {
    try {
      await sync.mutateAsync(invoice.id);
      toast.success("Estado actualizado desde VeriFactu");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo sincronizar con VeriFactu"));
    }
  };

  const handleRetry = async () => {
    try {
      await retry.mutateAsync(invoice.id);
      toast.success("Registro reenviado a la AEAT", {
        description: "El estado se actualiza en cuanto la AEAT conteste.",
      });
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo reenviar el registro"));
    }
  };

  const handleQr = async () => {
    if (!invoice.aeatQrUrl) {
      return;
    }
    try {
      await openExternalUrl(invoice.aeatQrUrl);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo abrir la verificación",
      );
    }
  };

  const hasProof = Boolean(
    invoice.aeatCsv || invoice.aeatHash || invoice.aeatQrUrl,
  );

  /* El chasis es el del rediseño, calcado del `CollectionCard` que le queda a
   * 24 px en el mismo raíl (la constante `CARD` de `PimiaInvoiceScreen.tsx`,
   * que es de allí y no se exporta): `rounded-xl border border-border bg-card`
   * con el relleno `p-4 sm:p-5`. Antes era `rounded-lg` y **sin `bg-card`**: un
   * contorno hueco con otro radio y otro relleno a 24 px de una tarjeta sólida.
   *
   * Cuánto se notaba depende del tema, y conviene tenerlo escrito porque esta
   * vista se porta al anfitrión web. En el tema adaptativo del escritorio
   * `--card` y `--background` salen del **mismo** color (`adaptive-theme.ts`:
   * los dos son `primaryBg`), así que allí el defecto era solo el radio y el
   * relleno. En el anfitrión web no: su tema oscuro declara `--card` más claro
   * que `--background`, y ahí el contorno hueco se leía como un agujero
   * recortado justo al lado de la tarjeta de cobro.
   *
   * La cabecera dejó de ser una banda con raya: el título entra en el mismo
   * bloque acolchado que el contenido, que es como lo cuenta la tarjeta de al
   * lado, y así los dos rótulos del raíl empiezan a la misma altura y al mismo
   * cuerpo.
   *
   * El fallo sí se sale del chasis, y a propósito: ese estado no vive en el
   * raíl sino a lo ancho, bajo la cabecera de la ficha (`isAeatUrgent`), así que
   * el tinte `bg-destructive/10` no tiene ninguna tarjeta al lado con la que
   * desentonar — ahí es un aviso, no una tarjeta hueca.
   *
   * `shrink-0` sigue ganándose el sitio por esa misma colocación: arriba la
   * sección es hija directa de la columna con `overflow-y-auto` de la ficha, y
   * sin él el flex la aplastaría en vez de dejar que la página desplace. */
  return (
    <section
      aria-labelledby={TITLE_ID}
      className={cn(
        "shrink-0 overflow-hidden rounded-xl border",
        isFailure
          ? "border-destructive/30 bg-destructive/10"
          : "border-border bg-card",
      )}
      data-testid="pimia-invoice-verifactu"
    >
      {/* Sin repetir la insignia: el estado ya está en la cabecera de la ficha,
          junto al del documento y el del cobro. Aquí va lo que el estado no
          cabe en decir — el motivo, la prueba y el arreglo. */}
      <div className="space-y-3 p-4 sm:p-5">
        <h2
          className="flex items-center gap-2 font-semibold text-foreground"
          id={TITLE_ID}
        >
          {isFailure ? (
            <TriangleAlert
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-destructive"
            />
          ) : null}
          VeriFactu
        </h2>
        {isFailure ? (
          <>
            <p className="text-sm text-foreground">
              {status === "rejected"
                ? "La AEAT rechazó el registro de esta factura."
                : "El registro de esta factura en la AEAT terminó en error."}
            </p>

            {/* Mientras el sondeo está en vuelo no se afirma nada: la
                diferencia entre «rechazado» y «nunca se registró» la decide
                él, y adelantarla sería inventar. */}
            {isRegistered === false ? (
              <p className="text-sm text-muted-foreground">
                La factura <strong>no llegó a registrarse</strong> en VeriFactu,
                así que no hay registro que reenviar. El número oficial ya está
                asignado y la factura es válida como documento; lo que falta es
                el alta ante la AEAT, que hace el ERP por su cuenta. Si no se
                resuelve, es cosa de la configuración de VeriFactu del tenant.
              </p>
            ) : null}

            {detail.data?.aeatResponse ? (
              <div className="space-y-1.5">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Respuesta de la AEAT
                </span>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-2 font-mono text-xs text-foreground">
                  {detail.data.aeatResponse}
                </pre>
              </div>
            ) : null}

            {isRegistered ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="pimia-verifactu-retry"
                  disabled={isBusy}
                  onClick={() => void handleRetry()}
                  size="sm"
                >
                  {retry.isPending ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <RotateCw className="h-4 w-4" />
                  )}
                  Reintentar el registro
                </Button>
                <Button
                  data-testid="pimia-verifactu-sync"
                  disabled={isBusy}
                  onClick={() => void handleSync()}
                  size="sm"
                  variant="outline"
                >
                  {sync.isPending ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sincronizar
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {!isFailure && isInFlight ? (
          <>
            <p className="text-sm text-muted-foreground">
              El registro está en curso en la AEAT. El estado de aquí es el de
              la última respuesta; sincronizar lo vuelve a preguntar.
            </p>
            <Button
              data-testid="pimia-verifactu-sync"
              disabled={isBusy}
              onClick={() => void handleSync()}
              size="sm"
              variant="outline"
            >
              {sync.isPending ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sincronizar
            </Button>
          </>
        ) : null}

        {status === "pending" ? (
          <p className="text-sm text-muted-foreground">
            El alta en VeriFactu no salió al publicar y el ERP la está
            reintentando por su cuenta. No hay nada que hacer desde aquí: cuando
            lo consiga, el estado cambiará solo.
          </p>
        ) : null}

        {status === "sandbox_only" ? (
          <p className="text-sm text-muted-foreground">
            El plan de este tenant solo permite el entorno de pruebas de
            VeriFactu, así que la factura <strong>no se envió a la AEAT</strong>
            .
          </p>
        ) : null}

        {!isFailure && hasProof ? (
          <div className="space-y-2">
            {invoice.aeatCsv ? (
              <Row label="CSV" value={invoice.aeatCsv} />
            ) : null}
            {invoice.aeatHash ? (
              <Row
                label="Huella"
                value={
                  <span title={invoice.aeatHash}>
                    {invoice.aeatHash.slice(0, 24)}…
                  </span>
                }
              />
            ) : null}
            {invoice.aeatQrUrl ? (
              <Button
                className="-ml-2 h-7 px-2"
                data-testid="pimia-verifactu-qr"
                onClick={() => void handleQr()}
                size="sm"
                variant="ghost"
              >
                <QrCode className="h-4 w-4" />
                Verificar en la sede de la AEAT
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
