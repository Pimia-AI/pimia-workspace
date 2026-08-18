/**
 * La ficha de una factura: **el papel** en el centro y, a la derecha, el raíl
 * con lo que el papel no dice — cobro y registro en la AEAT.
 *
 * Hasta el 2026-08-18 eran dos tarjetas de etiqueta/valor («Factura» y
 * «Cliente») encima de una tabla: para saber a quién se factura, por cuánto y
 * cuándo vence había que recorrer tres cajas. El rediseño llegó junto con el
 * ensanche de `normalizeInvoice`, y no por casualidad: el NIF del cliente, su
 * dirección fiscal y los cobros aplicados **ya venían en la respuesta** de
 * `GET /invoices/{id}` y se tiraban allí.
 *
 * ## Aquí está la pantalla; el papel vive en `PimiaInvoiceDocument.tsx`
 *
 * Se partieron el mismo día, con el tope de 1000 líneas de
 * `scripts/check-file-sizes.mjs` ya roto, pero el corte no es aritmético: allí
 * está **lo que un documento fiscal tiene que decir** y aquí **lo que hoy se
 * puede hacer con él** —cabecera con sus tres insignias, acciones, el raíl del
 * cobro, el bloque de VeriFactu y la colocación de los dos—. ⚠️ Al portar son
 * **DOS** ficheros para la lista `VERBATIM`: una pantalla sin su documento no
 * compila.
 *
 * ## Lo que NO se puede perder al releerlo
 *
 * Consisten todos en **no** pintar algo, y por eso un rediseño se los lleva por
 * delante sin enterarse: **ni un `?? 0` en un importe** (el dinero pasa por
 * `PimiaAmount`, que distingue «vale cero» de «no se pudo leer»); **las fechas
 * van por `pimiaDates`, jamás por `new Date(cadena)`**, que es medianoche UTC y
 * al oeste de Greenwich cae el día anterior; **las insignias son tres ejes
 * independientes** (documento, cobro, AEAT), porque en la API `paid_status` no
 * se deduce de `status` ni ninguno de los dos del estado ante la AEAT; y **lo
 * que dice el raíl no se calcula aquí**: lo pendiente lo manda el servidor.
 *
 * ⚠️ Y ninguna frase de esta pantalla puede **contener el rótulo de una
 * insignia**: las dos se ven a la vez, así que un `getByText('Cobro parcial')`
 * casa con dos elementos y la prueba muere en `strict mode`. Peor que la
 * prueba: quien lee dos veces el mismo rótulo a diez centímetros supone que son
 * dos hechos distintos. La frase explica, la insignia rotula.
 *
 * ## Dos decisiones que no son de gusto
 *
 * - **Color**: no se escribe ni un color literal —el tema se cambia sin tocar
 *   las vistas—, y la banda del papel usa `bg-primary`, el morado de Buzz y no
 *   el teal de la maqueta, por lo mismo.
 * - **Sin ámbar en el vencimiento, y no por falta de token**: `warning` sí
 *   existe (`tailwind.config.js` lo declara y `adaptive-theme.ts` lo puebla; la
 *   lista lo usa en `text-warning` para el «vence pronto»). El que no existe
 *   fuera de las variantes de `shared/ui/badge.tsx` es `--success`. La banda de
 *   pendiente se queda en `destructive` porque aquí no hay nada que **avisar**:
 *   una ficha se abre con el vencimiento delante, en su casilla, y lo único que
 *   cambia el tono es que ya haya pasado — eso no es un aviso, es un hecho
 *   consumado, y es el mismo rojo con el que lo dicen la insignia «Vencida» y
 *   la fila del índice. Ámbar aquí sería un tercer color para el mismo eje.
 */

