/**
 * El volumen mensual del cliente: una barra por mes, con **barras CSS**.
 *
 * ## Por qué no hay librería de gráficas
 *
 * ⛔ El escritorio **no tiene `recharts`** (comprobado), y meter una dependencia
 * de terceros aquí es cambiar el contrato con los dos anfitriones por una
 * tarjeta. Se hace con barras CSS, como seis de los ocho paneles del panel de
 * inicio del anfitrión web. Lo que se pierde es el tooltip flotante y la
 * composición interna de más de dos series. **La escala no se pierde**: un eje
 * Y con su columna de rótulos no cabe en una tarjeta de móvil, pero el tope sí
 * se escribe, y con eso la gráfica dice «cuánto» y no sólo «cuándo».
 *
 * ## La escala: el tope escrito y una retícula muda
 *
 * 🔴 Sin ninguna referencia de escala, un cliente que va de 80 € a 400 € y otro
 * que va de 80.000 € a 400.000 € dibujan **la misma gráfica píxel a píxel**. La
 * leyenda no lo salva: da la SUMA de cada serie, no la magnitud de ninguna
 * columna. Y quien mira una tarjeta de contexto la mira **con el ratón quieto**,
 * así que el `title` de la columna no cuenta como respuesta.
 *
 * De las tres salidas posibles —rotular cada barra, un eje Y con su canal de
 * rótulos, o escribir el tope— se escribe **el tope**, más una retícula sin
 * rótulos a un cuarto, a la mitad y a tres cuartos. La razón es el ancho:
 * rotular doce barras de ~20 px no cabe, y un canal para «400.000,00 €» se come
 * ~66 px de los ~295 que tiene la tarjeta en un móvil (más de un 20 % del
 * ancho, robado justo a lo que se está comparando). El tope escrito **no compite
 * por el ancho de las columnas**: vive en su propio renglón, a todo lo ancho, y
 * se lee antes que la gráfica. La retícula no rotula ninguna cifra a propósito
 * —dice «la mitad de lo de arriba», que es una relación, no un dato inventado—
 * y con el tope escrito basta para sacar cualquier columna de un vistazo.
 *
 * ## El eje X cuando la tarjeta es estrecha
 *
 * A 375 px la tarjeta deja ~340 px y cada columna se queda en **23,9 px**
 * (medido en el navegador). Ahí no cabía «ene 26» —34,5 px— ni sobraba nada
 * para «sept» —21,7—, y como el `title` no se abre con el dedo, lo truncado no
 * tenía repesca ninguna. Dos arreglos, y ninguno esconde un dato:
 *
 * - **El año baja a un segundo renglón.** Es la mitad ancha del rótulo y sólo
 *   lo llevan los eneros, así que puesto en vertical no le quita sitio a nadie:
 *   el rótulo más ancho pasa a ser «sept». Vale a cualquier ancho, y hace
 *   falta a más anchos de los que parece: en la ficha, a partir de `lg`, esta
 *   tarjeta se mete en dos tercios de la rejilla y las columnas vuelven a ~28
 *   px.
 * - **Por debajo de `sm` se rotula uno de cada dos.** La paridad la manda el
 *   marcador de año: es lo único del eje que el lector no puede deducir —que un
 *   mes va después de otro, sí—. Si los marcadores cayeran en las dos
 *   paridades, no se esconde ninguno: antes un eje apretado que un año
 *   escondido.
 *
 * ⚠️ Lo que se esconde es el **texto**, jamás su celda. Un `display: none` en
 * la celda la saca del reparto del `flex`: los seis rótulos que quedaban se
 * repartían la fila entera y cada uno caía **sobre la columna de otro mes**
 * (medido: «sept» bajo agosto). Rotular mal es peor que no rotular.
 *
 * Nada se pierde por esconder rótulos: el par mes/importe entero sigue en la
 * tabla `sr-only`, y el `title` de la columna sigue donde hay ratón.
 *
 * ## Lo que esta tarjeta NO pinta, y por qué
 *
 * 🔴 **La gráfica de la maqueta no era portable, ni con librería.** Allí las
 * columnas se descomponen en **cobrado / en plazo / vencido / abonos**, y
 * `chartData` publica otras series: `invoiceTotals`, `receiptTotals`,
 * `expenseTotals` y `netProfits`. Re-etiquetar `invoiceTotals` como «cobrado»
 * sería dato inventado del peor tipo, el plausible. Se pinta una gráfica
 * distinta con las series que hay, rotulada por lo que son.
 *
 * 🔴 Tampoco está el «Cobra a N días de media · X % en plazo» de la maqueta: no
 * hay fechas de cobro por factura en ningún sitio del contrato.
 *
 * ⚠️ **Y una duda que hay que sondear antes de fiarse de la etiqueta.**
 * `chartData` cuelga de `/customers/{id}/stats`, pero publica `expenseTotals`
 * —y los gastos no son de un cliente, son de la empresa—, lo que huele a que
 * este `meta` reaprovecha el cálculo del panel general. El contrato no lo
 * aclara. Por eso el subtítulo dice de dónde sale la serie («la que el servidor
 * devuelve para este cliente») en vez de afirmar que cada euro se facturó **a**
 * él: es lo único que se puede sostener sin un tenant vivo delante. Va a la
 * lista de experimentos.
 *
 * ## Las cuatro reglas de honestidad de las barras
 *
 * 1. **Un mes ilegible es un hueco, no un cero.** Una columna vacía se leería
 *    «este mes no facturó», que es una afirmación que nadie ha hecho: el hueco
 *    se marca con un trazo discontinuo y se cuenta al pie.
 * 2. **Un cero leído sí deja la columna vacía**, porque ahí la ausencia dice la
 *    verdad.
 * 3. **El eje es `months.length`, jamás doce.** El contrato de este endpoint
 *    —al revés que el de `GET /dashboard`— **no declara cuántos meses manda**,
 *    así que el rótulo no puede decir «últimos 12 meses». Y una serie que llegue
 *    con otra longitud que el eje entra **entera** como huecos, nunca cruzada a
 *    medias: cruzarla desplazaría el año completo y seguiría pareciendo una
 *    gráfica buena (`lib/series.ts`).
 * 4. **El ancho de una barra no depende de que su dato se pudiera leer.** Cada
 *    serie tiene su media columna fija y no se la cede a la otra: si su importe
 *    es ilegible, esa mitad se queda con el trazo discontinuo. Con las dos
 *    barras como hijos flex de un `justify-center`, un mes al que le faltaba un
 *    dato dibujaba la otra al **doble de ancho** —y a ojo se leía como el mes
 *    grande—, así que el hueco se convertía en énfasis. El alto miente cuando
 *    se rellena con ceros; el ancho miente cuando se reparte lo que sobra.
 */

