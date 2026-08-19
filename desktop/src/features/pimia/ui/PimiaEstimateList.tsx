/**
 * La tabla de presupuestos, compartida por el detalle de cliente y la pantalla
 * general. Solo pinta: los datos, el orden y la paginación los pone quien la
 * usa.
 *
 * Es la lista densa de la referencia (`invoice-list-2`): cabeceras que ordenan
 * contra el servidor, el estado como insignia semántica, el importe a la
 * derecha en cifras de ancho fijo con la base debajo, y un menú de acciones
 * por fila.
 *
 * **El destinatario de un presupuesto no siempre es un cliente**, y ésa es la
 * diferencia de fondo con la tabla de facturas: se le manda igual a un lead del
 * CRM, que todavía no está dado de alta. Cuando el presupuesto va a uno, el
 * servidor manda `customer_id: null` y `lead_id` relleno, así que la columna
 * lleva la insignia LEAD junto al nombre — y el menú de la fila deja de ofrecer
 * «Ver el cliente», que es lo correcto: no hay ficha a la que ir.
 * ⚠️ El nombre del lead sale de la proyección `lead`, que es **opcional**: si
 * no viene (este índice pide `view=summary`, y está sin comprobar que la
 * lleve), queda la insignia sola sobre una raya. Eso dice exactamente lo que se
 * sabe —«va a una oportunidad, no a un cliente»— sin inventarse a quién.
 *
 * ⚠️ **Ni el criterio ni la insignia se escriben aquí**: los dos se importan de
 * `PimiaEstimateDocument` —`estimateGoesToLead` y `PimiaLeadChip`—, que es donde
 * viven razonados. Hasta el 2026-08-19 esta tabla tenía los suyos propios y los
 * dos habían derivado: la condición era `leadId` a secas, así que un presupuesto
 * con los DOS ids salía marcado aquí junto al nombre del cliente que sí tiene y
 * sin marcar en su propia ficha, a un clic de distancia; y el rótulo iba escrito
 * «Lead» en el DOM y puesto en mayúsculas por CSS, que reabre justo la colisión
 * de `getByText` que la insignia de la ficha evita escribiéndolo ya en
 * mayúsculas. Una segunda copia de una regla de negocio en una tabla es una
 * regla que nadie va a acordarse de cambiar dos veces.
 *
 * La segunda línea solo aparece donde hay un dato de verdad que poner. La
 * referencia la usa en casi todas las celdas (descripción, email del cliente),
 * pero el índice de presupuestos de Pimia devuelve del cliente solo el nombre:
 * rellenar el hueco por simetría sería inventar densidad.
 *
 * **La columna «Válido hasta» avisa de lo que está por caducar**, que era la
 * mitad que faltaba: la insignia dice «Caducado» cuando el servidor ya lo ha
 * estampado, pero nada decía «caduca en 3 días», y en una lista donde el que
 * caduca mañana se ve igual que el de noviembre no hay a quién llamar primero.
 * La regla vive en `lib/estimates.ts` con sus pruebas —incluida la diferencia
 * con las facturas: aquí el rojo lo enciende el calendario, porque `EXPIRED` es
 * un estado y el barrido que lo estampa va por detrás—; aquí solo se pinta.
 * ⚠️ `today` **baja como prop**, no se calcula por fila: cien filas serían cien
 * relojes, y podrían cruzar la medianoche a mitad de tabla.
 *
 * ⚠️ **Las dos fechas pasan por `ui/pimiaDates`, no por `new Date()`.** Hasta el
 * 2026-08-18 este fichero tenía su propio `formatDate` con un `new Date(value)`
 * sobre el `YYYY-MM-DD` de la API, que es **medianoche UTC**: al oeste de
 * Greenwich «válido hasta 2026-08-18» se escribía «17 ago 2026», y un
 * presupuesto parecía caducar el día antes de caducar. No se reproduce jamás
 * desde Madrid, así que no lo iba a cazar nadie mirando. `formatIsoDateShort`
 * monta la fecha a mediodía local; el porqué completo está en su fichero.
 */

import { Copy, FileText, User } from "lucide-react";