import type * as React from "react";
import { ArrowLeft, User } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  hasAeatState,
  isAeatUrgent,
  type PimiaInvoice,
  type PimiaInvoicePayment,
} from "@/features/pimia/api/invoices";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaInvoiceQuery } from "@/features/pimia/hooks/usePimiaResources";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { PimiaInvoiceActions } from "@/features/pimia/ui/PimiaInvoiceActions";
import {
  DOCUMENT_PLACEMENT,
  InvoiceDocument,
  joinParts,
} from "@/features/pimia/ui/PimiaInvoiceDocument";
import { PimiaInvoiceVeriFactu } from "@/features/pimia/ui/PimiaInvoiceVeriFactu";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import {
  PimiaInvoicePaidBadge,
  PimiaInvoiceStatusBadge,
  PimiaVeriFactuBadge,
} from "@/features/pimia/ui/PimiaStatusBadge";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/cn";

/* Los `id` que atan cada sección del raíl con su `<h2>`. Constantes de módulo y
 * no `useId()`: `aria-labelledby` los necesita **estables** entre renders. */
const COLLECTION_TITLE_ID = "pimia-invoice-collection-title";
const PAYMENTS_TITLE_ID = "pimia-invoice-payments-title";

/** La rejilla del documento y su raíl, compartida con el esqueleto. */
const LAYOUT_GRID = "grid grid-cols-1 items-start gap-6 lg:grid-cols-3";

/* El chasis de las tarjetas. No se exporta a propósito: son cuatro clases, y
 * `PimiaInvoiceVeriFactu` y el papel las deletrean en su sitio antes que
 * atarse a este fichero por una decisión de borde. */
const CARD = "rounded-xl border border-border bg-card";

/**
 * Una fila del raíl: rótulo a la izquierda, importe alineado a la derecha.
 *
 * ⚠️ **La fila ENVUELVE y el importe no encoge, y eso no es cosmético.** A
 * 1024 px de ventana —una sin maximizar, o Tauri a media pantalla— el raíl mide
 * 224 px y dentro de la tarjeta quedan 190 px útiles; un importe de siete
 * cifras pide 128, el rótulo ya está en su mínimo, y el importe es
 * **indivisible** (el separador de `Intl` es U+00A0). En una sola línea no
 * caben: como la `<section>` es `overflow-hidden`, lo que sobraba se cortaba
 * **sin barra y sin pista** —«1.234.567,8»—, que es exactamente el defecto que
 * echó la tabla del papel a su propio carril, movido al raíl y encima de la
 * cifra que responde a la pregunta de la pantalla. Con `flex-wrap` el importe
 * se baja entero a su renglón antes que perder un dígito; el `ml-auto` lo deja
 * a la derecha también allí abajo, y el `shrink-0` impide que lo aprieten
 * mientras comparten línea. Un `truncate` no valdría: recortar dinero es
 * mentir, aunque se vean los puntos suspensivos.
 */
function RailRow(props: {
  amountCents: number | null;
  amountClassName?: string;
  children: React.ReactNode;
}) {
  const { amountCents, amountClassName, children } = props;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="min-w-0 text-muted-foreground">{children}</dt>
      <dd className="ml-auto shrink-0">
        <PimiaAmount
          cents={amountCents}
          className={cn("font-medium text-foreground", amountClassName)}
        />
      </dd>
    </div>
  );
}

/* Ni una de estas frases contiene el rótulo de la insignia que la acompaña
 * —«Pendiente», «Cobro parcial», «Pagada»— ni el de la banda de abajo
 * («Pendiente de cobro»): ver el ⚠️ de la cabecera. Por eso «Cobrada en parte»
 * y no «Cobro parcial aplicado», que es lo que decía hasta el 2026-08-18 y
 * escribía dos veces el mismo rótulo en la misma tarjeta. */
const PAID_SENTENCES: Record<string, string> = {
  PAID: "Cobrada íntegramente.",
  PARTIALLY_PAID: "Cobrada en parte; queda saldo por cobrar.",
  UNPAID: "Emitida y todavía sin cobrar.",
};