import type * as React from "react";

import type { PimiaCustomerStats } from "@/features/pimia/api/customers";
import { formatCents, sumStrict } from "@/features/pimia/lib/money";
import {
  barHeightPct,
  monthLabel,
  seriesMax,
} from "@/features/pimia/lib/series";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import { cn } from "@/shared/lib/cn";

const VOLUME_TITLE_ID = "pimia-customer-volume-title";

/** La raya de «no hay dato», para los textos donde no cabe `PimiaAmount`. */
const DASH = "—";

/**
 * El canal entre columnas, escrito una vez: la fila de barras y la de rótulos
 * son dos `flex` distintos y **sólo quedan alineados si comparten el canal**.
 */
const COLUMN_GAP = "gap-0.5 sm:gap-1.5";

/**
 * La retícula, en porcentaje del tope. Sin rótulo a propósito: marca la mitad y
 * los cuartos de la cifra que sí está escrita arriba, y una relación no es un
 * dato que haga falta afirmar.
 */
const GRID_PCT = [25, 50, 75];

/** Desde aquí el eje ya no cabe rotulado entero en un móvil. */
const CROWDED_FROM = 7;

/**
 * Un importe dentro de una frase o de un `title`.
 *
 * ⚠️ `formatCents` escribe `0,00 €` cuando le llega `null` —su contrato, y en
 * una celda con importe siempre está bien—. Aquí no vale: el `null` significa
 * «no se pudo leer», y `0,00 €` afirmaría que ese mes no se facturó nada.
 */
function money(cents: number | null): string {
  return cents === null ? DASH : formatCents(cents);
}

/**
 * El rótulo del eje, partido en sus dos renglones.
 *
 * `monthLabel` escribe un segundo trozo —tras un espacio— sólo en los eneros,
 * que es donde cambia el año. Partirlo por ese espacio es preguntárselo a ella
 * en vez de repetir aquí su regla: si algún día deja de marcar el año, o si el
 * `ym` no se entiende y vuelve en crudo, esto lo sigue pintando entero.
 */
function splitLabel(label: string): { head: string; tail: string | null } {
  const space = label.indexOf(" ");
  if (space === -1) {
    return { head: label, tail: null };
  }
  return { head: label.slice(0, space), tail: label.slice(space + 1) };
}

/**
 * Qué paridad de rótulos sobrevive por debajo de `sm`, o `null` si se rotulan
 * todos.
 *
 * Manda el marcador de año. Con los marcadores repartidos en las dos paridades
 * no se esconde ninguno; sin ninguno, se ancla al último mes, que es el borde
 * por el que se mira una serie.
 */
