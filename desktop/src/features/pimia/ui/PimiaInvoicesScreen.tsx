/**
 * Facturas — la réplica del patrón que fijó Presupuestos, con los dos ejes que
 * una factura tiene: el estado del documento (pestañas) y el del cobro (un
 * filtro aparte, porque en la API son claves independientes y se combinan).
 *
 * Las cifras de arriba son recuentos, no importes: la API tampoco publica
 * agregados de dinero de facturas, y sumar la página visible para llamarlo
 * total es el bug que el pase de diseño quitó del panel.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS RECUENTOS DE ESTA PANTALLA CUENTAN COSAS DISTINTAS, A PROPÓSITO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * · **La tira de cifras es del TENANT**, y no le afectan ni la búsqueda ni los
 *   filtros: «Vencidas 37» es la salud del negocio, y quiere decir lo mismo se
 *   esté mirando lo que se esté mirando. Por eso cada `hint` lo dice.
 * · **Las pestañas llevan los MISMOS filtros que la lista.** Una pestaña que
 *   dijera «Borradores 14» sobre una lista buscada que enseña 2 estaría
 *   contando otra cosa que la que se ve, y quien la lea se creerá la pestaña.
 *   Son cinco peticiones más de `limit: 1` (una por estado) y una sexta para
 *   «Todas»; es el precio del número honesto.
 *
 * ⚠️ **Un recuento sale del paginador, y el paginador no siempre es del
 * servidor.** Cuando `/invoices` responde `meta.invoice_total_count` sin
 * `current_page`/`last_page`/`total`, `derivePagination` (api/pimiaClient.ts)
 * **fabrica** la paginación con `total: companyTotalCount`, o sea con el total
 * del tenant SIN FILTRAR. Ahí `pagination.total` y `page.totalCount` valen lo
 * mismo y los dos mienten igual. Cuándo se puede afirmar un recuento y qué se
 * pinta cuando no, en el docblock de `readCount`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ LA CABECERA NO TIENE ACCIÓN PRIMARIA (2026-08-18)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El listón de este repo pide un botón «Nueva factura» arriba a la derecha, y
 * aquí **no lo hay porque no hay a dónde llevarlo**: no existe `createInvoice`
 * en `api/invoices.ts` ni pantalla de alta de facturas en todo el módulo. Un
 * botón que abre un diálogo vacío, o que no hace nada, es peor que su ausencia:
 * promete una capacidad que el ERP no tiene y se descubre después de intentar
 * usarla.
 *
 * Lo que sí existe hoy es el otro camino, y es real: un presupuesto aceptado se
 * convierte en factura desde su propia ficha (`PimiaEstimateActions` →
 * `convertEstimateToInvoice`). Por eso el **vacío** sí lleva acción, y lleva
 * ésa. 🔓 El botón de la cabecera entra el día que exista `POST /invoices` en
 * esta capa con su pantalla detrás.
 */

import * as React from "react";
import { FileText } from "lucide-react";

import {
  INVOICE_STATUSES,
  type PimiaInvoicePage,
  type PimiaInvoicePaidStatus,
  type PimiaInvoiceStatus,
} from "@/features/pimia/api/invoices";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
  type PimiaDateRangePreset,
} from "@/features/pimia/lib/dateRanges";
import { todayIso } from "@/features/pimia/lib/calendar";
import { sumStrict } from "@/features/pimia/lib/money";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaInvoicesQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  PimiaInvoiceList,
  type PimiaInvoiceSort,
} from "@/features/pimia/ui/PimiaInvoiceList";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import { PimiaStatCards } from "@/features/pimia/ui/PimiaStatCards";
import { INVOICE_STATUS_META } from "@/features/pimia/ui/PimiaStatusBadge";
import { PimiaStatusTabs } from "@/features/pimia/ui/PimiaStatusTabs";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const ALL_TAB = "todas";
const ANY_PAID = "cualquiera";

/* Los `id` de los `<h2>` que rotulan cada región, atados con `aria-labelledby`.
 *
 * Constantes de módulo y no `useId()`: un `aria-labelledby` necesita un ancla
 * ESTABLE entre renders, y de esta pantalla sólo hay una instancia viva a la
 * vez. Hasta hoy la pantalla tenía un único encabezado —el `h1` de
 * `PimiaPageHeader`— y todo lo demás colgaba de él sin nombre: quien navega por
 * regiones oía «región» a secas tres veces seguidas. */