import type {
  PimiaEstimate,
  PimiaEstimateSortField,
} from "@/features/pimia/api/estimates";
import { estimateExpiryWarning } from "@/features/pimia/lib/estimates";
import { formatCents } from "@/features/pimia/lib/money";
import { cn } from "@/shared/lib/cn";
import { PimiaAmountCell } from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { PimiaEstimateActions } from "@/features/pimia/ui/PimiaEstimateActions";
import {
  estimateGoesToLead,
  PimiaLeadChip,
} from "@/features/pimia/ui/PimiaEstimateDocument";
import {
  PimiaSortableHead,
  type PimiaSortState,
} from "@/features/pimia/ui/PimiaSortableHead";
import { PimiaEstimateStatusBadge } from "@/features/pimia/ui/PimiaStatusBadge";
import { DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

export type PimiaEstimateSort = PimiaSortState<PimiaEstimateSortField>;

type PimiaEstimateListProps = {
  estimates: PimiaEstimate[];
  /** Abre la ficha del presupuesto. Sin esto el número no es un enlace. */
  onOpen?: (estimateId: string) => void;
  /** Abre la ficha del cliente del presupuesto. */
  onOpenCustomer?: (customerId: string) => void;
  onSortChange?: (sort: PimiaEstimateSort) => void;
  /** Oculta la columna de cliente cuando ya se está dentro de uno. */
  showCustomer?: boolean;
  /** Sin esto las cabeceras no ordenan (el detalle de cliente no lo necesita). */
  sort?: PimiaEstimateSort;
  /**
   * El día LOCAL de quien mira, en `YYYY-MM-DD` (`todayIso()` de
   * `lib/calendar.ts`). Es lo único contra lo que se mide el preaviso de
   * caducidad de la columna «Válido hasta».
   *
   * **Opcional a propósito, y no por comodidad**: hoy son tres los llamantes
   * (ver `totalCents`) y sólo el índice general lo pasa. Sin él la columna se
   * comporta como antes —la fecha y nada más—, que es una tabla más pobre pero
   * no una tabla que mienta. Un valor por defecto leído aquí dentro sería lo
   * contrario: un `todayIso()` por fila, cien relojes en una tabla de cien
   * filas, y un «hoy» que se congela al montar en una pantalla que se queda
   * abierta de un día para otro (el índice lo refresca cada minuto, ver
   * `PimiaEstimatesScreen`).
   *
   * Hoy lo pasan dos de los tres: `PimiaEstimatesScreen` (el índice general) y
   * `PimiaCustomerScreen` (el detalle de cliente, donde un presupuesto a punto
   * de caducar es justamente lo que se busca al abrir la ficha). 🔓 Falta
   * `PimiaScreen`, el panel, y lo querrá en cuanto alguien lo toque: pasarlo es
   * una línea y no cambia nada más. Quien lo pase, que arregle esta frase en el
   * mismo cambio — ver el aviso de `totalCents`, que cuenta lo que costó
   * dejarla obsoleta una vez.
   */
  today?: string;
  /**
   * Suma de lo que hay en pantalla, al pie y en la columna del importe.
   *
   * Los tres valores dicen tres cosas distintas y por eso el tipo tiene tres
   * estados:
   *
   * - **un número** → hay total y se pinta el pie;
   * - **`undefined`** → quien llama no quiere pie;
   * - **`null`** → hay pie que pintar pero la suma **no se pudo hacer**: algún
   *   importe de la página llegó ilegible y `sumStrict` cortó la suma entera.
   *
   * Hoy son tres los llamantes, y conviene tenerlos contados porque la pregunta
   * que se hace al auditar es «¿queda algún pie sumando con `?? 0`?»:
   * `PimiaEstimatesScreen` (el listado general) y `PimiaCustomerScreen` (el
   * detalle de cliente) **sí pasan `totalCents`, y los dos lo calculan con
   * `sumStrict`**; solo `PimiaScreen` (el panel) omite la prop, porque enseña
   * los últimos presupuestos y sumar un recorte no significaría nada.
   *
   * ⚠️ Esta lista se escribió mal una vez y el error costó un fallo: hasta el
   * 2026-08-18 decía que el detalle de cliente era de los que no querían pie
   * —cuando sí lo pintaba, y encima con un `reduce` y `?? 0`—, así que el mismo
   * commit que dejó el hueco escribió la frase que hacía que nadie fuera a
   * mirarlo. Quien añada o quite un llamante, que actualice esta enumeración en
   * el mismo cambio: aquí una frase desactualizada no es una errata, es un
   * fallo que se esconde solo.
   *
   * ⚠️ **Con `null` el pie se esconde ENTERO, y no se raya.** Es la decisión que
   * el anfitrión web ya tomó en su `PimiaLeadsScreen`/`PimiaLeadList` y que aquí
   * se copia con el mismo criterio. Las tres opciones se miraron: un total con
   * el hueco contado como 0 es la peor, porque es una cifra menor que la real
   * con el mismo aspecto que la buena; una raya en la celda del total es mejor,
   * pero la fila del pie sigue diciendo «Total en pantalla» sobre una columna de
   * dinero, y una raya ahí se lee a la primera como «cero» —es el sitio donde el
   * ojo espera una suma, no un hueco—; esconder la fila es lo único que no
   * admite lectura falsa. Un pie ausente dice «no puedo sumar esto» y quien
   * buscaba el total pregunta por él; quien ve una cifra falsa se la cree.
   *
   * (La raya sí es lo correcto **dentro de una fila**, y ahí se pinta:
   * `PimiaAmountCell` la enseña por el importe que falta. La diferencia es que
   * la fila habla de un documento concreto, y el pie habla de todos a la vez.)
   */
  totalCents?: number | null;
};

export function PimiaEstimateList({
  estimates,
  onOpen,
  onOpenCustomer,
  onSortChange,
  showCustomer = true,
  sort,
  today,
  totalCents,
}: PimiaEstimateListProps) {
  const isSortable = Boolean(sort && onSortChange);

  /** Cabecera ordenable si la pantalla lo pidió, y si no, una normal. */
  const head = (
    field: PimiaEstimateSortField,
    label: string,
    options: { align?: "left" | "right"; className?: string } = {},
  ) =>
    isSortable && sort && onSortChange ? (
      <PimiaSortableHead
        align={options.align}
        className={options.className}
        field={field}
        onSortChange={onSortChange}
        sort={sort}
      >
        {label}
      </PimiaSortableHead>
    ) : (
      <TableHead
        className={
          options.align === "right"
            ? `text-right ${options.className ?? ""}`
            : options.className
        }
      >
        {label}
      </TableHead>
    );

  return (
    <Table data-testid="pimia-estimate-list">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {head("estimate_number", "Número", { className: "w-48 pl-3" })}
          {showCustomer ? (
            // «Destinatario» y no «Cliente»: la columna enseña las dos cosas
            // que un presupuesto puede tener enfrente, y rotularla «Cliente»
            // dejaría la marca LEAD contradiciendo a su propia cabecera.
            <TableHead className="w-full">Destinatario</TableHead>
          ) : null}
          {head("estimate_date", "Fecha", {
            className: "w-32 whitespace-nowrap",
          })}
          {head("expiry_date", "Válido hasta", {
            className: "w-36 whitespace-nowrap",
          })}
          {head("status", "Estado", { className: "w-36" })}
          {head("total", "Importe", {
            align: "right",
            className: "w-44 whitespace-nowrap",
          })}
          <TableHead className="w-12 pr-2">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {estimates.map((estimate) => {
          /* A quién va, decidido por el MISMO criterio que pinta la insignia y
             que el papel de la ficha: `estimateGoesToLead` mira los dos ids. El
             nombre y la insignia tienen que hablar del mismo destinatario, o la
             celda pone el nombre de uno con la marca del otro.

             Dentro del CRM el orden es de lo concreto a lo general: la persona,
             si no la organización, si no el título de la oportunidad. Ninguno
             se inventa —los tres pueden faltar, y la proyección `lead` es
             opcional—, y entonces la celda se queda con la raya y la insignia.
             ⛔ Y no hay respaldo cruzado: a un presupuesto de cliente sin nombre
             de cliente NO se le pone el del lead que arrastre, que sería nombrar
             a quien no lo recibe. */
          const isLead = estimateGoesToLead(estimate);
          const recipient = isLead
            ? (estimate.lead?.personName ??
              estimate.lead?.organizationName ??
              estimate.lead?.title ??
              null)
            : estimate.customerName;
          /* Sin `today` no hay preaviso: quien no lo pasa se queda con la fecha
             a secas, y ninguna fila inventa su propio reloj. */
          const warning = today
            ? estimateExpiryWarning({
                expiryDate: estimate.expiryDate,
                status: estimate.status,
                today,
              })
            : null;

          return (
            <TableRow
              data-testid={`pimia-estimate-${estimate.id}`}
              key={estimate.id}
            >
              <TableCell className="whitespace-nowrap py-2.5 pl-3">
                {onOpen ? (
                  // El número es el enlace a la ficha: un botón de verdad, para
                  // que el teclado llegue igual que el ratón.
                  <button
                    className="rounded-sm font-mono font-medium text-foreground outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`pimia-estimate-open-${estimate.id}`}
                    onClick={() => onOpen(estimate.id)}
                    type="button"
                  >
                    {estimate.estimateNumber}
                  </button>
                ) : (
                  <span className="font-mono font-medium text-foreground">
                    {estimate.estimateNumber}
                  </span>
                )}
              </TableCell>
              {showCustomer ? (
                <TableCell className="max-w-0 py-2.5 font-medium text-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{recipient ?? "—"}</span>
                    {/* El `<span>` es solo el asidero del test: `PimiaLeadChip`
                        no toma props hoy y la fila necesita poder señalarse una
                        a una. Va con `contents` para que no cuente como caja:
                        así el hijo de la fila flex sigue siendo la insignia con
                        su propio `shrink-0`, y el envoltorio no mueve ni un
                        píxel. 🔓 En cuanto la insignia acepte `data-testid`,
                        sobra. */}
                    {isLead ? (
                      <span
                        className="contents"
                        data-testid={`pimia-estimate-lead-${estimate.id}`}
                      >
                        <PimiaLeadChip />
                      </span>
                    ) : null}
                  </span>
                </TableCell>
              ) : null}
              <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">
                {formatIsoDateShort(estimate.estimateDate)}
              </TableCell>
              <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">
                {formatIsoDateShort(estimate.expiryDate)}
                {warning ? (
                  <span
                    className={cn(
                      "block text-xs",
                      warning.tone === "danger"
                        ? "text-destructive"
                        : "text-warning",
                    )}
                    data-testid={`pimia-estimate-expiry-warning-${estimate.id}`}
                  >
                    {warning.text}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="py-2.5">
                <PimiaEstimateStatusBadge status={estimate.status} />
              </TableCell>
              <PimiaAmountCell
                cents={estimate.totalCents}
                className="py-2.5"
                hint={
                  // Solo cuando aporta: si no hay impuestos, base y total son la
                  // misma cifra escrita dos veces.
                  estimate.subTotalCents !== null &&
                  estimate.subTotalCents !== estimate.totalCents
                    ? `Base ${formatCents(estimate.subTotalCents)}`
                    : undefined
                }
              />
              <TableCell className="py-2.5 pr-2 text-right">
                <PimiaEstimateRowActions
                  estimate={estimate}
                  onOpen={onOpen}
                  onOpenCustomer={onOpenCustomer}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {/* `typeof === "number"` y no `!= null`: distingue los tres estados de la
          prop de una vez —el `undefined` de quien no quiere pie y el `null` de
          la suma que no se pudo hacer caen los dos aquí, y los dos significan
          «esta tabla no lleva pie». */}
      {typeof totalCents === "number" ? (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell
              className="pl-3 text-xs font-normal text-muted-foreground"
              colSpan={showCustomer ? 5 : 4}
            >
              Total en pantalla
            </TableCell>
            <PimiaAmountCell cents={totalCents} dimZero={false} />
            <TableCell className="pr-2" />
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
}

/**
 * El menú de la fila: navegar desde aquí, y encima las acciones de documento,
 * que son las mismas que ofrece la ficha (`PimiaEstimateActions`). Todo lo que
 * sale hace algo — nada en gris que prometa y no cumpla.
 */
function PimiaEstimateRowActions({
  estimate,
  onOpen,
  onOpenCustomer,
}: {
  estimate: PimiaEstimate;
  onOpen?: (estimateId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const customerId = estimate.customerId;

  return (
    <PimiaEstimateActions
      estimate={estimate}
      navigationItems={
        <>
          {onOpen ? (
            <DropdownMenuItem onSelect={() => onOpen(estimate.id)}>
              <FileText className="h-4 w-4" />
              Ver el presupuesto
            </DropdownMenuItem>
          ) : null}
          {customerId && onOpenCustomer ? (
            <DropdownMenuItem onSelect={() => onOpenCustomer(customerId)}>
              <User className="h-4 w-4" />
              Ver el cliente
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(estimate.estimateNumber);
            }}
          >
            <Copy className="h-4 w-4" />
            Copiar el número
          </DropdownMenuItem>
        </>
      }
    />
  );
}
