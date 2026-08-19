/**
 * La ficha de un presupuesto: **el papel** en el centro y, a la derecha, el raíl
 * con lo que el papel no dice — en qué punto está el ciclo comercial.
 *
 * Hasta hoy eran dos tarjetas de etiqueta/valor («Presupuesto» y «Cliente»)
 * encima de una tabla de cinco columnas: para saber a quién va, por cuánto y
 * hasta cuándo vale había que recorrer tres cajas, y ninguna de las tres se
 * parecía al documento que el destinatario recibe por correo. El rediseño llega
 * junto con el ensanche de `normalizeEstimate`, y no por casualidad: el NIF del
 * cliente, su dirección fiscal, **el lead al que va dirigido** y quién lo
 * preparó **ya venían en la respuesta** de `GET /estimates/{id}` y se tiraban
 * allí.
 *
 * ## Aquí está la pantalla; el papel vive en `PimiaEstimateDocument.tsx`
 *
 * El corte es el mismo que hizo la factura y no es aritmético: allí está **lo
 * que el documento tiene que decir** y aquí **lo que hoy se puede hacer con
 * él** —cabecera, acciones, el raíl del ciclo y la colocación de los dos—.
 * ⚠️ Al portar son **TRES** ficheros para la lista `VERBATIM`: este, el
 * documento y `PimiaDocumentParts.tsx`.
 *
 * ## Lo que NO se puede perder al releerlo
 *
 * Consisten todos en **no** pintar algo, y por eso un rediseño se los lleva por
 * delante sin enterarse:
 *
 * - **Ni un `?? 0` en un importe.** El dinero pasa por `PimiaAmount`, que
 *   distingue «vale cero» de «no se pudo leer». Hasta el 2026-08-18 el «Total»
 *   en negrita de esta ficha llamaba con `?? 0`, así que un total ilegible se
 *   leía «Total 0,00 €» en cuerpo grande mientras la fila del índice ya pintaba
 *   su raya: la cifra más mirada de las tres era la única que mentía, y como
 *   mentía con el aspecto exacto de un dato bueno, nadie tenía motivo para ir a
 *   contrastarla.
 * - **El desglose sale de `resolveDocumentTaxes`**, que agrega con `sumStrict`.
 *   Uno por uno: el IVA y la retención de IRPF sumados dan un neto que esconde
 *   las dos, y el campo `tax` **solo** entra cuando no hay desglose. Aquí llega
 *   ya resuelto por `resolveEstimateTotals`, que es la misma lista que pinta el
 *   pie del papel.
 * - **Las fechas van por `ui/pimiaDates`, jamás por `new Date(cadena)`.** Esta
 *   ficha tuvo su propio `formatDate` con medianoche UTC —al oeste de Greenwich,
 *   un día antes— y la tabla tenía otro con **otro formato**: el mismo
 *   presupuesto enseñaba dos días distintos y ninguno delataba al otro.
 * - **Esta pantalla no recalcula.** Los importes se pintan tal como los devuelve
 *   el servidor, suma incluida: las invariantes fiscales son suyas y una segunda
 *   aritmética aquí solo serviría para discrepar de la factura de verdad.
 *
 * ⚠️ Y **ninguna frase de esta pantalla contiene el rótulo de una insignia ni el
 * de la banda**: las insignias son «Borrador», «Enviado», «Visto», «Aceptado»,
 * «Rechazado» y «Caducado» (`ESTIMATE_STATUS_META`), y la banda dice «Caduca» o
 * «Caducó». Se ven a la vez, así que un `getByText('Aceptado')` casaría con dos
 * elementos y la prueba moriría en `strict mode`. Peor que la prueba: quien lee
 * el mismo rótulo dos veces a diez centímetros supone que son dos hechos
 * distintos. Por eso las frases de `situationSentence` están escritas al revés
 * de como se dirían en voz alta. **Y por eso la insignia de estado sale UNA vez,
 * en la cabecera**: la maqueta la repite dentro de la tarjeta del ciclo, que es
 * el mismo rótulo dos veces en la misma pantalla.
 *
 * ## Lo que el raíl NO puede decir, y por qué
 *
 * - **«Aceptado el …» y «Rechazado el …»**: `EstimateResource` **no publica ni
 *   un instante de transición** (entre 3346 y 3384 no hay `accepted_at` ni
 *   `rejected_at`) y no hay endpoint de actividades. La maqueta los fecha
 *   derivándolos del estado actual, o sea que se los inventa. Solo la caducidad
 *   tiene fecha de verdad, y solo ella tiñe la banda.
 * - **«Convertido en la factura F-…»**: `convert-to-invoice` devuelve la factura
 *   pero **el vínculo no queda persistido** —no existe `converted_to_invoice_id`
 *   en el recurso—, así que al recargar se pierde. Prometer un enlace que
 *   desaparece al refrescar es peor que no ofrecerlo. Se reporta.
 * - **«Motivo del rechazo»**: el cuerpo de `POST /estimates/{id}/status` es
 *   `{status}` a secas. No hay campo donde guardarlo. Se reporta.
 * - **«Etapa» y «Origen» de la oportunidad**: existen en `LeadResource`
 *   (3971-3972) pero **no en la proyección `lead`** que trae el presupuesto
 *   (3387-3393), y sacarlos exigiría un `GET /leads/{id}` con `crm:read`, que el
 *   grant del escritorio no pide.
 */