/**
 * Cómo está el cobro, dicho con una frase. Todo sale de campos del servidor,
 * pero **lo efectivo no releva a lo nominal en bloque: manda campo a campo**.
 * El **vencimiento** se lee neto (`effective_overdue`, con caída al `overdue`
 * nominal si el servidor no lo publica), el mismo eje que el índice: una
 * factura anulada entera por una rectificativa está vencida sobre el papel y no
 * debe nada, y con el nominal una de 1.210,00 € con `effective_due_amount: 0`
 * abría «Pasado el vencimiento y sin cobrar del todo.» mientras el índice la
 * enseñaba sin rojo. El **estado de cobro** se queda nominal:
 * `effective_paid_status` vale `PAID` en esa anulada, y eso es «no queda
 * saldo», no «se cobró»; y en una
 * **rectificativa** no se dice nada, porque ahí «cobrada» quiere decir
 * «abonada». Un `paid_status` fuera de la lista devuelve `null` y no se pinta.
 */
function collectionSentence(invoice: PimiaInvoice): string | null {
  if (invoice.isCreditNote) {
    return null;
  }
  if (invoice.status === "DRAFT") {
    return "Sin publicar todavía: no es exigible.";
  }
  if (invoice.effectiveOverdue ?? invoice.isOverdue) {
    return "Pasado el vencimiento y sin cobrar del todo.";
  }
  /* Saldada por rectificativas y no por cobros: el `paid_status` nominal diría
   * «Emitida y todavía sin cobrar» de un saldo que ya no existe. Se exige el
   * nominal legible y mayor que cero: con `null` no se afirma nada. */
  const paperDue = invoice.dueCents;
  if (invoice.effectiveDueCents === 0 && paperDue !== null && paperDue > 0) {
    return "Rectificada por completo: no queda saldo por cobrar.";
  }
  return PAID_SENTENCES[invoice.paidStatus] ?? null;
}

/**
 * Un cobro aplicado, en el raíl.
 *
 * La fecha va primero y sola porque es lo único que siempre se puede decir de un
 * cobro; método y referencia forman la segunda línea y cada uno se omite si
 * falta —el método llega por relación opcional y sin ella solo queda un id, que
 * no es un nombre—, así que un cobro sin método se lee «12 ago 2026 · PAY-0007»
 * y nunca «— · PAY-0007». ⚠️ **Los cobros no se suman aquí**: lo pendiente ya lo
 * dice el servidor, y una segunda cifra calculada en la vista puede discrepar
 * —un importe ilegible, un cobro que no vino— y dejar la tarjeta
 * contradiciéndose. Si hiciera falta ese total, va por `sumStrict`.
 */
function PaymentRow({ payment }: { payment: PimiaInvoicePayment }) {
  const detail = joinParts(
    [payment.paymentMethodName, payment.paymentNumber],
    " · ",
  );
  return (
    <RailRow amountCents={payment.amountCents}>
      <span className="block font-medium text-foreground">
        {formatIsoDateShort(payment.paymentDate)}
      </span>
      {detail ? <span className="block truncate text-xs">{detail}</span> : null}
    </RailRow>
  );
}

/**
 * El raíl del cobro: lo que el papel no dice. El papel lleva el desglose fiscal
 * porque es lo que un documento tiene que llevar; aquí va **el estado del
 * dinero**, que cambia mientras el documento sigue igual — por eso el total se
 * repite: sin él, la banda de pendiente no tiene con qué compararse. Y las
 * rectificativas se cuentan con los campos del servidor (`creditNotesCount`,
 * `creditedTotalCents`, `effectiveTotalCents`) y no restando importes, que
 * acertaba de casualidad: los dos difieren también por otras razones.
 */
