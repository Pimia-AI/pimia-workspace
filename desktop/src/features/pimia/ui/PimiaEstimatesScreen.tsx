/**
 * Presupuestos — la lista que fija el patrón del ERP, tomado del
 * `invoice-list-2` de la referencia: cifras arriba, pestañas de estado, fila de
 * filtros, tabla densa con cabeceras que ordenan y pie con el recuento.
 *
 * Todo lo que filtra y ordena es **server-side** (`applyFilters` del modelo
 * `Estimate` acepta `search`, `status`, `customer_id`, `from_date`/`to_date` y
 * `orderByField`/`orderBy`), así que el orden vale para las 129 filas del
 * tenant y no para las 25 que se ven.
 *
 * Las cifras de arriba son **recuentos**, no importes: la API no publica
 * ningún agregado de dinero de presupuestos, y sumar una página y llamarlo
 * total es exactamente el bug que este pase quitó del panel.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS RECUENTOS DE ESTA PANTALLA CUENTAN COSAS DISTINTAS, A PROPÓSITO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * · **La tira de cifras es del TENANT**, y no le afectan ni la búsqueda ni los
 *   filtros: «Caducados 12» es la salud del negocio y quiere decir lo mismo se
 *   esté mirando lo que se esté mirando. Por eso cada `hint` lo dice.
 * · **Las pestañas llevan los MISMOS filtros que la lista**, menos el estado,
 *   que es justo lo que cada una cambia. Una pestaña que dijera «Aceptados 31»
 *   sobre una lista buscada que enseña 2 estaría contando otra cosa que la que
 *   se ve, y quien la lea se creerá la pestaña. Son siete peticiones de
 *   `limit: 1` (una por estado y otra para «Todos»); es el precio del número
 *   honesto.
 *
 * ⚠️ **Un recuento sale del paginador, y el paginador de `/estimates` NO es del
 * servidor.** Este índice responde `meta.estimate_total_count` sin
 * `current_page`/`last_page`/`total`, así que `derivePagination`
 * (api/pimiaClient.ts) **fabrica** la paginación con `total: companyTotalCount`,
 * o sea con el total del tenant SIN FILTRAR. Hasta el 2026-08-19 esta pantalla
 * leía ese total a pelo y pintaba «Emitidos 129 / Sin respuesta 129 / Aceptados
 * 129 / Caducados 129»: cuatro cifras distintas afirmando lo mismo, con la
 * pinta exacta de un recuento bueno. Ahora pasan todas por `readCount`, que en
 * cuanto no puede separar el recuento del total del tenant devuelve `null` ⇒
 * **raya**, y la línea de debajo de las tarjetas dice por qué.
 *
 * 🕳️ Contra el servidor de hoy eso significa que **casi todas esas cifras salen
 * con raya**, y que las siete peticiones de las pestañas se pagan para no poder
 * afirmar nada. Es feo y es lo honesto: la alternativa es escribir siete veces
 * el total del tenant con siete rótulos distintos. Se arregla en la plataforma
 * —que `/estimates` mande su paginación como la manda `/invoices`—, y el día
 * que llegue esta pantalla enseña los números sin tocar una línea. 🔓 El otro
 * arreglo de raíz es que `derivePagination` diga si la paginación es suya o del
 * servidor; vive en `api/pimiaClient.ts`, que es costura del anfitrión web y no
 * se toca desde una vista.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ AQUÍ SÍ HAY ACCIÓN PRIMARIA, Y QUÉ PROMETE EXACTAMENTE (2026-08-19)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Facturas no tiene botón «Nueva factura» porque no existe `createInvoice` en
 * ninguna capa: allí el botón sería una promesa sin destino. Aquí **sí existe**
 * `createEstimate`, con su diálogo (`PimiaEstimateCreateDialog`) ya en uso desde
 * la ficha del cliente. Lo único que faltaba era el paso de antes —un
 * presupuesto se emite siempre A ALGUIEN, y el diálogo exige `customerId`—, y
 * eso es lo que añade `PimiaEstimateCustomerPicker`: buscar el cliente contra la
 * API y pasar el testigo. Hasta hoy la pantalla vacía resolvía ese paso
 * echando al usuario a otro módulo («Elegir un cliente» llevaba a /clientes y
 * había que encontrar el botón allí); ahora el alta empieza y acaba aquí.
 *
 * ⚠️ **Lo que el alta NO hace, y por eso el diálogo lo dice en voz alta**:
 * manda las líneas tal cual, con `tax: 0` y `discount: 0`
 * (`buildEstimatePayload`), y nace en borrador. No hay impuestos, no hay
 * descuento y **este escritorio no tiene pantalla de edición** —no existe
 * `updateEstimate` en `api/estimates.ts`—, así que lo que falte se ajusta en el
 * panel de Pimia. Decirlo en la descripción del diálogo cuesta una frase; que
 * alguien lo descubra después de emitir un presupuesto sin IVA cuesta el
 * presupuesto.
 */

