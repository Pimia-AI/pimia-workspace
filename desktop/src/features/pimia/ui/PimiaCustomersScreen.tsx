/**
 * Clientes — el índice de la cartera del tenant.
 *
 * Misma anatomía que Facturas, que es el listón: cabecera, tira de cifras del
 * tenant, buscador, tabla densa con menú por fila y pie con la paginación
 * anclada a la base de la tarjeta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRES COSAS QUE ESTA PANTALLA NO TIENE, Y NO ES UN DESCUIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1 · **No hay pestañas de estado.** Los otros dos índices las llevan y la
 *     simetría las pide, pero **un cliente no tiene eje de estado**: no existe
 *     ningún `status` en `CustomerResource`. Lo que se antoja —«con deuda» /
 *     «al corriente»— **no tiene filtro en el servidor** (`customers.index`
 *     solo declara `external_ref` en el contrato), así que la única forma de
 *     pintarlas sería partir en memoria la página que se está viendo: una
 *     pestaña «Con deuda · 7» que en realidad dice «7 de los 25 que tengo
 *     delante». Eso no es un filtro, es un adorno que miente. 🔓 Entran el día
 *     que `/customers` acepte el filtro y devuelva su recuento.
 *
 * 2 · **No hay cabeceras ordenables.** Por lo mismo: `customers.index` no
 *     declara `orderByField`/`orderBy` y no se ha comprobado que los acepte.
 *     Ordenar la página visible está prohibido por el docblock de
 *     `PimiaSortableHead` —reordena 25 filas de 300 y parece que reordena las
 *     300—. 🔓 Se comprueba contra el tenant vivo y entran las cuatro.
 *
 * 3 · **No hay acción primaria en la cabecera.** No existe `createCustomer` en
 *     `api/customers.ts` ni pantalla de alta en todo el módulo (comprobado
 *     también en `src/app/routes/`: solo `pimia.clientes` y
 *     `pimia.clientes.$customerId`). Un botón «Nuevo cliente» que no lleva a
 *     ningún sitio promete una capacidad que el ERP no tiene y se descubre
 *     después de pulsarlo. Es el mismo trato que dio Facturas. 🔓 El botón
 *     entra el día que exista `POST /customers` en esta capa.
 *
 *     El **vacío** sí lleva puerta, y es la única que hoy existe de verdad: el
 *     panel web del tenant, que es donde se dan de alta. La abre
 *     `openExternalUrl(tenant.baseUrl)` —la raíz, no una ruta adivinada de
 *     `/admin/...`: un enlace profundo inventado que acaba en 404 es peor que
 *     no ofrecerlo—.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DE LAS CIFRAS DE CABECERA SE PORTA LA CUENTA Y NO EL DINERO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La maqueta rotula «N clientes · **X €** pendientes de cobro», y ese importe
 * sale de `filtrados.reduce(...)`: es **la suma de la página** llamada cartera
 * del tenant. Es exactamente el bug que el pase de diseño quitó del panel de
 * inicio, y aquí sería peor, porque `/customers` no publica ningún agregado de
 * dinero contra el que contrastarlo. **Se porta la cuenta.** El importe entra
 * el día que el servidor mande un agregado suyo, y entonces se rotula con
 * exactitud lo que ese agregado cuente.
 *
 * Por eso la tira son **dos** celdas y no cuatro: solo hay dos cifras
 * verdaderas que dar. Cuatro celdas con tres rayas no informan más, informan
 * peor — parecen cuatro cosas rotas en vez de dos cosas sabidas.
 *
 * ⚠️ **Y las dos cifras salen de la MISMA consulta que la lista**, no de
 * consultas de `limit: 1` como en Facturas: `listCustomers` ya devuelve
 * `companyTotalCount` (el total del tenant, que ignora la búsqueda) y
 * `pagination.total` (el del filtro). Ni una petición de más.
 */

import * as React from "react";
import { Copy, ExternalLink, MoreHorizontal, Plus, User } from "lucide-react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type {
  PimiaCustomer,
  PimiaCustomerPage,
} from "@/features/pimia/api/customers";
import { openExternalUrl } from "@/features/pimia/api/shell";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaCustomersQuery } from "@/features/pimia/hooks/usePimiaResources";
import { PimiaAmountCell } from "@/features/pimia/ui/PimiaAmountCell";
import { PimiaEstimateCreateDialog } from "@/features/pimia/ui/PimiaEstimateCreateDialog";
import { PimiaFilterBar } from "@/features/pimia/ui/PimiaFilterBar";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaPagination } from "@/features/pimia/ui/PimiaPagination";
import { PimiaStatCards } from "@/features/pimia/ui/PimiaStatCards";
import {
  PimiaEmpty,
  PimiaErrorState,
  PimiaNotConnected,
  PimiaRowsSkeleton,
} from "@/features/pimia/ui/PimiaStates";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