function CollectionCard({ invoice }: { invoice: PimiaInvoice }) {
  const sentence = collectionSentence(invoice);
  const isDraft = invoice.status === "DRAFT";
  /* `creditNotesCount === null` es «el servidor no lo dijo» y no «ninguna»: sin
   * el dato no se pinta la fila. El neto solo se nombra cuando **difiere** del
   * nominal, que si no es la misma cifra con dos nombres y hace dudar de las
   * dos. Y la cifra de la banda y su rojo salen del NETO cuando el servidor lo
   * publica: el mismo eje que `collectionSentence` y que el índice. */
  const creditNotes = invoice.creditNotesCount;
  const showsEffectiveTotal =
    invoice.effectiveTotalCents !== null &&
    invoice.effectiveTotalCents !== invoice.totalCents;
  const pendingCents = invoice.effectiveDueCents ?? invoice.dueCents;
  const isNetOverdue = invoice.effectiveOverdue ?? invoice.isOverdue;

  return (
    <section
      aria-labelledby={COLLECTION_TITLE_ID}
      className="overflow-hidden rounded-xl border border-border bg-card"
      data-testid="pimia-invoice-collection"
    >
      <div className="p-4 sm:p-5">
        <h2 className="font-semibold text-foreground" id={COLLECTION_TITLE_ID}>
          Cobro
        </h2>
        {sentence ? (
          <p className="mt-1 text-xs text-muted-foreground">{sentence}</p>
        ) : null}

        <dl className="mt-5 space-y-3 text-sm">
          <RailRow
            amountCents={invoice.totalCents}
            amountClassName="text-xl font-semibold"
          >
            <span className="font-semibold text-foreground">Total</span>
          </RailRow>
          {creditNotes !== null && creditNotes > 0 ? (
            <RailRow amountCents={invoice.creditedTotalCents}>
              Ya rectificado
              <span className="block text-xs">
                {creditNotes === 1
                  ? "1 rectificativa emitida"
                  : `${creditNotes} rectificativas emitidas`}
              </span>
            </RailRow>
          ) : null}
          {showsEffectiveTotal ? (
            <RailRow amountCents={invoice.effectiveTotalCents}>
              Neto de rectificativas
            </RailRow>
          ) : null}
        </dl>
      </div>

      {/* En un borrador nada es exigible: reclamaría un dinero que nadie debe.
          El rótulo va entero —«Pendiente» a secas se lee como un estado, y esto
          es un importe—, y debajo ya no va el pendiente NOMINAL: era la segunda
          cifra de pendiente de la tarjeta, la que la hacía contradecirse. Lo
          que el papel pide se lee entero arriba. */}
      {isDraft ? null : (
        <div
          className={cn(
            // El relleno entero y la raya: al 40 % sobre `bg-card` esto daba
            // 1,03:1 de contraste —invisible— y sin borde no remataba nada.
            // Y envuelve, con el importe indivisible, por lo que cuenta
            // `RailRow`: esta es LA cifra de la pantalla y a 1024 px perdía un
            // dígito por debajo del `overflow-hidden` de la tarjeta. El
            // `sm:px-5` que remató la banda le había quitado otros 8 px.
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-3 sm:px-5",
            isNetOverdue
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-foreground",
          )}
          data-testid="pimia-invoice-due"
        >
          <span className="min-w-0 text-sm font-semibold">
            Pendiente de cobro
          </span>
          <PimiaAmount
            cents={pendingCents}
            className="ml-auto shrink-0 text-lg font-semibold"
          />
        </div>
      )}

      {/* `payments === null` es «la relación no vino» y `[]` es «no tiene
          ninguno»: dos hechos distintos, y solo el segundo se puede afirmar. Con
          `null` el bloque no se pinta — decir «Sin cobros registrados» sobre una
          factura cobrada sería una mentira con muy buena letra. */}
      {invoice.payments === null || isDraft ? null : (
        <section
          aria-labelledby={PAYMENTS_TITLE_ID}
          className="border-t border-border p-4 sm:p-5"
          data-testid="pimia-invoice-payments"
        >
          <h3
            className="text-sm font-semibold text-foreground"
            id={PAYMENTS_TITLE_ID}
          >
            Pagos aplicados
          </h3>
          {invoice.payments.length === 0 ? (
            // El vacío compacto del raíl, no el `PimiaEmpty` de pantalla
            // entera, que haría la columna el doble de alta para decir lo mismo.
            <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
              Sin cobros registrados.
            </p>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              {invoice.payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </dl>
          )}
        </section>
      )}
    </section>
  );
}

/**
 * Con la forma de lo que sustituye —papel a la izquierda, raíl a la derecha— y
 * no la de una tabla: el `PimiaRowsSkeleton` de `PimiaStates` dibuja filas, y
 * usarlo aquí hacía saltar la pantalla entera al llegar los datos.
 */
function InvoiceDocumentSkeleton() {
  return (
    <div className={LAYOUT_GRID} data-testid="pimia-loading">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5 lg:col-start-3 lg:row-start-1">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-6 w-28" />
      </div>
      <div className={cn("overflow-hidden", CARD, DOCUMENT_PLACEMENT)}>
        <div className="h-1.5 bg-muted" />
        <div className="space-y-4 p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="ml-auto h-5 w-40" />
        </div>
      </div>
    </div>
  );
}

export function PimiaInvoiceScreen({ invoiceId }: { invoiceId: string }) {
  const tenant = useActivePimiaTenant();
  const { goPimiaCustomer, goPimiaPath } = useAppNavigation();
  const query = usePimiaInvoiceQuery(invoiceId);

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  if (query.isError) {
    return (
      <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
    );
  }

  const invoice = query.data;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6 sm:gap-6">
      {query.isPending ? <InvoiceDocumentSkeleton /> : null}

      {invoice ? (
        <>
          <PimiaPageHeader
            action={
              <PimiaInvoiceActions
                invoice={invoice}
                navigationItems={
                  invoice.customerId ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void goPimiaCustomer(invoice.customerId as string)
                      }
                    >
                      <User className="h-4 w-4" />
                      Ver el cliente
                    </DropdownMenuItem>
                  ) : null
                }
                showPrimaryAction
              />
            }
            back={
              <Button
                className="-ml-2 h-7 px-2 text-muted-foreground"
                onClick={() => void goPimiaPath("/pimia/facturas")}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
                Facturas
              </Button>
            }
            description={invoice.customerName ?? undefined}
            meta={
              /* Los tres ejes, y solo ellos. Qué documento es —«Factura» o
                 «Factura rectificativa»— lo rotula el `<h2>` del papel, que es
                 donde lo lleva una factura impresa: aquí estuvo un día como
                 chip punteado y sobraba, porque repetía a diez centímetros un
                 rótulo que el documento ya dice y dejaba «Rectificativa»
                 escrito dos veces en la misma pantalla. */
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <PimiaInvoiceStatusBadge status={invoice.status} />
                {invoice.status !== "DRAFT" ? (
                  /* Igual que la fila del índice: «Vencida» por el vencimiento
                     NETO, la etiqueta por el `paid_status` nominal. */
                  <PimiaInvoicePaidBadge
                    isOverdue={invoice.effectiveOverdue ?? invoice.isOverdue}
                    paidStatus={invoice.paidStatus}
                  />
                ) : null}
                {/* El tercer eje, a la altura de los otros dos: el bloque del
                    raíl solo añade la prueba o el arreglo. */}
                {hasAeatState(invoice.aeatStatus) ? (
                  <PimiaVeriFactuBadge status={invoice.aeatStatus as string} />
                ) : null}
              </span>
            }
            title={
              invoice.invoiceNumber ? (
                <span className="font-mono">{invoice.invoiceNumber}</span>
              ) : (
                "Borrador"
              )
            }
          />

          {/* Un registro rechazado o en error es lo más urgente de la página y
              sube aquí; lo que salió bien baja al raíl. */}
          {isAeatUrgent(invoice.aeatStatus) ? (
            <PimiaInvoiceVeriFactu invoice={invoice} />
          ) : null}

          <div className={LAYOUT_GRID}>
            <div className="min-w-0 lg:col-start-3 lg:row-start-1">
              <CollectionCard invoice={invoice} />
            </div>

            <InvoiceDocument invoice={invoice} />

            {hasAeatState(invoice.aeatStatus) &&
            !isAeatUrgent(invoice.aeatStatus) ? (
              <div className="min-w-0 lg:col-start-3 lg:row-start-2">
                <PimiaInvoiceVeriFactu invoice={invoice} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {query.isSuccess && !invoice ? (
        <PimiaEmpty
          description="Puede que el enlace esté caducado."
          title="No se encontró esa factura"
        />
      ) : null}
    </div>
  );
}