import { ArrowLeft, Copy, TriangleAlert, User } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { PimiaEstimate } from "@/features/pimia/api/estimates";
import { todayIso } from "@/features/pimia/lib/calendar";
import { daysBetween } from "@/features/pimia/lib/civilDates";
import {
  estimateExpiryWarning,
  isOpenEstimate,
} from "@/features/pimia/lib/estimates";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { usePimiaEstimateQuery } from "@/features/pimia/hooks/usePimiaResources";
import {
  CARD,
  DOCUMENT_PLACEMENT,
  LAYOUT_GRID,
  RailRow,
} from "@/features/pimia/ui/PimiaDocumentParts";
import { PimiaEstimateActions } from "@/features/pimia/ui/PimiaEstimateActions";
import {
  EstimateDocument,
  estimateGoesToLead,
  PimiaLeadChip,
} from "@/features/pimia/ui/PimiaEstimateDocument";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { PimiaPageHeader } from "@/features/pimia/ui/PimiaPageHeader";
import { PimiaEstimateStatusBadge } from "@/features/pimia/ui/PimiaStatusBadge";
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
const CYCLE_TITLE_ID = "pimia-estimate-cycle-title";

/**
 * En qué punto está el presupuesto, dicho con una frase.
 *
 * ⚠️ **Ninguna contiene el rótulo de su insignia** (ver la cabecera del
 * fichero), y por eso están escritas al revés de como se dirían: «Ya salió» y no
 * «Enviado», «dijo que sí» y no «Aceptado». Tampoco llevan dentro «Caduca» ni
 * «Caducó», que son los rótulos de la banda que queda cuatro renglones más
 * abajo.
 *
 * `null` para un estado que la API devuelva y no conozcamos: la insignia ya lo
 * pinta en crudo, y una frase inventada sobre un estado desconocido afirmaría
 * saber lo que no se sabe.
 */
