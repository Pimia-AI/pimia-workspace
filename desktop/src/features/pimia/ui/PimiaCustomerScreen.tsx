/**
 * La ficha de un cliente: quién es, cuánto pesa y qué documentos tiene.
 *
 * ## Qué sustituye
 *
 * 👤 Hasta el 2026-08-19 esto era **una tarjeta de cinco pares etiqueta/valor y
 * una tabla de presupuestos**, mientras la respuesta que ya se pedía traía —y
 * tiraba— la mitad del `CustomerResource`, y `GET /customers/{id}/stats` no lo
 * llamaba nadie. La ficha nueva tiene la forma de casa: la identidad a la
 * izquierda, y a la derecha las cifras, la serie mensual y los documentos.
 *
 * El reparto en tres ficheros no es aritmético (aunque el tope de 1000 líneas de
 * `check-file-sizes.mjs` lo hubiera forzado igual): son tres cosas que cambian
 * por razones distintas. Aquí, **la pantalla**: qué se puede hacer hoy con este
 * cliente y cómo se coloca. En `PimiaCustomerIdentity`, **la ficha fiscal**, que
 * cambia cuando cambia el contrato del recurso. En `PimiaCustomerVolume`, **la
 * gráfica**, que cambia cuando cambia lo que el servidor sabe agregar.
 *
 * ## Lo que no se puede perder al releerla
 *
 * Son todos casos de **no** afirmar algo, y por eso un rediseño se los lleva por
 * delante sin enterarse:
 *
 * 1. **El pie de la tabla se calcula con `sumStrict` y con nombre**, arriba y no
 *    dentro del JSX. Fue el pie que se quedó fuera del barrido de agosto
 *    justamente por estar escondido en una prop: tres presupuestos, uno con el
 *    total ilegible, la fila pintaba su raya y el pie afirmaba «Total en
 *    pantalla 3.000,00 €» dos centímetros más abajo. Con `null` la lista esconde
 *    el pie entero, que es lo honesto: quien no ve la cifra pregunta por ella;
 *    quien ve una falsa se la cree.
 * 2. **El saldo va por `PimiaAmount`, jamás por `formatCents`.** `due_amount` es
 *    **el campo que ya mordió**: llega como cadena decimal (`"2000.00"`), y un
 *    saldo ilegible escrito «0,00 €» se lee «al corriente de pago».
 * 3. **`/customers/{id}/stats` no puede tumbar la ficha.** El contrato no
 *    declara qué scope exige y su `meta` sirve facturas y gastos; si pidiera
 *    `reports:read` o `invoices:read` —que **no están en el grant del
 *    escritorio**— la ficha entera se caería por unas cifras de contexto. Va en
 *    su propia consulta y su fallo **degrada el bloque**: la identidad, las
 *    facturas y los presupuestos siguen en pie, y el aviso dice qué permiso pidió
 *    el servidor leyendo `error.missingScope`, que además zanja la duda en el
 *    primer arranque contra un tenant vivo.
 * 4. **Un recuento que no se puede separar del total del tenant es una raya**, y
 *    entonces la píldora de la pestaña **no se pinta** — nunca un cero. Ver
 *    `readCount`.
 * 5. **La suma de la serie mensual es una raya cuando no hay serie.**
 *    `sumStrict([])` vale `0` y hace bien —una lista sin sumandos no esconde
 *    ningún hueco—, pero aquí la lista vacía es un eje que no se pudo leer, no
 *    un cliente sin facturar. Y `PimiaCustomerVolume`, con los mismos `stats`,
 *    ya se niega a dibujar: las dos piezas del bloque no pueden contarlo
 *    distinto. Ver `invoicedTotal`.
 *
 * ## Lo que la maqueta tiene y esto no, a sabiendas
 *
 * - **«N vencidas · X €»** bajo el saldo: no hay agregado de vencido, y
 *   `recentInvoices` del `meta` no trae ni `due_date` ni `overdue`. Sacarlo
 *   exigiría traerse todas las facturas del cliente.
 * - **«X € en juego»** bajo los presupuestos activos: no hay agregado de importe
 *   de activos.
 * - **La pestaña «Top productos»**: `meta.topItems` apunta a `InvoiceItem`, que
 *   el generador emitió como `string[]` — el contrato **no publica su forma**.
 * - **Albaranes, contratos, contactos, proyectos y tareas**: ninguna tiene
 *   filtro por cliente comprobado, y `crm:read` no está en el grant. Una pestaña
 *   que sale siempre vacía porque el filtro no existe es peor que no tenerla.
 * - **El banner «Ficha creada al convertir el lead X»**: el dato existe en
 *   `LeadResource`, pero `leads.index` no admite filtrar por
 *   `converted_to_customer_id`.
 * - **«Nueva factura» / «Editar» / «Eliminar»** en la cabecera: no hay
 *   `createCustomer` ni `createInvoice` en este workspace, y el diálogo de
 *   borrado de la maqueta cuenta vínculos con siete consultas por cliente. 🔓
 *   Cuando existan, entran aquí.
 */