const SUMMARY_TITLE_ID = "pimia-invoices-summary-title";
const LIST_TITLE_ID = "pimia-invoices-list-title";

const PAID_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Cualquier cobro", value: ANY_PAID },
  { label: "Pendientes", value: "UNPAID" },
  { label: "Cobro parcial", value: "PARTIALLY_PAID" },
  { label: "Pagadas", value: "PAID" },
];

const SORT_OPTIONS: Array<{
  label: string;
  sort: PimiaInvoiceSort;
  value: string;
}> = [
  {
    label: "Más recientes",
    sort: { direction: "desc", field: "invoice_date" },
    value: "recientes",
  },
  {
    label: "Más antiguas",
    sort: { direction: "asc", field: "invoice_date" },
    value: "antiguas",
  },
  {
    label: "Vencen antes",
    sort: { direction: "asc", field: "due_date" },
    value: "vencen",
  },
  {
    label: "Importe: mayor primero",
    sort: { direction: "desc", field: "total" },
    value: "importe-desc",
  },
  {
    label: "Importe: menor primero",
    sort: { direction: "asc", field: "total" },
    value: "importe-asc",
  },
];

const PAGE_SIZES = [25, 50, 100];

/** Una cifra que no se pudo leer —o que no se puede afirmar— es una raya.
 * Nunca un 0. */
function count(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "—";
}

function sortValue(sort: PimiaInvoiceSort): string {
  return (
    SORT_OPTIONS.find(
      (option) =>
        option.sort.field === sort.field &&
        option.sort.direction === sort.direction,
    )?.value ?? "personalizado"
  );
}