import * as React from "react";
import { Plus, Search } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  ESTIMATE_STATUSES,
  type PimiaEstimatePage,
  type PimiaEstimateStatus,
} from "@/features/pimia/api/estimates";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  resolveDateRange,
  type PimiaDateRangePreset,
} from "@/features/pimia/lib/dateRanges";
import { todayIso } from "@/features/pimia/lib/calendar";
import { sumStrict } from "@/features/pimia/lib/money";
import { PimiaApiError } from "@/features/pimia/api/pimiaClient";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import {
  usePimiaCustomersQuery,
  usePimiaEstimatesQuery,
} from "@/features/pimia/hooks/usePimiaResources";
import { PimiaEstimateCreateDialog } from "@/features/pimia/ui/PimiaEstimateCreateDialog";
import {
  PimiaEstimateList,
  type PimiaEstimateSort,
} from "@/features/pimia/ui/PimiaEstimateList";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import { PimiaStatCards } from "@/features/pimia/ui/PimiaStatCards";
import { ESTIMATE_STATUS_META } from "@/features/pimia/ui/PimiaStatusBadge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";

const ALL_TAB = "todos";

/* Los `id` de los `<h2>` que rotulan cada región, atados con `aria-labelledby`.
 *
 * Constantes de módulo y no `useId()`: un `aria-labelledby` necesita un ancla
 * ESTABLE entre renders, y de esta pantalla sólo hay una instancia viva a la
 * vez. Hasta hoy la pantalla tenía un único encabezado —el `h1` de
 * `PimiaPageHeader`— y todo lo demás colgaba de él sin nombre: quien navega por
 * regiones oía «región» a secas dos veces seguidas. */
const SUMMARY_TITLE_ID = "pimia-estimates-summary-title";
const LIST_TITLE_ID = "pimia-estimates-list-title";