import * as React from "react";
import { ArrowLeft, Plus } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { PimiaEstimatePage } from "@/features/pimia/api/estimates";
import type { PimiaInvoicePage } from "@/features/pimia/api/invoices";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaCustomerStatsQuery } from "@/features/pimia/hooks/usePimiaCustomerStats";
import {
  usePimiaCustomerQuery,
  usePimiaEstimatesQuery,
  usePimiaInvoicesQuery,
} from "@/features/pimia/hooks/usePimiaResources";
import { todayIso } from "@/features/pimia/lib/calendar";
import { sumStrict } from "@/features/pimia/lib/money";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaCustomerIdentity } from "@/features/pimia/ui/PimiaCustomerIdentity";
import { PimiaCustomerVolume } from "@/features/pimia/ui/PimiaCustomerVolume";
import { PimiaEstimateCreateDialog } from "@/features/pimia/ui/PimiaEstimateCreateDialog";
import { PimiaEstimateList } from "@/features/pimia/ui/PimiaEstimateList";
import { PimiaInvoiceList } from "@/features/pimia/ui/PimiaInvoiceList";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/lib/cn";

/* Los `id` que atan cada sección con su `<h2>`. Constantes de módulo y no
 * `useId()`: `aria-labelledby` los necesita **estables** entre renders. */
const KPIS_TITLE_ID = "pimia-customer-kpis-title";
const DOCUMENTS_TITLE_ID = "pimia-customer-documents-title";
const STATS_TITLE_ID = "pimia-customer-stats-unavailable-title";

/**
 * La rejilla de la ficha: identidad a la izquierda, el resto a la derecha.
 *
 * ⚠️ **El canal es `gap-4` a propósito, y no el `gap-6` de las dos fichas de
 * documento** (el `LAYOUT_GRID` de `PimiaDocumentParts`). Aquí la columna
 * derecha apila tres bloques —cifras, serie mensual y documentos— y con 24 px
 * de canal la ficha crece una pantalla más; en el papel de un documento hay dos
 * bloques y el aire ayuda a leerlos. Es además la medida de la maqueta.
 *
 * Por eso **no se llama `LAYOUT_GRID`**: dos constantes con el mismo nombre y
 * distinto valor en ficheros hermanos se leen como un error de copia, y alguien
 * las «arregla» igualándolas sin saber que había una decisión debajo. Con
 * nombre propio, la diferencia se puede discutir en vez de desaparecer.
 */
const CUSTOMER_GRID = "grid grid-cols-1 items-start gap-4 lg:grid-cols-3";

/**
 * El chasis de las tarjetas de esta ficha.
 *
 * 🕳️ Es **la misma cadena** que el `CARD` de `PimiaDocumentParts` y el de
 * `PimiaInvoiceScreen`, y que las cuatro clases deletreadas a mano en
 * `PimiaCustomerIdentity`. Sigue local porque el único sitio común que existe
 * hoy es «el vocabulario del papel», y una ficha de cliente no es un documento:
 * importar de allí ataría la tarjeta de un KPI al chasis del raíl de una
 * factura. 🔓 El hogar de verdad es un módulo de chasis que no sea de ningún
 * documento, y está pedido en el informe de este trabajo. Deuda anotada, no
 * decisión.
 */
const CARD = "rounded-xl border border-border bg-card";
const TAB_LIST =
  "h-11 w-max gap-0 rounded-none bg-transparent px-2 py-0 text-muted-foreground sm:px-3";
const TAB_TRIGGER =
  "h-full gap-1.5 rounded-none border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