export function PimiaInvoicesScreen() {
  const tenant = useActivePimiaTenant();
  const [status, setStatus] = React.useState<PimiaInvoiceStatus | undefined>();
  const [paidStatus, setPaidStatus] = React.useState<
    PimiaInvoicePaidStatus | undefined
  >();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [range, setRange] = React.useState<PimiaDateRangePreset>("any");
  const [sort, setSort] = React.useState<PimiaInvoiceSort>({
    direction: "desc",
    field: "invoice_date",
  });
  const [pageSize, setPageSize] = React.useState(PAGE_SIZES[0]);
  const [page, setPage] = React.useState(1);
  const { goPimiaCustomer, goPimiaInvoice, goPimiaPath } = useAppNavigation();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const dateRange = React.useMemo(
    () => resolveDateRange(range, new Date()),
    [range],
  );

  const query = usePimiaInvoicesQuery({
    fromDate: dateRange.fromDate,
    limit: pageSize,
    orderBy: sort.direction,
    orderByField: sort.field,
    page,
    paidStatus,
    search,
    status,
    toDate: dateRange.toDate,
  });

  // Recuentos del TENANT (sin filtros), con los estados VIRTUALES del
  // servidor: `DUE` (pendientes de cobro) y `OVERDUE` (vencidas) son valores de
  // `status` que el modelo resuelve él mismo — aquí no se calcula ningún
  // vencimiento.
  const dueQuery = usePimiaInvoicesQuery({ limit: 1, status: "DUE" });
  const overdueQuery = usePimiaInvoicesQuery({ limit: 1, status: "OVERDUE" });
  const paidQuery = usePimiaInvoicesQuery({ limit: 1, paidStatus: "PAID" });

  /* Los recuentos de las PESTAÑAS: los mismos filtros que la lista, menos el
   * estado, que es justo lo que cada pestaña cambia. Van uno a uno y no en un
   * bucle porque son hooks y un hook no puede vivir dentro de un `map`. */
  const tabCountInput = {
    fromDate: dateRange.fromDate,
    limit: 1,
    paidStatus,
    search,
    toDate: dateRange.toDate,
  };
  const allTabQuery = usePimiaInvoicesQuery(tabCountInput);
  const draftTabQuery = usePimiaInvoicesQuery({
    ...tabCountInput,
    status: "DRAFT",
  });
  const publishedTabQuery = usePimiaInvoicesQuery({
    ...tabCountInput,
    status: "PUBLISHED",
  });
  const sentTabQuery = usePimiaInvoicesQuery({
    ...tabCountInput,
    status: "SENT",
  });
  const viewedTabQuery = usePimiaInvoicesQuery({
    ...tabCountInput,
    status: "VIEWED",
  });
  const completedTabQuery = usePimiaInvoicesQuery({
    ...tabCountInput,
    status: "COMPLETED",
  });

  /* «Hoy» se calcula UNA vez y baja como prop a la tabla, en vez de una vez por
   * fila: con cien filas serían cien relojes, que además podrían cruzar la
   * medianoche a mitad de tabla. Y es el día LOCAL de quien mira (`todayIso`),
   * no el de UTC: con `new Date().toISOString()` una factura que vence hoy
   * saldría vencida a la una de la madrugada española. Va antes del
   * `if (!tenant)` porque un hook no puede quedar detrás de un `return`.
   *
   * Pero UNA vez no es «al montar y ya»: un ERP se queda abierto de un día para
   * otro, que es lo normal en un puesto de administración, y con el día
   * congelado a las 09:00 del día siguiente la tabla seguiría midiendo contra
   * el «hoy» de ayer: la factura que vence HOY se rotularía «Vence mañana» y la
   * que venció ayer seguiría en ámbar diciendo «Vence hoy» en vez de pasar a
   * rojo. Justo la clase de aviso falso por el que una lista con alarmas falsas
   * se deja de mirar entera. Así que se vuelve a mirar el reloj cada minuto y
   * solo se re-renderiza cuando el día CAMBIA de verdad —el `setToday` devuelve
   * el mismo string el resto de la jornada, y React no repinta—. */
  const [today, setToday] = React.useState(() => todayIso());
  React.useEffect(() => {
    const timer = setInterval(() => {
      setToday((current) => {
        const now = todayIso();
        return now === current ? current : now;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const invoices = query.data?.invoices ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCount = query.data?.totalCount ?? null;
  /* Suma el importe NETO de rectificativas, que es el dinero que hay de verdad
   * en la página: una factura anulada aporta cero, no su nominal. Sin los
   * `effective_*` (servidor sin la vista ligera) se cae al nominal, y eso NO es
   * un hueco: es el mismo dato dicho por un servidor más viejo. Por eso el
   * `??` sigue aquí dentro y lo que se le entrega a `sumStrict` es ya «el
   * importe de esta factura», sea el neto o el nominal.
   *
   * Y a partir de ahí, en ESTRICTO. Hasta el 2026-08-18 esto era un `reduce`
   * que remataba en `?? 0`: una factura cuyo `total` no se pudo leer —el caso
   * real de este ERP no es exótico, `due_amount` ya llegó una vez como cadena
   * decimal y `readCents` devuelve `null` en cuanto la forma cambia— entraba en
   * la suma valiendo cero. El resultado no era «casi bueno»: era una cifra MÁS
   * PEQUEÑA que la real con exactamente el mismo aspecto que la buena, en el
   * pie de la misma tabla en la que esa fila ya está enseñando su raya. La
   * tabla se contradecía a sí misma y ganaba la mentira, porque el pie es lo
   * que la gente copia. En facturas, además, esa cifra se copia a un correo o a
   * una hoja de cierre.
   *
   * `null` significa «no puedo sumar esto», y `PimiaInvoiceList` esconde el pie
   * entero cuando lo recibe —el precedente es el «Total en pantalla» de leads—.
   * Esconder gana a pintar una raya en el pie: la raya de una fila señala QUÉ
   * factura falta y se lee en su columna; una raya en el sitio del total es un
   * renglón que sigue afirmando que aquí va un total, y el ojo que baja
   * buscando la cifra se lleva un cero de consolación. Quien no ve el pie
   * pregunta por él; quien ve un total falso se lo cree. */
  const totalCents = sumStrict(
    invoices.map(
      (invoice) => invoice.effectiveTotalCents ?? invoice.totalCents,
    ),
  );

  const hasFilters = Boolean(search || status || paidStatus || range !== "any");

  /* El recuento de una consulta de `limit: 1`, y cuándo NO se puede afirmar.
   *
   * Sale de `pagination.total`, que es el total del PAGINADOR y ése sí filtra.
   * Pero ese objeto no siempre viene del servidor: si `/invoices` contesta
   * `meta.invoice_total_count` sin `current_page`/`last_page`/`total` —la forma
   * que tienen hoy los índices de clientes y presupuestos, y la razón de existir
   * de `derivePagination` en api/pimiaClient.ts—, la capa de API lo FABRICA con
   * `total: companyTotalCount`, el total del tenant entero. Contra un servidor
   * así, las seis pestañas dirían todas «· 368» y las tarjetas «Pendientes 368 /
   * Vencidas 368 / Pagadas 368»: seis cifras distintas afirmando lo mismo, con
   * la pinta exacta de un recuento bueno.
   *
   * ⚠️ Hasta el 2026-08-18 aquí ponía que leer `pagination.total` en vez de
   * `data.totalCount` evitaba justo eso. No lo evita: en ese caso los dos valen
   * `companyTotalCount`. El aviso era peor que no tenerlo, porque el siguiente
   * que lo leyera daba la protección por puesta.
   *
   * Lo que sí se puede comprobar desde esta pantalla es el síntoma: si la
   * consulta iba **filtrada** y aun así el recuento coincide clavado con el
   * total del tenant, no hay manera de separar «el filtro deja pasar todo» de
   * «me han dado el total sin filtrar». Eso no se puede afirmar ⇒ **raya**, y
   * la línea de debajo de las tarjetas dice por qué. Sin filtros —la pestaña
   * «Todas» a secas— la coincidencia no es sospechosa: ahí el recuento y el
   * total del tenant SON la misma cifra, y se afirma. El precio es una raya de
   * más en el tenant que tenga todas sus facturas en un mismo estado; una raya
   * de más se pregunta, una cifra de más se cree.
   *
   * 🔓 El arreglo de raíz es que `derivePagination` diga si la paginación es
   * suya o del servidor —con eso, «no la manda» se distingue de «coincide»—.
   * Vive en `api/pimiaClient.ts`, que es costura del anfitrión web y no se toca
   * desde una vista. */
  const readCount = (
    page: PimiaInvoicePage | undefined,
    filtered: boolean,
  ): number | null => {
    const total = page?.pagination?.total;
    if (typeof total !== "number") {
      return null;
    }
    return filtered && total === page?.companyTotalCount ? null : total;
  };

  /* ¿Va filtrada la consulta de un recuento? Las de estado —las cinco pestañas
   * y las tres tarjetas del tenant— llevan el suyo siempre; «Todas» solo va
   * filtrada si hay búsqueda, cobro o rango puestos. */
  const countFiltered = Boolean(search || paidStatus || range !== "any");
  const tabFiltered = (value: string) => value !== ALL_TAB || countFiltered;

  const dueCount = readCount(dueQuery.data, true);
  const overdueCount = readCount(overdueQuery.data, true);
  const paidCount = readCount(paidQuery.data, true);

  const tabQueryByStatus = {
    COMPLETED: completedTabQuery,
    DRAFT: draftTabQuery,
    PUBLISHED: publishedTabQuery,
    SENT: sentTabQuery,
    VIEWED: viewedTabQuery,
  };
  const tabQueries: Array<{
    label: string;
    query: typeof allTabQuery;
    value: string;
  }> = [
    { label: "Todas", query: allTabQuery, value: ALL_TAB },
    ...INVOICE_STATUSES.map((candidate) => ({
      label: INVOICE_STATUS_META[candidate].plural,
      query: tabQueryByStatus[candidate],
      value: candidate as string,
    })),
  ];

  /* Mientras las cuentas vuelan se enseña SÓLO el rótulo: seis «—»
   * parpadeando en las pestañas parecen seis fallos, no una carga.
   *
   * Y `isPlaceholderData` cuenta como volar. `usePimiaInvoicesQuery` lleva
   * `placeholderData: (previous) => previous`, así que al cambiar de filtro
   * react-query sigue sirviendo la respuesta del filtro ANTERIOR con
   * `status: "success"` e `isPending` en false: sin esta segunda condición,
   * elegir «Cobro: Pagadas» dejaba las pestañas diciendo «Borradores · 14» del
   * estado sin filtrar —sin ninguna marca de caducidad— mientras la lista de
   * abajo ya se atenuaba con su `isFetching`. Una cifra vieja con pinta de
   * fresca es exactamente lo que estas pestañas vienen a evitar. */
  const countsInFlight = tabQueries.some(
    ({ query: tab }) => tab.isPending || tab.isPlaceholderData,
  );
  const countsFailed =
    tabQueries.some(({ query: tab }) => tab.isError) ||
    dueQuery.isError ||
    overdueQuery.isError ||
    paidQuery.isError;

  /* La otra fuente de rayas: el recuento llegó entero y aun así no se puede
   * afirmar (ver `readCount`). No es un fallo de red, así que la línea de abajo
   * lo cuenta con sus palabras en vez de meterlo en el mismo saco: «no se ha
   * podido leer» y «no se puede distinguir del total del tenant» se arreglan en
   * sitios distintos. */
  const unaffirmable = (
    tab: { data?: PimiaInvoicePage; isSuccess: boolean },
    filtered: boolean,
  ) => tab.isSuccess && readCount(tab.data, filtered) === null;
  const countsUnaffirmable =
    (!countsInFlight &&
      tabQueries.some(({ query: tab, value }) =>
        unaffirmable(tab, tabFiltered(value)),
      )) ||
    unaffirmable(dueQuery, true) ||
    unaffirmable(overdueQuery, true) ||
    unaffirmable(paidQuery, true);

  const tabs = tabQueries.map(({ label, query: tab, value }) => ({
    label: countsInFlight
      ? label
      : `${label} · ${count(readCount(tab.data, tabFiltered(value)))}`,
    value,
  }));

  /* La acción del vacío. NO es «Nueva factura» —no existe, ver el docblock—:
   * es el único camino que hoy lleva de verdad a una factura nueva, y además es
   * el que ya nombra el texto del vacío. Un vacío que explica de dónde salen
   * las facturas y luego no enseña la puerta se queda a medias. */
  const goToEstimatesButton = (
    <Button
      data-testid="pimia-invoice-empty-estimates"
      onClick={() => void goPimiaPath("/pimia/presupuestos")}
      size="sm"
      variant="outline"
    >
      <FileText className="h-4 w-4" />
      Ver los presupuestos
    </Button>
  );

  return (
    // El panel no scrollea como un documento: la cabecera, los totales y los
    // filtros se quedan, y el scroll vive dentro de la tarjeta de la tabla para
    // que el pie de paginación descanse siempre en su base.
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-6">
      <PimiaPageHeader
        description="Facturas emitidas, su estado y lo que queda por cobrar."
        title="Facturas"
      />

      {/* Las cuatro cifras del TENANT: no las tocan ni la búsqueda ni los
          filtros, y por eso los `hint` lo dicen. Lo que no se pudo leer sale
          como raya. */}
      <section aria-labelledby={SUMMARY_TITLE_ID} className="shrink-0">
        <h2 className="sr-only" id={SUMMARY_TITLE_ID}>
          Resumen de la facturación del tenant
        </h2>
        <PimiaStatCards
          stats={[
            {
              hint: "en el tenant",
              label: "Emitidas",
              value: count(query.data?.companyTotalCount),
            },
            {
              hint: "en el tenant, sin cobrar",
              label: "Pendientes",
              value: count(dueCount),
            },
            {
              hint: "en el tenant, fuera de plazo",
              label: "Vencidas",
              value: count(overdueCount),
            },
            {
              hint: "en el tenant, cobradas del todo",
              label: "Pagadas",
              value: count(paidCount),
            },
          ]}
        />
      </section>

      {/* Las rayas de arriba y de las pestañas dicen «esto no se sabe», pero no
          por qué. Un recuento caído se lee exactamente igual que un tenant que
          no tiene ninguna, y son cosas muy distintas cuando la etiqueta dice
          «Vencidas». Esta línea es lo único que las separa; la lista de abajo va
          por su cuenta y no se ve afectada.
          El `data-testid` conserva el nombre viejo —«counts-error»— aunque ahora
          cubra también el recuento que llegó bien y no se puede afirmar: es el
          ancla de «hay rayas ahí arriba», y renombrarlo solo rompería a quien lo
          use. */}
      {countsFailed || countsUnaffirmable ? (
        <p
          className="-mt-2 shrink-0 text-xs text-muted-foreground"
          data-testid="pimia-invoice-counts-error"
          role="status"
        >
          {countsFailed ? "Algunos recuentos no se han podido leer. " : null}
          {countsUnaffirmable
            ? "Algunos recuentos llegan filtrados iguales al total del tenant y no hay forma de separarlos de él, así que no se afirman. "
            : null}
          Los que salen con una raya no están contados; la lista de facturas no
          se ve afectada.
        </p>
      ) : null}

      {/* La región de la lista: pestañas, filtros y la tabla, que es lo que
          todos ellos gobiernan. Es un `flex` propio con el mismo `gap-5` del
          contenedor, así que la maqueta no cambia ni un píxel — pero ahora
          tiene nombre, y `min-h-0 flex-1` hereda el crecimiento que necesita la
          tarjeta de la tabla para que el paginador descanse en su base.
          ⚠️ Nada de `display: contents` aquí: quita la caja, sí, pero también
          saca la región del árbol de accesibilidad en varios motores, que es
          justo lo que este `aria-labelledby` viene a arreglar. */}
      <section
        aria-labelledby={LIST_TITLE_ID}
        className="flex min-h-0 flex-1 flex-col gap-5"
        data-testid="pimia-invoices-list-section"
      >
        <h2 className="sr-only" id={LIST_TITLE_ID}>
          Listado de facturas
        </h2>

        <PimiaStatusTabs
          onValueChange={(value) => {
            setStatus(
              value === ALL_TAB ? undefined : (value as PimiaInvoiceStatus),
            );
            setPage(1);
          }}
          options={tabs}
          testIdPrefix="pimia-invoice-filter"
          value={status ?? ALL_TAB}
        />

        <PimiaFilterBar
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por número o cliente"
          searchTestId="pimia-invoice-search"
          searchValue={searchInput}
        >
          <>
            <Select
              onValueChange={(value) => {
                setPaidStatus(
                  value === ANY_PAID
                    ? undefined
                    : (value as PimiaInvoicePaidStatus),
                );
                setPage(1);
              }}
              value={paidStatus ?? ANY_PAID}
            >
              <SelectTrigger
                className="h-9 w-44"
                data-testid="pimia-invoice-paid"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAID_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                setRange(value as PimiaDateRangePreset);
                setPage(1);
              }}
              value={range}
            >
              <SelectTrigger
                className="h-9 w-44"
                data-testid="pimia-invoice-range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {DATE_RANGE_LABELS[preset]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                const option = SORT_OPTIONS.find(
                  (candidate) => candidate.value === value,
                );
                if (option) {
                  setSort(option.sort);
                  setPage(1);
                }
              }}
              value={sortValue(sort)}
            >
              <SelectTrigger
                className="h-9 w-52"
                data-testid="pimia-invoice-sort"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        </PimiaFilterBar>

        {query.isPending ? <PimiaRowsSkeleton /> : null}
        {query.isError ? (
          <PimiaErrorState
            error={query.error}
            onRetry={() => query.refetch()}
          />
        ) : null}

        {query.isSuccess && invoices.length === 0 ? (
          // Con filtros puestos el vacío no ofrece nada: lo que hay que hacer es
          // quitarlos, y para eso están arriba. La puerta solo se enseña cuando
          // el tenant de verdad no tiene ninguna factura todavía.
          <PimiaEmpty
            action={hasFilters ? null : goToEstimatesButton}
            description={
              hasFilters
                ? "Prueba a quitar el filtro o a buscar otra cosa."
                : "Las facturas que emitas —a mano o convirtiendo un presupuesto aceptado— aparecerán aquí con su estado y su cobro."
            }
            title={
              hasFilters
                ? "Ninguna factura coincide"
                : "Todavía no hay facturas"
            }
          />
        ) : null}

        {invoices.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto transition-opacity",
                query.isFetching && "opacity-60",
              )}
            >
              <PimiaInvoiceList
                invoices={invoices}
                onOpen={(id) => void goPimiaInvoice(id)}
                onOpenCustomer={(customerId) =>
                  void goPimiaCustomer(customerId)
                }
                onSortChange={(next) => {
                  setSort(next);
                  setPage(1);
                }}
                sort={sort}
                today={today}
                totalCents={totalCents}
              />
            </div>
            <PimiaPagination
              isBusy={query.isFetching}
              lastPage={lastPage}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              page={page}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              shown={invoices.length}
              total={totalCount}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