const PAGE_SIZES = [25, 50, 100];

/* Los `id` de los `<h2>` que rotulan cada región, atados con `aria-labelledby`.
 *
 * Constantes de módulo y no `useId()`: un `aria-labelledby` necesita un ancla
 * ESTABLE entre renders, y de esta pantalla solo hay una instancia viva a la
 * vez. Sin ellos, quien navega por regiones oye «región» a secas dos veces
 * seguidas, porque el único encabezado de la pantalla era el `h1` de
 * `PimiaPageHeader` y todo lo demás colgaba de él sin nombre. */
const SUMMARY_TITLE_ID = "pimia-customers-summary-title";
const LIST_TITLE_ID = "pimia-customers-list-title";

/** Una cifra que no se pudo leer —o que no se puede afirmar— es una raya.
 * Nunca un 0. */
function count(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "—";
}

/**
 * El día de `created_at`, que **no es un `YYYY-MM-DD`**.
 *
 * ⚠️ `CustomerResource.created_at` es un DATETIME (`2026-08-18 09:41:07` o su
 * forma ISO con `T` y zona), mientras que `formatIsoDateShort` solo entiende
 * la fecha civil de tres números — y lo que no entiende lo devuelve **en
 * crudo**, que es su contrato y está bien: enseñar la cadena tal cual es lo
 * que permite reconocer un formato nuevo en vez de tragárselo. Pero en una
 * columna estrecha ese crudo sería un timestamp entero.
 *
 * Así que se recorta el día, y **solo cuando el patrón casa desde el
 * principio**: un `substring(0, 10)` a ciegas sobre cualquier cosa fabricaría
 * una fecha con pinta de buena a partir de un texto que no lo es. Lo que no
 * casa baja tal cual y sale en crudo, como manda `pimiaDates`.
 *
 * 🕳️ Lo que aquí NO se hace, a conciencia: convertir de zona. No se sabe en qué
 * huso escribió el servidor ese instante, y suponerlo movería el alta un día
 * en las horas malas. Se enseña **el día que el servidor escribió**, que es lo
 * único que se sabe de verdad.
 */
function createdAtDay(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(value);
  return match ? match[1] : value;
}

/**
 * El recuento de una consulta, y cuándo NO se puede afirmar.
 *
 * Sale de `pagination.total`, que es el total del PAGINADOR y ese sí filtra.
 * Pero ese objeto no siempre viene del servidor: si `/customers` contesta
 * `meta.customer_total_count` sin `current_page`/`last_page`/`total` —la razón
 * de existir de `derivePagination` en `api/pimiaClient.ts`, escrita ahí mismo
 * pensando en este índice—, la capa de API lo **fabrica** con
 * `total: companyTotalCount`, o sea con el total del tenant SIN FILTRAR. Con
 * una búsqueda puesta, la celda «Coinciden» diría 129 mientras la tabla enseña
 * tres, y el pie remataría «1–3 de 129».
 *
 * Lo que sí se puede comprobar desde aquí es el síntoma: si la consulta iba
 * **filtrada** y aun así el recuento coincide clavado con el total del tenant,
 * no hay manera de separar «la búsqueda deja pasar todo» de «me han dado el
 * total sin filtrar». Eso no se afirma ⇒ **raya**, y la línea de debajo de las
 * cifras dice por qué. Sin búsqueda la coincidencia no es sospechosa: ahí el
 * recuento y el total del tenant SON la misma cifra.
 *
 * El precio es una raya de más en el tenant cuya búsqueda casa con todos sus
 * clientes. Una raya de más se pregunta; una cifra de más se cree.
 *
 * 🔓 El arreglo de raíz es que `derivePagination` diga si la paginación es suya
 * o del servidor. Vive en `api/pimiaClient.ts`, que es costura del anfitrión
 * web y no se toca desde una vista.
 */
function readCount(
  page: PimiaCustomerPage | undefined,
  filtered: boolean,
): number | null {
  const total = page?.pagination?.total;
  if (typeof total !== "number") {
    return null;
  }
  return filtered && total === page?.companyTotalCount ? null : total;
}