/**
 * El recuento de una lista filtrada por cliente, y cuándo **no se puede
 * afirmar**.
 *
 * Sale de `pagination.total`, que es el total del paginador y ése sí filtra —
 * pero ese objeto no siempre viene del servidor: si el índice contesta
 * `meta.<recurso>_total_count` sin `current_page`/`last_page`/`total`, la capa
 * de API lo **fabrica** con `total: companyTotalCount`, el total del tenant
 * entero (`derivePagination`, `api/pimiaClient.ts`). Contra un servidor así, la
 * ficha de cualquier cliente diría «Facturas · 368», con la pinta exacta de un
 * recuento bueno.
 *
 * Aquí la consulta va **siempre filtrada** (por `customerId`), así que la
 * coincidencia clavada con el total del tenant nunca es inocente: no hay manera
 * de separar «este cliente tiene todas las facturas» de «me han dado el total
 * sin filtrar». Eso no se puede afirmar ⇒ **`null`**, y la píldora del recuento
 * no se pinta. El precio es una píldora de menos en el tenant de un solo
 * cliente; una píldora de menos se pregunta, una cifra de más se cree.
 *
 * 🔓 El arreglo de raíz es que `derivePagination` diga si la paginación es suya
 * o del servidor. Vive en `api/pimiaClient.ts`, que es costura del anfitrión web
 * y no se toca desde una vista.
 */
function readCount(
  page: PimiaInvoicePage | PimiaEstimatePage | undefined,
): number | null {
  const total = page?.pagination?.total;
  if (typeof total !== "number") {
    return null;
  }
  return total === page?.companyTotalCount ? null : total;
}

/**
 * Las iniciales del cliente, para el cuadro de la cabecera.
 *
 * Derivadas del nombre y **no del `avatar`** que publica el recurso, como en la
 * maqueta: una foto en un ERP de facturación es adorno con coste de red. Van
 * `aria-hidden` dentro del `<h1>` para que el nombre accesible de la página siga
 * siendo el nombre del cliente y no «RV Reformas Vera».
 */
function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "?";
  }
  const first = words[0][0] ?? "";
  const second = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