function phoneLabelParity(marks: boolean[]): number | null {
  if (marks.length < CROWDED_FROM) {
    return null;
  }

  let parity: number | null = null;
  for (const [index, marked] of marks.entries()) {
    if (!marked) {
      continue;
    }
    if (parity === null) {
      parity = index % 2;
      continue;
    }
    if (parity !== index % 2) {
      return null;
    }
  }

  return parity ?? (marks.length - 1) % 2;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={VOLUME_TITLE_ID}
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      data-testid="pimia-customer-volume"
    >
      {children}
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h2
        className="text-sm font-semibold text-foreground"
        id={VOLUME_TITLE_ID}
      >
        Volumen mensual
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 rounded-full ${className}`}
    />
  );
}

/** Una serie en la leyenda: su color, su nombre y su suma en ESTRICTO. */
function LegendItem({
  className,
  label,
  totalCents,
}: {
  className: string;
  label: string;
  totalCents: number | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Swatch className={className} />
      {label}
      <PimiaAmount
        cents={totalCents}
        className="font-medium text-foreground"
        dimZero={false}
      />
    </span>
  );
}

/**
 * La media columna de una serie: su barra, o el trazo de su hueco.
 *
 * Ocupa su mitad **siempre** (regla 4): el `flex-1` está aquí, en el hueco
 * fijo, y no en la barra, para que quitar la barra no le regale el ancho a la
 * vecina.
 */
function Slot({ className, pct }: { className: string; pct: number | null }) {
  return (
    <span className="flex h-full min-w-0 flex-1 items-end">
      {pct === null ? (
        <span className="block h-1.5 w-full rounded-sm border border-dashed border-border" />
      ) : (
        <span
          className={cn("block w-full rounded-t", className)}
          style={{ height: `${pct}%` }}
        />
      )}
    </span>
  );
}

export function PimiaCustomerVolume({ stats }: { stats: PimiaCustomerStats }) {
  const { months } = stats;

  const subtitle =
    months.length === 1
      ? "El mes que el servidor devuelve para este cliente"
      : `Los ${months.length} meses que el servidor devuelve para este cliente`;

  if (months.length === 0) {
    return (
      <Panel>
        <Title>Serie mensual del servidor</Title>
        <p className="mt-4 text-sm text-muted-foreground">
          No llegó ningún mes legible, así que no se dibuja la gráfica. Unos
          ejes a cero dirían que este cliente no facturó nada, y eso no es lo
          que sabemos.
        </p>
      </Panel>
    );
  }

  const invoiced = months.map((month) => month.invoicedCents);
  const received = months.map((month) => month.receivedCents);

  /* Una clave estable por columna.
   *
   * El eje **puede repetir etiqueta**: el contrato no promete que `months[i]`
   * sea un `YYYY-MM`, y dos meses con el mismo rótulo colapsarían dos columnas
   * en una. Se desempata contando repeticiones —no con el índice del `map`, que
   * cambia la clave de todas las columnas en cuanto el servidor devuelve un mes
   * más y tira el estado de las que no se movieron. */
  const seen = new Map<string, number>();
  const cells = months.map((month) => {
    const times = seen.get(month.ym) ?? 0;
    seen.set(month.ym, times + 1);
    const label = monthLabel(month.ym);
    return {
      ...month,
      key: times === 0 ? month.ym : `${month.ym}#${times}`,
      label,
      ...splitLabel(label),
    };
  });

  const parity = phoneLabelParity(cells.map((cell) => cell.tail !== null));
  const columns = cells.map((cell, index) => ({
    ...cell,
    labelOnPhone: parity === null || index % 2 === parity,
  }));

  /* La escala la fijan **las dos series juntas**: dos gráficas con dos máximos
   * distintos, una al lado de otra y sin eje que las delate, se comparan solas
   * y mal. */
  const max = seriesMax([...invoiced, ...received]);

  /* Los huecos se cuentan por importe, no por mes: media columna sin barra ya
   * es un dato que no se pudo leer, y desde que cada serie tiene su mitad fija
   * también se ve. Una serie que no casó con el eje no entra en la cuenta —sus
   * importes están todos a hueco por la misma razón, y esa razón la explica la
   * línea de al lado en vez de repetirse doce veces. */
  const gapCells =
    (stats.invoicedAligned ? invoiced.filter((c) => c === null).length : 0) +
    (stats.receivedAligned ? received.filter((c) => c === null).length : 0);

  /* Por qué hay huecos, cuando el motivo es que una serie no casaba con el eje.
   * Se dice en la tarjeta porque sin ello un mes sin barra se lee como un mes
   * sin negocio, y este hueco no lo arregla el tenant: lo arregla la API. */
  const misaligned =
    !stats.invoicedAligned && !stats.receivedAligned
      ? "Las dos series llegaron con otra longitud que el eje de meses, así que entran enteras como huecos: cruzarlas a medias correría el año."
      : !stats.invoicedAligned
        ? "La serie de facturación llegó con otra longitud que el eje de meses, así que entra entera como huecos: cruzarla a medias correría el año."
        : !stats.receivedAligned
          ? "La serie de cobros llegó con otra longitud que el eje de meses, así que entra entera como huecos: cruzarla a medias correría el año."
          : null;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <Title>{subtitle}</Title>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegendItem
            className="bg-primary"
            label="Facturado"
            totalCents={sumStrict(invoiced)}
          />
          <LegendItem
            className="bg-primary/40"
            label="Cobrado"
            totalCents={sumStrict(received)}
          />
        </div>
      </div>

      {max === null ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Llegaron los meses, pero ninguno con cifras legibles por encima de
          cero: la gráfica se queda sin dibujar en vez de enseñar columnas
          planas.
        </p>
      ) : (
        <>
          {/* La escala, escrita. Es la diferencia entre una gráfica que dice
              «cuándo» y una que además dice «cuánto», y no se la puede quitar
              el ancho de la tarjeta porque va en su propio renglón. */}
          <div className="mt-4 flex items-baseline justify-between gap-2 text-2xs text-muted-foreground">
            <span>Alto de la gráfica</span>
            <PimiaAmount
              cents={max}
              className="font-medium text-foreground"
              dimZero={false}
            />
          </div>

          <div aria-hidden="true">
            <div className="relative mt-1 h-44 border-b border-border">
              {/* El tope, dibujado donde llega la columna mayor. */}
              <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-border" />
              {GRID_PCT.map((pct) => (
                <span
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60"
                  key={pct}
                  style={{ bottom: `${pct}%` }}
                />
              ))}

              <div className={cn("relative flex h-full items-end", COLUMN_GAP)}>
                {columns.map((month) => (
                  <div
                    className="flex h-full min-w-0 flex-1 items-end gap-px"
                    key={month.key}
                    title={`${month.label}: facturado ${money(
                      month.invoicedCents,
                    )} · cobrado ${money(month.receivedCents)}`}
                  >
                    <Slot
                      className="bg-primary"
                      pct={barHeightPct(month.invoicedCents, max)}
                    />
                    <Slot
                      className="bg-primary/40"
                      pct={barHeightPct(month.receivedCents, max)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Los rótulos van en su propia fila, con el mismo canal: dentro de
                la columna, esconder uno en el móvil le habría dado su alto a
                las barras y habría descuadrado los suelos. El `overflow-hidden`
                es sólo de la fila: deja que un rótulo del móvil se salga sobre
                el hueco del vecino escondido, y corta en el borde de la tarjeta
                en vez de ensancharla. */}
            <div className={cn("mt-1.5 flex overflow-hidden", COLUMN_GAP)}>
              {columns.map((month) => (
                <span
                  className="min-w-0 flex-1 text-center text-2xs tabular-nums text-muted-foreground"
                  key={month.key}
                >
                  {/* Se esconde el texto, nunca la celda: sin celda, el `flex`
                      reparte la fila entre los que quedan y cada rótulo cae
                      sobre la columna de otro mes. */}
                  <span
                    className={month.labelOnPhone ? "block" : "hidden sm:block"}
                  >
                    <span className="block whitespace-nowrap sm:truncate">
                      {month.head}
                    </span>
                    {month.tail === null ? null : (
                      <span className="block whitespace-nowrap sm:truncate">
                        {month.tail}
                      </span>
                    )}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* El sustituto del tooltip: sin librería no hay caja flotante, así que
          los pares van en una tabla que sólo leen los lectores de pantalla. */}
      <table className="sr-only">
        <caption>Volumen mensual de este cliente</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Facturado</th>
            <th scope="col">Cobrado</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((month) => (
            <tr key={month.key}>
              <th scope="row">{month.ym}</th>
              <td>{money(month.invoicedCents)}</td>
              <td>{money(month.receivedCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Por qué hay huecos: sin esta línea, un mes sin barra se lee como un mes
          sin negocio. Los dos motivos se cuentan aparte porque se arreglan en
          sitios distintos. */}
      {misaligned === null ? null : (
        <p className="mt-3 text-xs text-muted-foreground">{misaligned}</p>
      )}
      {gapCells > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {gapCells === 1
            ? "Un importe llegó sin cifra legible"
            : `${gapCells} importes llegaron sin cifra legible`}{" "}
          y su media columna lleva un trazo discontinuo en vez de barra: un
          hueco no es un cero.
        </p>
      ) : null}
    </Panel>
  );
}