function situationSentence(
  estimate: PimiaEstimate,
  today: string,
): string | null {
  /* «El plazo se agotó» solo se puede decir con una fecha que se entienda:
   * `daysBetween` devuelve `null` ante cualquier cosa que no sea un
   * `YYYY-MM-DD` existente, y entonces aquí no se afirma nada del plazo. */
  const days = daysBetween(today, estimate.expiryDate);
  const outOfTime = days !== null && days < 0;

  switch (estimate.status) {
    case "DRAFT":
      return estimate.customerId || estimate.leadId
        ? "Todavía sin salir: el destinatario no lo conoce."
        : "Sin destinatario asignado todavía.";
    case "SENT":
      return outOfTime
        ? "Salió, y el plazo se agotó sin respuesta."
        : "Ya salió; a la espera de respuesta.";
    case "VIEWED":
      return outOfTime
        ? "El destinatario lo abrió, y el plazo se agotó sin decisión."
        : "El destinatario lo ha abierto; sin decisión todavía.";
    case "ACCEPTED":
      return "El destinatario dijo que sí: se puede pasar a factura.";
    case "REJECTED":
      return "El destinatario dijo que no.";
    case "EXPIRED":
      return "Se agotó el plazo sin respuesta.";
    default:
      return null;
  }
}

type CycleBand = {
  date: string;
  label: string;
  tone: "danger" | "warning" | "neutral";
};

/**
 * La banda tintada del raíl: la única fecha del ciclo que el servidor publica.
 *
 * El rótulo y el tono los pone `estimateExpiryWarning` (`lib/estimates.ts`), que
 * es el mismo cálculo que usa la columna «Válido hasta» del índice: dos avisos
 * distintos sobre el mismo presupuesto en dos pantallas es cómo se aprende a no
 * creerse ninguno. Cuando esa función calla por lejanía —falta más de una
 * semana— la banda sigue, en neutro y con «Caduca» a secas: aquí hay sitio para
 * decir la fecha aunque no haya nada que avisar.
 *
 * `null` en tres casos, y los tres son «no hay nada que decir»: el ciclo ya se
 * cerró por otro camino (`ACCEPTED`, `REJECTED`) o el servidor ya estampó
 * `EXPIRED` —y entonces lo dice la insignia, sin repetirlo dos centímetros más
 * allá—; no hay fecha de caducidad, que es un presupuesto sin plazo y no un dato
 * roto; o la fecha no se entiende, y un plazo inventado sobre una fecha ilegible
 * es la misma mentira que un 0 en el sitio de una raya.
 */
function resolveCycleBand(
  estimate: PimiaEstimate,
  today: string,
): CycleBand | null {
  const expiryDate = estimate.expiryDate;
  if (!isOpenEstimate(estimate.status) || expiryDate === null) {
    return null;
  }
  if (daysBetween(today, expiryDate) === null) {
    return null;
  }
  const warning = estimateExpiryWarning({
    expiryDate,
    status: estimate.status,
    today,
  });
  return {
    date: expiryDate,
    label: warning?.text ?? "Caduca",
    tone: warning?.tone ?? "neutral",
  };
}

/* Ámbar para el plazo que se acaba, rojo para el que ya pasó, y sin tinte
 * cuando sobra tiempo. Ni un color literal: los tres salen de tokens del tema,
 * y el ámbar del `bg-warning-bg` es el mismo que usa el «vence pronto» de la
 * lista de facturas. */
const BAND_TONES: Record<CycleBand["tone"], string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning-bg text-warning",
  neutral: "bg-muted text-foreground",
};