/** Una cifra de cabecera: rótulo pequeño, cifra grande y una nota debajo. */
function CustomerKpi({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <div className={cn(CARD, "p-4")}>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums text-foreground">
        {children}
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Lo que se pinta en el sitio de las cifras cuando el servidor no las da.
 *
 * Nunca en el sitio de la pantalla: este bloque desaparece y la ficha sigue
 * entera. Y cuando el `403` trae el permiso que faltó, se dice cuál — es el dato
 * que convierte «no se pudo» en algo accionable, y de paso contesta la pregunta
 * que el contrato deja abierta (qué scope exige este endpoint).
 */
function StatsUnavailable({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const apiError = error instanceof PimiaApiError ? error : null;
  const isForbidden =
    apiError?.kind === "forbidden" || apiError?.kind === "unauthorized";

  const reason = apiError?.missingScope
    ? `El servidor pidió el permiso ${apiError.missingScope} para servirlas.`
    : isForbidden
      ? "Esta conexión no tiene permiso para leerlas."
      : apiError?.kind === "notFound"
        ? "Este Pimia no publica estadísticas por cliente."
        : "No se pudieron leer.";

  return (
    /* Con `aria-labelledby` y su `<h2>` como todas las demás: una `<section>`
     * sin nombre accesible no se expone como región, y quien navega por
     * regiones se saltaría justo el bloque cuya única razón de existir es
     * explicar una ausencia — y que además lleva un botón dentro. */
    <section
      aria-labelledby={STATS_TITLE_ID}
      className={cn(CARD, "p-4 sm:p-5")}
    >
      <h2 className="sr-only" id={STATS_TITLE_ID}>
        Por qué faltan las cifras de contexto
      </h2>
      <p className="text-sm text-muted-foreground">
        Sin las cifras de contexto de este cliente. {reason} El resto de la
        ficha no depende de ellas.
      </p>
      {isForbidden || apiError?.kind === "notFound" ? null : (
        <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">
          Reintentar
        </Button>
      )}
    </section>
  );
}

/** La píldora de recuento de una pestaña. Sin recuento, no hay píldora. */
function TabCount({ count }: { count: number | null }) {
  if (count === null) {
    return null;
  }
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}

/**
 * Con la forma de lo que sustituye —panel a la izquierda, cifras y tabla a la
 * derecha—: el `PimiaRowsSkeleton` a secas dibuja filas, y usarlo para la ficha
 * entera hacía saltar la pantalla al llegar los datos.
 */
function CustomerSkeleton() {
  return (
    <div className={CUSTOMER_GRID} data-testid="pimia-loading">
      <div className={cn(CARD, "space-y-3 p-4 lg:col-span-1")}>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function PimiaCustomerScreen({ customerId }: { customerId: string }) {
  const tenant = useActivePimiaTenant();
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const { goPimiaEstimate, goPimiaInvoice, goPimiaPath } = useAppNavigation();

  const customerQuery = usePimiaCustomerQuery(customerId);
  const statsQuery = usePimiaCustomerStatsQuery(customerId);
  const estimatesQuery = usePimiaEstimatesQuery({ customerId, limit: 50 });
  const invoicesQuery = usePimiaInvoicesQuery({ customerId, limit: 50 });

  /* El día de HOY en local, una sola vez y bajado como prop: si cada fila
   * mirase el reloj serían cien relojes, y una sesión abierta a medianoche
   * podría pintar media tabla contra un «hoy» y la otra media contra otro. */
  const today = React.useMemo(() => todayIso(), []);

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  if (customerQuery.isError) {
    return (
      <PimiaErrorState
        error={customerQuery.error}
        onRetry={() => customerQuery.refetch()}
      />
    );
  }

  const customer = customerQuery.data;
  const stats = statsQuery.data;

  const estimates = estimatesQuery.data?.estimates ?? [];
  const invoices = invoicesQuery.data?.invoices ?? [];

  /* Los dos pies de tabla, en ESTRICTO y con nombre aquí arriba. Ver el punto 1
   * de la cabecera: un solo importe ilegible y la suma entera vale `null`, con
   * la que la lista esconde el pie en vez de escribir un total menor que el
   * real con el mismo aspecto que el bueno.
   *
   * ⚠️ **Y sólo se suma con la respuesta ya en la mano.** Las dos listas salen
   * de `data?.X ?? []`, así que **mientras la consulta vuela están vacías** y
   * `sumStrict([])` vale `0` —el cero honesto de una lista sin sumandos, dice
   * su docblock, pero ese cero lo habría puesto el `??` de esta pantalla, no la
   * suma—. Hoy la tabla sólo se monta cuando hay filas y ese `0` no llega a
   * verse; la garantía no puede depender de eso, que es exactamente lo que
   * `lib/money.ts` pide a quien pinta un pie: mirar antes si la consulta sigue
   * en vuelo. */
  const estimatesTotalCents = estimatesQuery.data
    ? sumStrict(estimates.map((estimate) => estimate.totalCents))
    : null;
  const invoicesTotalCents = invoicesQuery.data
    ? sumStrict(
        invoices.map(
          (invoice) => invoice.effectiveTotalCents ?? invoice.totalCents,
        ),
      )
    : null;

  const invoiceCount = readCount(invoicesQuery.data);
  const estimateCount = readCount(estimatesQuery.data);

  /* La nota del saldo. Sólo se puede decir «al corriente de pago» cuando consta
   * que hay facturas: deber cero sin haber facturado nada no es lo mismo, y
   * escribirlo igual sería felicitar a un cliente que todavía no ha comprado.
   * Con el recuento en raya no se dice nada. */
  const dueHint =
    customer?.dueAmountCents === 0 && invoiceCount !== null
      ? invoiceCount > 0
        ? "Al corriente de pago"
        : "Todavía sin facturas emitidas"
      : undefined;

  /* La suma de la serie mensual, **y por qué la lista vacía es una raya y no un
   * cero**.
   *
   * `sumStrict([])` devuelve `0`, y hace bien: una lista sin sumandos no
   * esconde ningún hueco (su docblock en `lib/money.ts` lo dice, y avisa de que
   * quien pinta el pie mire antes de dónde salió la lista). Aquí la lista vacía
   * **no significa «este cliente no tuvo meses»**: `getCustomerStats` deja
   * `months` a `[]` tanto cuando el `meta` no trae `chartData` como cuando
   * `months` no es una lista de cadenas (`readMonths`, `api/customers.ts`). O
   * sea que ese cero sería el cero de un eje ilegible, escrito en 2xl y a plena
   * intensidad bajo el rótulo «Facturación», con el aspecto exacto de un dato
   * bueno: un cliente que puede haber facturado miles se leería igual que uno
   * que no ha facturado nunca.
   *
   * Y hay una segunda razón, más fuerte que la aritmética: `PimiaCustomerVolume`
   * recibe **estos mismos `stats`** y con `months` vacío se niega a dibujar
   * —«unos ejes a cero dirían que este cliente no facturó nada, y eso no es lo
   * que sabemos»—. Las dos piezas del mismo bloque no pueden contar cosas
   * opuestas del mismo dato tres centímetros una de otra; y si una de las dos
   * gana, gana la cifra grande. Si la de abajo no afirma, ésta tampoco. */
  const monthCount = stats?.months.length ?? 0;
  const invoicedTotal =
    stats && monthCount > 0
      ? sumStrict(stats.months.map((month) => month.invoicedCents))
      : null;

  /* La nota del pie de la tarjeta, que tiene que explicar **la raya de arriba**
   * y no contradecirla: sin serie, no hay nada que sumar; con serie y algún mes
   * ilegible, la suma entera se cae (que es lo que hace `sumStrict`) y decirlo
   * es lo que separa «no facturó» de «no se pudo leer». */
  const invoicedHint =
    monthCount === 0
      ? "El servidor no devolvió serie mensual que sumar"
      : invoicedTotal === null
        ? monthCount === 1
          ? "El único mes de la serie llegó ilegible"
          : `Algún mes de los ${monthCount} de la serie llegó ilegible`
        : monthCount === 1
          ? "En el único mes de la serie"
          : `En los ${monthCount} meses de la serie`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6 sm:gap-6">
      {customerQuery.isPending ? <CustomerSkeleton /> : null}

      {customer ? (
        <>
          <PimiaPageHeader
            action={
              <Button
                data-testid="pimia-new-estimate"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Nuevo presupuesto
              </Button>
            }
            back={
              <Button
                className="-ml-2 h-7 px-2 text-muted-foreground"
                onClick={() => void goPimiaPath("/pimia/clientes")}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
                Clientes
              </Button>
            }
            description={
              [customer.email, customer.phone]
                .filter((part): part is string => part !== null)
                .join(" · ") || undefined
            }
            meta={
              customer.currencyCode ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-primary">
                  {customer.currencyCode}
                </span>
              ) : null
            }
            title={
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-xl bg-primary/10 text-base font-bold tracking-wide text-primary"
                >
                  {initialsOf(customer.name)}
                </span>
                <span className="min-w-0 truncate">{customer.name}</span>
              </span>
            }
          />

          <div className={CUSTOMER_GRID}>
            <PimiaCustomerIdentity customer={customer} />

            <div className="min-w-0 space-y-4 lg:col-span-2">
              <section aria-labelledby={KPIS_TITLE_ID}>
                <h2 className="sr-only" id={KPIS_TITLE_ID}>
                  Cifras de este cliente
                </h2>
                {/* Dos cifras verdaderas valen más que tres con dos huecos: si
                    las estadísticas no vienen, la tira se queda en la que sí se
                    sabe en vez de reservar sitio para rayas. */}
                <div
                  className={cn(
                    "grid gap-3",
                    stats ? "sm:grid-cols-3" : "sm:grid-cols-1",
                  )}
                >
                  <CustomerKpi hint={dueHint} label="Saldo del cliente">
                    <PimiaAmount
                      cents={customer.dueAmountCents}
                      className={
                        // Ámbar sólo cuando hay deuda de verdad. **Sin verde**
                        // cuando no la hay: este tema no tiene token de éxito, y
                        // sobre una raya no se enciende ningún color.
                        customer.dueAmountCents !== null &&
                        customer.dueAmountCents > 0
                          ? "text-warning"
                          : undefined
                      }
                      dimZero
                    />
                  </CustomerKpi>

                  {stats ? (
                    <CustomerKpi hint={invoicedHint} label="Facturación">
                      <PimiaAmount cents={invoicedTotal} dimZero={false} />
                    </CustomerKpi>
                  ) : null}

                  {stats ? (
                    <CustomerKpi
                      /* ⚠️ El contrato **no define «activo»**: no dice si cuenta
                         borradores, si excluye caducados, ni nada. El rótulo
                         cuenta lo que el servidor cuenta y no afirma el
                         criterio. */
                      hint="Según el recuento del servidor"
                      label="Presupuestos activos"
                    >
                      {stats.estimatesActiveCount === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        stats.estimatesActiveCount
                      )}
                    </CustomerKpi>
                  ) : null}
                </div>
              </section>

              {statsQuery.isError ? (
                <StatsUnavailable
                  error={statsQuery.error}
                  onRetry={() => statsQuery.refetch()}
                />
              ) : null}
              {stats ? <PimiaCustomerVolume stats={stats} /> : null}

              <section
                aria-labelledby={DOCUMENTS_TITLE_ID}
                className={cn(CARD, "overflow-hidden")}
              >
                <h2 className="sr-only" id={DOCUMENTS_TITLE_ID}>
                  Documentos de este cliente
                </h2>
                <Tabs defaultValue="facturas">
                  <div className="overflow-x-auto border-b border-border">
                    <TabsList className={TAB_LIST}>
                      <TabsTrigger className={TAB_TRIGGER} value="facturas">
                        Facturas
                        <TabCount count={invoiceCount} />
                      </TabsTrigger>
                      <TabsTrigger className={TAB_TRIGGER} value="presupuestos">
                        Presupuestos
                        <TabCount count={estimateCount} />
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent className="mt-0" value="facturas">
                    {invoicesQuery.isPending ? (
                      <PimiaRowsSkeleton rows={3} />
                    ) : null}
                    {invoicesQuery.isError ? (
                      <PimiaErrorState
                        error={invoicesQuery.error}
                        onRetry={() => invoicesQuery.refetch()}
                      />
                    ) : null}
                    {invoicesQuery.isSuccess && invoices.length === 0 ? (
                      <PimiaEmpty
                        description="Las que se le emitan aparecerán aquí."
                        title="Sin facturas todavía"
                      />
                    ) : null}
                    {invoices.length > 0 ? (
                      <div className="overflow-x-auto">
                        <PimiaInvoiceList
                          invoices={invoices}
                          onOpen={(id) => void goPimiaInvoice(id)}
                          showCustomer={false}
                          today={today}
                          totalCents={invoicesTotalCents}
                        />
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent className="mt-0" value="presupuestos">
                    {estimatesQuery.isPending ? (
                      <PimiaRowsSkeleton rows={3} />
                    ) : null}
                    {estimatesQuery.isError ? (
                      <PimiaErrorState
                        error={estimatesQuery.error}
                        onRetry={() => estimatesQuery.refetch()}
                      />
                    ) : null}
                    {estimatesQuery.isSuccess && estimates.length === 0 ? (
                      <PimiaEmpty
                        action={
                          <Button
                            onClick={() => setIsCreateOpen(true)}
                            size="sm"
                            variant="outline"
                          >
                            <Plus className="h-4 w-4" />
                            Nuevo presupuesto
                          </Button>
                        }
                        description="Cuando emitas uno para este cliente aparecerá aquí."
                        title="Sin presupuestos todavía"
                      />
                    ) : null}
                    {estimates.length > 0 ? (
                      <div className="overflow-x-auto">
                        <PimiaEstimateList
                          estimates={estimates}
                          onOpen={(id) => void goPimiaEstimate(id)}
                          showCustomer={false}
                          // El preaviso de caducidad de «Válido hasta», que su
                          // propio docblock pide desde aquí: un presupuesto a
                          // punto de caducar es justo lo que se busca al abrir
                          // la ficha de su cliente.
                          today={today}
                          totalCents={estimatesTotalCents}
                        />
                      </div>
                    ) : null}
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          </div>

          <PimiaEstimateCreateDialog
            customerId={customer.id}
            customerName={customer.name}
            onOpenChange={setIsCreateOpen}
            open={isCreateOpen}
          />
        </>
      ) : null}

      {customerQuery.isSuccess && !customer ? (
        <PimiaEmpty
          description="Puede que lo hayan borrado o que el enlace esté caducado."
          title="No se encontró ese cliente"
        />
      ) : null}
    </div>
  );
}