export function PimiaCustomersScreen() {
  const tenant = useActivePimiaTenant();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [pageSize, setPageSize] = React.useState(PAGE_SIZES[0]);
  const [page, setPage] = React.useState(1);
  /* El cliente para el que se está redactando un presupuesto. Guardar el objeto
   * y no un booleano evita el estado imposible «diálogo abierto sin cliente»:
   * `PimiaEstimateCreateDialog` exige `customerId` y `customerName`, y los dos
   * están en la fila desde la que se abrió. */
  const [estimateFor, setEstimateFor] = React.useState<PimiaCustomer | null>(
    null,
  );
  const { goPimiaCustomer } = useAppNavigation();

  // Debounce: la búsqueda va contra la API del tenant, no contra una lista en
  // memoria; una petición por tecla es una petición por tecla.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = usePimiaCustomersQuery({ limit: pageSize, page, search });

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  const customers = query.data?.customers ?? [];
  const hasFilters = Boolean(search);

  const tenantCount = query.data?.companyTotalCount ?? null;
  const matchingCount = readCount(query.data, hasFilters);

  /* Mientras la consulta vuela se enseña el rótulo sin cifra: dos rayas
   * parpadeando parecen dos fallos, no una carga. Y `isPlaceholderData` cuenta
   * como volar: `usePimiaCustomersQuery` lleva
   * `placeholderData: (previous) => previous`, así que al escribir en el
   * buscador react-query sigue sirviendo la respuesta ANTERIOR con
   * `status: "success"` — sin esta segunda condición, la celda «Coinciden»
   * seguiría enseñando el recuento de la búsqueda de antes sin ninguna marca
   * de caducidad, mientras la tabla de abajo ya se atenúa con su
   * `isFetching`. */
  const countsInFlight = query.isPending || query.isPlaceholderData;

  /* Las dos causas de raya, contadas aparte porque se arreglan en sitios
   * distintos: «no llegó» es del servidor o de la red, y «no se puede separar
   * del total del tenant» es de `derivePagination`. */
  const reportedTotal = query.data?.pagination?.total;
  const countsFailed =
    !countsInFlight &&
    query.isSuccess &&
    (tenantCount === null || typeof reportedTotal !== "number");
  const countsUnaffirmable =
    !countsInFlight &&
    query.isSuccess &&
    typeof reportedTotal === "number" &&
    matchingCount === null;

  /* Un dato que se puede afirmar sin que el servidor lo diga: **una página más
   * corta que el tamaño de página es la última**. Importa porque el paginador
   * derivado calcula su `lastPage` con el total del tenant, así que con una
   * búsqueda puesta ofrecía seis páginas de las que la segunda salía vacía.
   * Cuando la página viene llena no se sabe nada más y manda lo que diga el
   * paginador. */
  const reportedLastPage = query.data?.pagination?.lastPage ?? 1;
  const lastPage =
    customers.length > 0 && customers.length < pageSize
      ? page
      : reportedLastPage;

  /* La puerta del vacío. NO es «Nuevo cliente» —no existe, ver el docblock—:
   * es el sitio donde de verdad se da de alta uno, y el mismo que ya nombra el
   * texto del vacío. Un vacío que explica de dónde salen los clientes y luego
   * no enseña la puerta se queda a medias. */
  const openTenantPanelButton = (
    <Button
      data-testid="pimia-customer-empty-open-panel"
      onClick={() => {
        void openExternalUrl(tenant.baseUrl).catch(() => {
          toast.error("No se pudo abrir el panel de Pimia");
        });
      }}
      size="sm"
      variant="outline"
    >
      <ExternalLink className="h-4 w-4" />
      Abrir el panel de Pimia
    </Button>
  );

  return (
    // El panel no scrollea como un documento: la cabecera, las cifras y el
    // buscador se quedan, y el scroll vive dentro de la tarjeta de la tabla
    // para que el pie de paginación descanse siempre en su base.
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-6">
      <PimiaPageHeader
        description="La cartera del tenant y lo que cada cliente tiene pendiente."
        title="Clientes"
      />

      {/* Dos cifras y ninguna de dinero (ver el docblock). El `sm:grid-cols-2`
          gana al `sm:grid-cols-4` de la tira por `twMerge`: con dos celdas en
          una rejilla de cuatro, media caja se quedaría vacía. */}
      <section aria-labelledby={SUMMARY_TITLE_ID} className="shrink-0">
        <h2 className="sr-only" id={SUMMARY_TITLE_ID}>
          Resumen de la cartera del tenant
        </h2>
        <PimiaStatCards
          className="sm:grid-cols-2"
          stats={[
            {
              hint: "en el tenant",
              label: "Clientes",
              value: countsInFlight ? "—" : count(tenantCount),
            },
            {
              hint: hasFilters ? "con la búsqueda actual" : "sin filtrar",
              label: "Coinciden",
              value: countsInFlight ? "—" : count(matchingCount),
            },
          ]}
        />
      </section>

      {/* Las rayas de arriba dicen «esto no se sabe», pero no por qué. Un
          recuento caído se lee exactamente igual que un tenant sin clientes, y
          son cosas muy distintas. Esta línea es lo único que las separa; la
          lista de abajo va por su cuenta y no se ve afectada. */}
      {countsFailed || countsUnaffirmable ? (
        <p
          className="-mt-2 shrink-0 text-xs text-muted-foreground"
          data-testid="pimia-customer-counts-error"
          role="status"
        >
          {countsFailed ? "Algún recuento no se ha podido leer. " : null}
          {countsUnaffirmable
            ? "El recuento de la búsqueda llega igual que el total del tenant y no hay forma de separarlos, así que no se afirma. "
            : null}
          Lo que sale con una raya no está contado; la lista de clientes no se
          ve afectada.
        </p>
      ) : null}

      {/* La región de la lista: el buscador y la tabla que gobierna. Es un
          `flex` propio con el mismo `gap-5` del contenedor, así que la maqueta
          no cambia ni un píxel — pero ahora tiene nombre, y `min-h-0 flex-1`
          hereda el crecimiento que necesita la tarjeta para que el paginador
          descanse en su base.
          ⚠️ Nada de `display: contents` aquí: quita la caja, sí, pero también
          saca la región del árbol de accesibilidad en varios motores, que es
          justo lo que este `aria-labelledby` viene a arreglar. */}
      <section
        aria-labelledby={LIST_TITLE_ID}
        className="flex min-h-0 flex-1 flex-col gap-5"
        data-testid="pimia-customers-list-section"
      >
        <h2 className="sr-only" id={LIST_TITLE_ID}>
          Listado de clientes
        </h2>

        {/* Un solo campo, y no los tres de la maqueta (nombre · contacto ·
            teléfono): `listCustomers` manda un único `search` y el contrato no
            declara ningún filtro más. Tres cajas que acaban concatenadas en la
            misma cadena prometerían una precisión que el servidor no da. */}
        <PimiaFilterBar
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por nombre o email"
          searchTestId="pimia-customer-search"
          searchValue={searchInput}
        />

        {query.isPending ? <PimiaRowsSkeleton /> : null}
        {query.isError ? (
          <PimiaErrorState
            error={query.error}
            onRetry={() => query.refetch()}
          />
        ) : null}

        {query.isSuccess && customers.length === 0 ? (
          // Con la búsqueda puesta el vacío no ofrece nada: lo que hay que
          // hacer es quitarla, y para eso está el campo de arriba. La puerta
          // solo se enseña cuando el tenant de verdad no tiene ninguno.
          <PimiaEmpty
            action={hasFilters ? null : openTenantPanelButton}
            description={
              hasFilters
                ? `Ningún cliente coincide con «${search}». Prueba a buscar otra cosa.`
                : "Los clientes se dan de alta en el panel de Pimia; en cuanto exista el primero, aparecerá aquí con su NIF y lo que tenga pendiente."
            }
            title={hasFilters ? "Sin coincidencias" : "Todavía no hay clientes"}
          />
        ) : null}

        {customers.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto transition-opacity",
                query.isFetching && "opacity-60",
              )}
            >
              <Table data-testid="pimia-customer-list">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {/* El nombre se queda con el sobrante; las demás miden lo
                      que mide su contenido. */}
                    <TableHead className="w-full pl-3">Cliente</TableHead>
                    <TableHead className="w-56">Contacto</TableHead>
                    <TableHead className="w-36">NIF / CIF</TableHead>
                    <TableHead className="w-32 whitespace-nowrap">
                      Alta
                    </TableHead>
                    <TableHead className="w-36 text-right">Pendiente</TableHead>
                    <TableHead className="w-12 pr-2">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => {
                    /* La segunda línea solo aparece donde hay un dato de verdad
                     * que poner: quién hay detrás del nombre comercial.
                     * Rellenarla por simetría —con una raya, o repitiendo el
                     * email que ya está en la columna de al lado— sería
                     * inventar densidad. */
                    const subline =
                      customer.contactName ?? customer.companyName;

                    return (
                      <TableRow
                        className="group"
                        data-testid={`pimia-customer-row-${customer.id}`}
                        key={customer.id}
                      >
                        <TableCell className="max-w-0 py-2.5 pl-3">
                          {/* El nombre es el enlace al detalle: un botón de
                            verdad, para que el teclado llegue igual que el
                            ratón. */}
                          <button
                            className="block max-w-full truncate rounded-sm text-left font-medium text-foreground outline-hidden group-hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid={`pimia-customer-${customer.id}`}
                            onClick={() => void goPimiaCustomer(customer.id)}
                            type="button"
                          >
                            {customer.name}
                          </button>
                          {subline ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {subline}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-0 truncate py-2.5 text-muted-foreground">
                          {customer.email ?? customer.phone ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2.5 font-mono text-muted-foreground">
                          {customer.taxId ?? "—"}
                        </TableCell>
                        {/* `created_at` ya se normalizaba y no lo usaba ninguna
                          pantalla. Es un datetime: ver `createdAtDay`. */}
                        <TableCell className="whitespace-nowrap py-2.5 tabular-nums text-muted-foreground">
                          {formatIsoDateShort(createdAtDay(customer.createdAt))}
                        </TableCell>
                        {/* ⚠️ El importe baja tal cual, sin `?? 0`.
                          `due_amount` llega como cadena decimal y `readCents`
                          devuelve `null` en cuanto la forma cambia: un
                          pendiente ilegible pintado «0,00 €» se lee «al
                          corriente de pago», que fue el primer bug de
                          honestidad del proyecto. */}
                        <PimiaAmountCell
                          cents={customer.dueAmountCents}
                          className="py-2.5"
                        />
                        <TableCell className="py-2.5 pr-2 text-right">
                          <PimiaCustomerRowActions
                            customer={customer}
                            onNewEstimate={setEstimateFor}
                            onOpen={(id) => void goPimiaCustomer(id)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* ⚠️ El total del pie es el recuento **afirmable**, no
                `pagination.total` a pelo: con una búsqueda puesta y el
                paginador derivado, ese total es el del tenant entero y el pie
                remataba «1–3 de 129». Con `null`, `describeRange` escribe
                «1–3» y no afirma de cuántos. */}
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
              shown={customers.length}
              total={matchingCount}
            />
          </div>
        ) : null}
      </section>

      {/* Montado solo mientras hay cliente elegido: así el borrador nace limpio
          en cada apertura —y con la fecha de hoy de hoy, que es un caso que el
          docblock del diálogo cuenta— en vez de arrastrar lo tecleado para
          otro cliente. */}
      {estimateFor ? (
        <PimiaEstimateCreateDialog
          customerId={estimateFor.id}
          customerName={estimateFor.name}
          onOpenChange={(open) => {
            if (!open) {
              setEstimateFor(null);
            }
          }}
          open
        />
      ) : null}
    </div>
  );
}

/**
 * El menú de la fila. Todo lo que sale **hace algo**: nada en gris que prometa
 * y no cumpla, y nada que dependa de un endpoint que este módulo no tiene.
 *
 * Por eso no está «Editar» (no hay `updateCustomer` en esta capa) ni «Eliminar»
 * (`POST /customers/delete` existe, pero el diálogo honesto que necesita —el
 * recuento de documentos vinculados— son siete consultas por cliente, y sin él
 * sería un borrado a ciegas).
 */
function PimiaCustomerRowActions({
  customer,
  onNewEstimate,
  onOpen,
}: {
  customer: PimiaCustomer;
  onNewEstimate: (customer: PimiaCustomer) => void;
  onOpen: (customerId: string) => void;
}) {
  const email = customer.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Acciones de ${customer.name}`}
          className="h-7 w-7 text-muted-foreground"
          data-testid={`pimia-customer-actions-${customer.id}`}
          size="icon"
          variant="ghost"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => onOpen(customer.id)}>
          <User className="h-4 w-4" />
          Ver la ficha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onNewEstimate(customer)}>
          <Plus className="h-4 w-4" />
          Nuevo presupuesto
        </DropdownMenuItem>
        {/* Solo cuando hay email: una opción «Copiar el email» que copia el
            vacío es una acción que finge haber hecho algo. */}
        {email ? (
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(email);
            }}
          >
            <Copy className="h-4 w-4" />
            Copiar el email
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