/** Los órdenes que el índice de Pimia sabe hacer, con nombre de persona. */
const SORT_OPTIONS: Array<{
  label: string;
  sort: PimiaEstimateSort;
  value: string;
}> = [
  {
    label: "Más recientes",
    sort: { direction: "desc", field: "estimate_date" },
    value: "recientes",
  },
  {
    label: "Más antiguos",
    sort: { direction: "asc", field: "estimate_date" },
    value: "antiguos",
  },
  {
    label: "Caducan antes",
    sort: { direction: "asc", field: "expiry_date" },
    value: "caducan",
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

/** Cuántos clientes enseña el buscador del alta antes de pedir que se afine. */
const PICKER_LIMIT = 8;

/** Una cifra que no se pudo leer —o que no se puede afirmar— es una raya.
 * Nunca un 0. */
function count(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "—";
}

function sortValue(sort: PimiaEstimateSort): string {
  return (
    SORT_OPTIONS.find(
      (option) =>
        option.sort.field === sort.field &&
        option.sort.direction === sort.direction,
    )?.value ?? "personalizado"
  );
}

/**
 * El paso que le faltaba al alta: a quién se le emite.
 *
 * Busca contra la API (`/customers?search=`), no sobre una página en memoria,
 * así que encuentra a cualquiera de los del tenant y no sólo a los 25 que
 * cabrían en una lista local. Enseña los ocho primeros a propósito: esto es un
 * selector, no un índice de clientes —para eso está su módulo—, y ocho es lo
 * que se lee de una vez sin scroll dentro de un diálogo.
 *
 * No ofrece dar de alta un cliente nuevo porque **no existe `createCustomer`**
 * en `api/customers.ts`. Un «+ Nuevo cliente» aquí sería la promesa vacía que
 * este módulo lleva un pase entero quitando.
 */
function PimiaEstimateCustomerPicker({
  onOpenChange,
  onPick,
}: {
  onOpenChange: (open: boolean) => void;
  onPick: (customer: { id: string; name: string }) => void;
}) {
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");

  // La búsqueda va contra la API del tenant: una petición por tecla es una
  // petición por tecla.
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = usePimiaCustomersQuery({ limit: PICKER_LIMIT, search });
  const customers = query.data?.customers ?? [];
  /* «Puede haber más» se deduce de la PÁGINA, no del total del paginador: el de
     `/customers` viene fabricado con el total del tenant (ver el docblock de la
     pantalla), así que con tres coincidencias diría igualmente «hay 40» y el
     aviso mandaría a afinar una búsqueda que ya está afinada. Una página llena
     es lo único que de verdad significa «esto puede no estar completo». */
  const hasMore = customers.length >= PICKER_LIMIT;

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent
        className="max-w-lg"
        data-testid="pimia-estimate-customer-picker"
      >
        <DialogHeader>
          <DialogTitle>Nuevo presupuesto</DialogTitle>
          <DialogDescription>
            Un presupuesto se emite siempre a un cliente: elige a quién. El alta
            manda las líneas tal cual —sin impuestos ni descuento—, y lo que
            falte se ajusta después en Pimia.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar un cliente"
            autoFocus
            className="pl-9"
            data-testid="pimia-estimate-customer-search"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre, contacto o NIF"
            value={searchInput}
          />
        </div>

        <div className="min-h-56 space-y-1">
          {query.isPending ? (
            <div
              className="space-y-2 py-2"
              data-testid="pimia-estimate-customer-loading"
            >
              {["a", "b", "c"].map((id) => (
                <Skeleton className="h-10 w-full" key={id} />
              ))}
            </div>
          ) : null}

          {query.isError ? (
            /* El error se dice con las palabras del servidor, no con un «no se
               ha podido» de casa: si lo que falta es el permiso
               `customers:read`, quien lo lea tiene que saber que reintentar no
               le va a servir de nada. La reconexión no se ofrece aquí dentro
               —un diálogo dentro de otro se pelea por el foco—, sino que se
               dice dónde está. */
            <div className="space-y-3 py-6 text-center" role="alert">
              <p className="text-sm text-muted-foreground">
                {query.error instanceof PimiaApiError
                  ? query.error.message
                  : "No se ha podido leer la lista de clientes."}
              </p>
              {query.error instanceof PimiaApiError &&
              query.error.missingScope ? (
                <p className="text-xs text-muted-foreground">
                  Falta el permiso{" "}
                  <code className="font-mono">{query.error.missingScope}</code>.
                  Vuelve a autorizar el tenant desde la barra lateral y repite
                  el alta.
                </p>
              ) : null}
              <Button onClick={() => void query.refetch()} variant="outline">
                Reintentar
              </Button>
            </div>
          ) : null}

          {query.isSuccess && customers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {search
                ? "Ningún cliente coincide con esa búsqueda."
                : "Este tenant todavía no tiene clientes. Se dan de alta en Pimia."}
            </p>
          ) : null}

          {customers.map((customer) => {
            // La segunda línea sólo aparece donde hay dato: rellenarla por
            // simetría sería inventar densidad.
            const detail =
              customer.contactName ?? customer.email ?? customer.taxId ?? null;
            return (
              <button
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-hidden hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`pimia-estimate-customer-${customer.id}`}
                key={customer.id}
                onClick={() => onPick({ id: customer.id, name: customer.name })}
                type="button"
              >
                <span className="text-sm font-medium text-foreground">
                  {customer.name}
                </span>
                {detail ? (
                  <span className="text-xs text-muted-foreground">
                    {detail}
                  </span>
                ) : null}
              </button>
            );
          })}

          {hasMore ? (
            <p className="px-3 pt-2 text-xs text-muted-foreground">
              Se enseñan los {PICKER_LIMIT} primeros. Si el cliente no está,
              afina la búsqueda.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PimiaEstimatesScreen() {
  const tenant = useActivePimiaTenant();
  const [status, setStatus] = React.useState<PimiaEstimateStatus | undefined>();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [range, setRange] = React.useState<PimiaDateRangePreset>("any");
  const [sort, setSort] = React.useState<PimiaEstimateSort>({
    direction: "desc",
    field: "estimate_date",
  });
  const [pageSize, setPageSize] = React.useState(PAGE_SIZES[0]);
  const [page, setPage] = React.useState(1);
  /* El alta son dos pasos y por eso son dos estados: primero se elige el
     cliente y sólo entonces existe el borrador. Al cerrar el segundo diálogo se
     suelta el cliente, para que el siguiente «Nuevo presupuesto» vuelva a
     empezar por el principio en vez de heredar al de antes. */
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [newFor, setNewFor] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const { goPimiaCustomer, goPimiaEstimate } = useAppNavigation();

  // La búsqueda va contra la API del tenant, no contra una lista en memoria:
  // una petición por tecla es una petición por tecla.
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

  const query = usePimiaEstimatesQuery({
    fromDate: dateRange.fromDate,
    limit: pageSize,
    orderBy: sort.direction,
    orderByField: sort.field,
    page,
    search,
    status,
    toDate: dateRange.toDate,
  });

  // Recuentos del TENANT, sin filtros: la salud del negocio. `limit: 1` porque
  // solo se lee el total del paginador y no hacen falta las filas.
  const sentQuery = usePimiaEstimatesQuery({ limit: 1, status: "SENT" });
  const viewedQuery = usePimiaEstimatesQuery({ limit: 1, status: "VIEWED" });
  const acceptedQuery = usePimiaEstimatesQuery({
    limit: 1,
    status: "ACCEPTED",
  });
  const expiredQuery = usePimiaEstimatesQuery({ limit: 1, status: "EXPIRED" });

  /* Los recuentos de las PESTAÑAS: los mismos filtros que la lista, menos el
   * estado, que es justo lo que cada pestaña cambia. Van uno a uno y no en un
   * bucle porque son hooks y un hook no puede vivir dentro de un `map`. */
  const tabCountInput = {
    fromDate: dateRange.fromDate,
    limit: 1,
    search,
    toDate: dateRange.toDate,
  };
  const allTabQuery = usePimiaEstimatesQuery(tabCountInput);
  const draftTabQuery = usePimiaEstimatesQuery({
    ...tabCountInput,
    status: "DRAFT",
  });
  const sentTabQuery = usePimiaEstimatesQuery({
    ...tabCountInput,
    status: "SENT",
  });
  const viewedTabQuery = usePimiaEstimatesQuery({
    ...tabCountInput,
    status: "VIEWED",
  });
  const acceptedTabQuery = usePimiaEstimatesQuery({
    ...tabCountInput,
    status: "ACCEPTED",
  });
  const rejectedTabQuery = usePimiaEstimatesQuery({
    ...tabCountInput,
    status: "REJECTED",
  });
  const expiredTabQuery = usePimiaEstimatesQuery({
    ...tabCountInput,
    status: "EXPIRED",
  });

  /* «Hoy» se calcula UNA vez y baja como prop a la tabla, en vez de una vez por
   * fila: con cien filas serían cien relojes, que además podrían cruzar la
   * medianoche a mitad de tabla. Y es el día LOCAL de quien mira (`todayIso`),
   * no el de UTC: con `new Date().toISOString()` un presupuesto que caduca hoy
   * saldría caducado a la una de la madrugada española. Va antes del
   * `if (!tenant)` porque un hook no puede quedar detrás de un `return`.
   *
   * Pero UNA vez no es «al montar y ya»: un ERP se queda abierto de un día para
   * otro, que es lo normal en un puesto de administración, y con el día
   * congelado a las 09:00 del día siguiente la tabla seguiría midiendo contra
   * el «hoy» de ayer. Así que se vuelve a mirar el reloj cada minuto y solo se
   * re-renderiza cuando el día CAMBIA de verdad —el `setToday` devuelve el
   * mismo string el resto de la jornada, y React no repinta—. */
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

  const estimates = query.data?.estimates ?? [];
  const lastPage = query.data?.pagination?.lastPage ?? 1;
  const totalCount = query.data?.totalCount ?? null;
  /* El «Total en pantalla» del pie, en ESTRICTO.
   *
   * ⚠️ Hasta el 2026-08-18 esto era un `reduce` con `?? 0`, y ese `?? 0` no
   * daba un total «casi bueno»: daba uno **más pequeño que el real con
   * exactamente el mismo aspecto que el bueno**. Un `total` que `readCents` no
   * supo leer entraba en la suma valiendo cero y salía invisible — sin signo,
   * sin color, sin una cifra rara que invitara a mirar dos veces. Y se pintaba
   * en el pie de la misma tabla donde esa fila ya estaba enseñando su raya, así
   * que la tabla se contradecía a sí misma y ganaba la mentira, porque el pie es
   * lo que la gente copia.
   *
   * `sumStrict` devuelve `null` en cuanto un sumando no es un número finito, y
   * con `null` la lista **esconde el pie entero** (el porqué de esconderlo en
   * vez de rayarlo está en el docblock de `totalCents` en `PimiaEstimateList`).
   *
   * Sobre el `?? []` de arriba: `sumStrict` suma `0` para una lista vacía, que
   * es el total honesto de una lista sin sumandos, pero `estimates` también está
   * vacía **mientras la petición vuela**. Aquí no engaña porque toda la tarjeta
   * de la tabla —pie incluido— cuelga de `estimates.length > 0`: ese `0` no
   * llega nunca a pintarse. */
  const totalCents = sumStrict(
    estimates.map((estimate) => estimate.totalCents),
  );

  const hasFilters = Boolean(search || status || range !== "any");

  /* El recuento de una consulta de `limit: 1`, y cuándo NO se puede afirmar.
   *
   * Sale de `pagination.total`, que es el total del PAGINADOR y ése sí filtra…
   * cuando lo manda el servidor. `/estimates` hoy no lo manda: responde
   * `meta.estimate_total_count` a secas y la capa de API lo FABRICA con
   * `total: companyTotalCount`, el total del tenant entero (ver el docblock de
   * arriba). Contra un servidor así las siete pestañas dirían todas «· 129» y
   * las tarjetas «Sin respuesta 129 / Aceptados 129 / Caducados 129».
   *
   * Lo que sí se puede comprobar desde aquí es el síntoma: si la consulta iba
   * **filtrada** y aun así el recuento coincide clavado con el total del tenant,
   * no hay manera de separar «el filtro deja pasar todo» de «me han dado el
   * total sin filtrar». Eso no se puede afirmar ⇒ **raya**, y la línea de debajo
   * de las tarjetas dice por qué. Sin filtros —la pestaña «Todos» a secas— la
   * coincidencia no es sospechosa: ahí el recuento y el total del tenant SON la
   * misma cifra, y se afirma. El precio es una raya de más en el tenant que
   * tenga todos sus presupuestos en un mismo estado; una raya de más se
   * pregunta, una cifra de más se cree. */
  const readCount = (
    page: PimiaEstimatePage | undefined,
    filtered: boolean,
  ): number | null => {
    const total = page?.pagination?.total;
    if (typeof total !== "number") {
      return null;
    }
    return filtered && total === page?.companyTotalCount ? null : total;
  };

  /* ¿Va filtrada la consulta de un recuento? Las de estado —las seis pestañas y
   * las tres tarjetas del tenant— llevan el suyo siempre; «Todos» solo va
   * filtrada si hay búsqueda o rango puestos. */
  const countFiltered = Boolean(search || range !== "any");
  const tabFiltered = (value: string) => value !== ALL_TAB || countFiltered;

  /* «Sin respuesta» son dos peticiones distintas, y por eso se suman con la
   * misma regla que los importes: si una de las dos no ha vuelto (`undefined`)
   * o su recuento no se puede afirmar (`null`), el resultado es `null` y
   * `count()` pinta la raya. Contar la que falta como 0 daría una cifra menor
   * que la real —«3 sin respuesta» cuando son 11— indistinguible de la buena. */
  const awaiting = sumStrict([
    readCount(sentQuery.data, true),
    readCount(viewedQuery.data, true),
  ]);
  const acceptedCount = readCount(acceptedQuery.data, true);
  const expiredCount = readCount(expiredQuery.data, true);

  const tabQueryByStatus = {
    ACCEPTED: acceptedTabQuery,
    DRAFT: draftTabQuery,
    EXPIRED: expiredTabQuery,
    REJECTED: rejectedTabQuery,
    SENT: sentTabQuery,
    VIEWED: viewedTabQuery,
  };
  const tabQueries: Array<{
    label: string;
    query: typeof allTabQuery;
    value: string;
  }> = [
    { label: "Todos", query: allTabQuery, value: ALL_TAB },
    ...ESTIMATE_STATUSES.map((candidate) => ({
      label: ESTIMATE_STATUS_META[candidate].plural,
      query: tabQueryByStatus[candidate],
      value: candidate as string,
    })),
  ];

  /* Mientras las cuentas vuelan se enseña SÓLO el rótulo: siete «—»
   * parpadeando en las pestañas parecen siete fallos, no una carga.
   *
   * Y `isPlaceholderData` cuenta como volar. `usePimiaEstimatesQuery` lleva
   * `placeholderData: (previous) => previous`, así que al cambiar de filtro
   * react-query sigue sirviendo la respuesta del filtro ANTERIOR con
   * `status: "success"` e `isPending` en false: sin esta segunda condición,
   * elegir «Este trimestre» dejaría las pestañas diciendo «Aceptados · 31» del
   * rango sin filtrar —sin ninguna marca de caducidad— mientras la lista de
   * abajo ya se atenúa con su `isFetching`. Una cifra vieja con pinta de fresca
   * es exactamente lo que estas pestañas vienen a evitar. */
  const countsInFlight = tabQueries.some(
    ({ query: tab }) => tab.isPending || tab.isPlaceholderData,
  );
  const countsFailed =
    tabQueries.some(({ query: tab }) => tab.isError) ||
    sentQuery.isError ||
    viewedQuery.isError ||
    acceptedQuery.isError ||
    expiredQuery.isError;

  /* La otra fuente de rayas: el recuento llegó entero y aun así no se puede
   * afirmar (ver `readCount`). No es un fallo de red, así que la línea de abajo
   * lo cuenta con sus palabras en vez de meterlo en el mismo saco: «no se ha
   * podido leer» y «no se puede separar del total del tenant» se arreglan en
   * sitios distintos. */
  const unaffirmable = (
    tab: { data?: PimiaEstimatePage; isSuccess: boolean },
    filtered: boolean,
  ) => tab.isSuccess && readCount(tab.data, filtered) === null;
  const countsUnaffirmable =
    (!countsInFlight &&
      tabQueries.some(({ query: tab, value }) =>
        unaffirmable(tab, tabFiltered(value)),
      )) ||
    unaffirmable(sentQuery, true) ||
    unaffirmable(viewedQuery, true) ||
    unaffirmable(acceptedQuery, true) ||
    unaffirmable(expiredQuery, true);

  const tabs = tabQueries.map(({ label, query: tab, value }) => ({
    label: countsInFlight
      ? label
      : `${label} · ${count(readCount(tab.data, tabFiltered(value)))}`,
    value,
  }));

  /* La acción primaria, y la misma puerta que ofrece el vacío del tenant nuevo.
   * Dos botones iguales, pero con `data-testid` distinto a propósito: cuando la
   * lista está vacía los dos están en pantalla a la vez, y un identificador
   * repetido convierte cualquier `getByTestId` en un fallo de «hay dos». */
  const newEstimateButton = (testId: string) => (
    <Button data-testid={testId} onClick={() => setIsPickerOpen(true)}>
      <Plus className="h-4 w-4" />
      Nuevo presupuesto
    </Button>
  );

  return (
    // El panel no scrollea como un documento: la cabecera, los totales y los
    // filtros se quedan, y el scroll vive dentro de la tarjeta de la tabla para
    // que el pie de paginación descanse siempre en su base.
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-6">
      <PimiaPageHeader
        action={newEstimateButton("pimia-estimate-new")}
        description="Presupuestos emitidos, su estado y lo que hay en juego."
        title="Presupuestos"
      />

      {/* Las cuatro cifras del TENANT: no las tocan ni la búsqueda ni los
          filtros, y por eso los `hint` lo dicen. Lo que no se pudo leer —o no se
          puede afirmar— sale como raya. */}
      <section aria-labelledby={SUMMARY_TITLE_ID} className="shrink-0">
        <h2 className="sr-only" id={SUMMARY_TITLE_ID}>
          Resumen de los presupuestos del tenant
        </h2>
        <PimiaStatCards
          stats={[
            {
              hint: "en el tenant",
              label: "Emitidos",
              value: count(query.data?.companyTotalCount),
            },
            {
              hint: "en el tenant, a la espera de respuesta",
              label: "Sin respuesta",
              value: count(awaiting),
            },
            {
              hint: "en el tenant, listos para facturar",
              label: "Aceptados",
              value: count(acceptedCount),
            },
            {
              hint: "en el tenant, fuera de plazo",
              label: "Caducados",
              value: count(expiredCount),
            },
          ]}
        />
      </section>

      {/* Las rayas de arriba y de las pestañas dicen «esto no se sabe», pero no
          por qué. Un recuento caído se lee exactamente igual que un tenant que
          no tiene ninguno, y son cosas muy distintas cuando la etiqueta dice
          «Caducados». Esta línea es lo único que las separa; la lista de abajo
          va por su cuenta y no se ve afectada. */}
      {countsFailed || countsUnaffirmable ? (
        <p
          className="-mt-2 shrink-0 text-xs text-muted-foreground"
          data-testid="pimia-estimate-counts-error"
          role="status"
        >
          {countsFailed ? "Algunos recuentos no se han podido leer. " : null}
          {countsUnaffirmable
            ? "Algunos recuentos llegan filtrados iguales al total del tenant y no hay forma de separarlos de él, así que no se afirman. "
            : null}
          Los que salen con una raya no están contados; la lista de presupuestos
          no se ve afectada.
        </p>
      ) : null}

      {/* La región de la lista: pestañas, filtros y la tabla, que es lo que
          todos ellos gobiernan. Es un `flex` propio con el mismo `gap-5` del
          contenedor, así que la maqueta no cambia ni un píxel — pero ahora tiene
          nombre, y `min-h-0 flex-1` hereda el crecimiento que necesita la
          tarjeta de la tabla para que el paginador descanse en su base.
          ⚠️ Nada de `display: contents` aquí: quita la caja, sí, pero también
          saca la región del árbol de accesibilidad en varios motores, que es
          justo lo que este `aria-labelledby` viene a arreglar. */}
      <section
        aria-labelledby={LIST_TITLE_ID}
        className="flex min-h-0 flex-1 flex-col gap-5"
        data-testid="pimia-estimates-list-section"
      >
        <h2 className="sr-only" id={LIST_TITLE_ID}>
          Listado de presupuestos
        </h2>

        <PimiaStatusTabs
          onValueChange={(value) => {
            setStatus(
              value === ALL_TAB ? undefined : (value as PimiaEstimateStatus),
            );
            setPage(1);
          }}
          options={tabs}
          testIdPrefix="pimia-estimate-filter"
          value={status ?? ALL_TAB}
        />

        <PimiaFilterBar
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por número o cliente"
          searchTestId="pimia-estimate-search"
          searchValue={searchInput}
        >
          <Select
            onValueChange={(value) => {
              setRange(value as PimiaDateRangePreset);
              setPage(1);
            }}
            value={range}
          >
            <SelectTrigger
              className="h-9 w-44"
              data-testid="pimia-estimate-range"
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
              data-testid="pimia-estimate-sort"
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
        </PimiaFilterBar>

        {query.isPending ? <PimiaRowsSkeleton /> : null}
        {query.isError ? (
          <PimiaErrorState
            error={query.error}
            onRetry={() => query.refetch()}
          />
        ) : null}

        {query.isSuccess && estimates.length === 0 ? (
          // Con filtros puestos el vacío no ofrece nada: lo que hay que hacer es
          // quitarlos, y para eso están arriba. La puerta solo se enseña cuando
          // el tenant de verdad no tiene ninguno todavía.
          <PimiaEmpty
            action={
              hasFilters ? null : newEstimateButton("pimia-estimate-empty-new")
            }
            description={
              hasFilters
                ? "Prueba a quitar el filtro o a buscar otra cosa."
                : "Los que emitas aparecerán aquí con su estado, su caducidad y su importe."
            }
            title={
              hasFilters
                ? "Ningún presupuesto coincide"
                : "Todavía no hay presupuestos"
            }
          />
        ) : null}

        {estimates.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto transition-opacity",
                query.isFetching && "opacity-60",
              )}
            >
              <PimiaEstimateList
                estimates={estimates}
                onOpen={(id) => void goPimiaEstimate(id)}
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
              shown={estimates.length}
              total={totalCount}
            />
          </div>
        ) : null}
      </section>

      {/* Los dos pasos del alta. Cada uno se monta sólo cuando le toca: el
          buscador no consulta clientes mientras nadie lo pide, y el borrador
          nace vacío para cada cliente en vez de heredar las líneas del anterior. */}
      {isPickerOpen ? (
        <PimiaEstimateCustomerPicker
          onOpenChange={setIsPickerOpen}
          onPick={(customer) => {
            setIsPickerOpen(false);
            setNewFor(customer);
          }}
        />
      ) : null}
      {newFor ? (
        <PimiaEstimateCreateDialog
          customerId={newFor.id}
          customerName={newFor.name}
          onOpenChange={(open) => {
            if (!open) {
              setNewFor(null);
            }
          }}
          open
        />
      ) : null}
    </div>
  );
}