/**
 * El raíl del ciclo: lo que el papel no dice. El papel lleva el desglose porque
 * es lo que un documento tiene que llevar; aquí va **en qué punto está el
 * trato**, que cambia mientras el documento sigue igual — por eso el total se
 * repite: sin él, la banda del plazo no tiene con qué compararse.
 *
 * ⛔ **El desglose fiscal NO se repite aquí, y la maqueta sí lo repite.** Base,
 * cuota por tipo y total salen ya en el pie del papel, que es donde un documento
 * los lleva; copiarlos al raíl pone las mismas cinco cifras dos veces en la
 * misma pantalla, y dos cifras iguales a diez centímetros invitan a buscarles la
 * diferencia. Es la regla que dejó escrita el raíl de la factura, palabra por
 * palabra: allí va **el estado**, no el desglose. Lo único que se repite es el
 * **Total**, y por la razón que dice esa misma nota: sin él, la banda del plazo
 * no tiene con qué compararse.
 *
 * ⛔ **Aquí NO hay bloque «Lead del CRM», y la maqueta sí lo tiene.** Allí ese
 * bloque enseña cuatro renglones —Etapa, Origen, Contacto y Correo— y **dos de
 * los cuatro no existen**: `stage` y `source` están en `LeadResource` pero no en
 * la proyección `lead` que trae el presupuesto. Quitados esos dos, lo que queda
 * es el nombre y el correo, que es **exactamente** lo que el papel ya escribe en
 * «Presupuesto para», a diez centímetros y en la misma pantalla. Repetirlo no
 * añade un dato: añade una segunda copia del mismo dato que hay que mantener de
 * acuerdo, y un `getByText` con el correo del lead que casa dos veces. El raíl
 * habla del **ciclo**; de a quién va, habla el papel. 🔓 El día que la
 * proyección publique `stage` y `source` —es el reporte a plataforma con mejor
 * relación coste/valor de este trabajo—, el bloque vuelve, y entonces sí dirá
 * algo que el papel no dice.
 */
function CycleCard({
  estimate,
  today,
}: {
  estimate: PimiaEstimate;
  today: string;
}) {
  const sentence = situationSentence(estimate, today);
  const band = resolveCycleBand(estimate, today);

  return (
    <section
      aria-labelledby={CYCLE_TITLE_ID}
      className={cn("overflow-hidden", CARD)}
      data-testid="pimia-estimate-cycle"
    >
      <div className="p-4 sm:p-5">
        <h2 className="font-semibold text-foreground" id={CYCLE_TITLE_ID}>
          Ciclo
        </h2>
        {sentence ? (
          <p className="mt-1 text-xs text-muted-foreground">{sentence}</p>
        ) : null}

        {/* Lo único que el raíl dice del destinatario, porque es lo único que
            no es un dato suyo sino una cosa que hacer: sin dirección,
            `sendEstimate` no tiene a quién mandarlo y la acción primaria de
            arriba se queda a medias. Exige `lead` cargado y `email` vacío: con
            la relación sin cargar no se sabe si tiene correo, y afirmar que no
            lo tiene sería inventar un motivo para no poder mandarlo. */}
        {estimateGoesToLead(estimate) &&
        estimate.lead !== null &&
        estimate.lead.email === null ? (
          <p
            className="mt-3 flex items-start gap-2 text-xs text-warning"
            data-testid="pimia-estimate-lead-no-mail"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span>
              La oportunidad no tiene correo en el CRM: para mandarlo hay que
              escribir la dirección a mano.
            </span>
          </p>
        ) : null}

        <dl className="mt-5 text-sm">
          <RailRow
            amountCents={estimate.totalCents}
            amountClassName="text-xl font-semibold"
          >
            <span className="font-semibold text-foreground">Total</span>
          </RailRow>
        </dl>
      </div>

      {/* La banda envuelve y la fecha no encoge, por lo mismo que cuenta
          `RailRow`: a 1024 px el raíl deja 190 px útiles y «Caducó hace 12
          días» más la fecha no caben en una línea. */}
      {band ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-3 sm:px-5",
            BAND_TONES[band.tone],
          )}
          data-testid="pimia-estimate-expiry"
        >
          <span className="min-w-0 text-sm font-semibold">{band.label}</span>
          <time
            className="ml-auto shrink-0 text-lg font-semibold tabular-nums"
            dateTime={band.date}
          >
            {formatIsoDateShort(band.date)}
          </time>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Con la forma de lo que sustituye —papel a la izquierda, raíl a la derecha— y
 * no la de una tabla: el `PimiaRowsSkeleton` de `PimiaStates` dibuja filas, y
 * usarlo aquí hacía saltar la pantalla entera al llegar los datos.
 */
function EstimateDocumentSkeleton() {
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

/**
 * A quién va, en una línea, para el subtítulo de la cabecera.
 *
 * `undefined` —y no una raya— cuando no se sabe: `PimiaPageHeader` omite el
 * renglón entero, que es lo que hay que hacer con un borrador sin destinatario.
 */
function recipientLabel(estimate: PimiaEstimate): string | undefined {
  if (estimate.customerName) {
    return estimate.customerName;
  }
  const lead = estimate.lead;
  return lead?.personName ?? lead?.organizationName ?? lead?.title ?? undefined;
}

export function PimiaEstimateScreen({ estimateId }: { estimateId: string }) {
  const tenant = useActivePimiaTenant();
  const { goPimiaCustomer, goPimiaPath } = useAppNavigation();
  const query = usePimiaEstimateQuery(estimateId);

  if (!tenant) {
    return <PimiaNotConnected />;
  }

  if (query.isError) {
    return (
      <PimiaErrorState error={query.error} onRetry={() => query.refetch()} />
    );
  }

  const estimate = query.data;
  /* El día LOCAL de quien mira, calculado UNA vez y bajado a las dos piezas que
   * lo necesitan: la frase y la banda tienen que estar de acuerdo. Sin el
   * `setInterval` del índice —una ficha se abre y se cierra, no se deja puesta
   * cruzando la medianoche—, y el peor caso es un plazo de un día viejo hasta
   * que se recarga. */
  const today = todayIso();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6 sm:gap-6">
      {query.isPending ? <EstimateDocumentSkeleton /> : null}

      {estimate ? (
        <>
          <PimiaPageHeader
            action={
              // La acción primaria la decide el estado del documento
              // (`PimiaEstimateActions`), así que «ver el cliente» baja al
              // menú: dos botones compitiendo por el mismo sitio dejan de
              // decir cuál es el siguiente paso.
              <PimiaEstimateActions
                estimate={estimate}
                navigationItems={
                  <>
                    {/* ⚠️ Este `if` era una trampa hasta hoy: `customerId`
                        valía la CADENA `"null"` en un presupuesto emitido a un
                        lead —`String(null)`, que es *truthy*—, así que la ficha
                        ofrecía «Ver el cliente» y navegaba a `/customers/null`.
                        Arreglado en `normalizeEstimate`; aquí queda la otra
                        mitad: sin cliente, no hay entrada. */}
                    {estimate.customerId ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          void goPimiaCustomer(estimate.customerId as string)
                        }
                      >
                        <User className="h-4 w-4" />
                        Ver el cliente
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => {
                        void navigator.clipboard?.writeText(
                          estimate.estimateNumber,
                        );
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar el número
                    </DropdownMenuItem>
                  </>
                }
                showPrimaryAction
              />
            }
            back={
              <Button
                className="-ml-2 h-7 px-2 text-muted-foreground"
                onClick={() => void goPimiaPath("/pimia/presupuestos")}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="h-4 w-4" />
                Presupuestos
              </Button>
            }
            description={recipientLabel(estimate)}
            meta={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <PimiaEstimateStatusBadge status={estimate.status} />
                {/* El eje que un presupuesto tiene y una factura no: a quién va
                    dirigido. Se decide por `lead_id`, que llega siempre que
                    haya lead, y no por la relación `lead`, que es opcional. */}
                {estimateGoesToLead(estimate) ? <PimiaLeadChip /> : null}
              </span>
            }
            title={<span className="font-mono">{estimate.estimateNumber}</span>}
          />

          <div className={LAYOUT_GRID}>
            <div className="min-w-0 lg:col-start-3 lg:row-start-1">
              <CycleCard estimate={estimate} today={today} />
            </div>

            <EstimateDocument estimate={estimate} />
          </div>
        </>
      ) : null}

      {query.isSuccess && !estimate ? (
        <PimiaEmpty
          description="Puede que lo hayan borrado o que el enlace esté caducado."
          title="No se encontró ese presupuesto"
        />
      ) : null}
    </div>
  );
}
