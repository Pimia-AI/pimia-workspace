/**
 * El papel: la tarjeta-documento de la ficha de un presupuesto — membrete,
 * «Presupuesto para», identificación, la tabla de conceptos, el pie de totales
 * y la cláusula de validez.
 *
 * ## Por qué vive aparte de `PimiaEstimateScreen.tsx`
 *
 * Por la misma razón por la que la factura se partió el 2026-08-18: son **dos
 * cosas que cambian por razones distintas**. Lo de aquí es el documento, y su
 * forma la manda lo que un presupuesto tiene que decirle al que lo recibe; lo de
 * allí es la pantalla —cabecera, acciones y el raíl del ciclo comercial—, y su
 * forma la manda lo que hoy se puede hacer con él. Una cláusula nueva se toca
 * aquí sin releer el raíl, y al revés. Y de paso `scripts/check-file-sizes.mjs`
 * —tope duro de 1000 líneas, sin excepciones— no llega a ponerse en rojo.
 *
 * ⚠️ **Al portar son TRES ficheros para la lista `VERBATIM` de
 * `scripts/portar-vistas.mjs`**: este, `PimiaEstimateScreen.tsx` y
 * `PimiaDocumentParts.tsx`, de donde sale el vocabulario del papel. Una pantalla
 * sin su documento no compila, y un documento sin sus piezas tampoco; y
 * `pnpm portar --check` **no lo delataría**, porque compara la lista contra
 * `.portado-de.json` y un fichero que no está en la lista simplemente no viaja.
 *
 * ## En qué se parece al papel de la factura, y en qué NO
 *
 * Comparten el chasis entero, y a propósito: los dos salen de la misma empresa
 * y el cliente los recibe con una semana de diferencia. Todo eso vive en
 * `PimiaDocumentParts.tsx` y aquí se importa, no se copia.
 *
 * Lo propio de un presupuesto son cuatro cosas, y las cuatro están abajo:
 *
 * 1. **La validez.** La casilla «Caducidad» donde la factura pone
 *    «Vencimiento», y una cláusula al pie que la dice con todas las letras.
 *    Es lo único que convierte esto en una oferta y no en una lista de precios.
 * 2. **El destinatario puede no ser un cliente.** Un presupuesto se le manda a
 *    quien todavía no es cliente: `customer_id` llega `null` y `lead_id`
 *    relleno. Ver `EstimateRecipient`.
 * 3. **No tiene valor de factura, y se dice.** Donde la factura lleva el CSV de
 *    la AEAT, aquí va esa frase: quien recibe un papel con membrete, NIF y IVA
 *    desglosado tiene que poder distinguirlo de una factura sin preguntar.
 * 4. **No hay pie fiscal.** Ni QR, ni CSV, ni VeriFactu, ni forma de pago: nada
 *    de eso existe todavía cuando esto se emite.
 *
 * ## Lo que NO se puede perder al releerlo
 *
 * Consisten todos en **no** pintar algo, y por eso un rediseño se los lleva por
 * delante sin enterarse: **ni un `?? 0` en un importe** (el dinero pasa por
 * `PimiaAmount`, que distingue «vale cero» de «no se pudo leer»); **el desglose
 * de impuestos sale de `resolveDocumentTaxes`**, que agrega en estricto; **las
 * fechas van por `pimiaDates`, jamás por `new Date(cadena)`**, que es medianoche
 * UTC y al oeste de Greenwich cae el día anterior; y **esta pantalla no
 * recalcula nada**, suma incluida.
 *
 * ## Qué NO se pinta, y por qué
 *
 * - **La serie.** La maqueta la saca partiendo el número por el guion
 *   (`p.numero.split("-")`). No existe `invoice_series` en `EstimateResource`, y
 *   adivinar el formato de numeración de otro tenant es inventarse un dato
 *   fiscal. La factura ya tomó esta misma decisión.
 * - **El descuento por línea en el subtítulo** («· dto. 10 %»):
 *   `EstimateItemResource` publica `discount_val` y el normalizador lo lee, pero
 *   nadie ha comprobado contra un tenant que vuelva relleno. Cuando se
 *   compruebe, entra al lado de los impuestos de línea.
 * - **La cronología de «Actividad»**: `EstimateResource` **no publica ni un
 *   instante de transición** (no hay `sent_at`, `viewed_at`, `accepted_at` ni
 *   `rejected_at` entre 3346 y 3384) y no hay endpoint de actividades. La
 *   maqueta las deriva del estado actual, o sea que se las inventa.
 * - **Ni logo, ni IBAN, ni email de la empresa**: los tres están anotados en
 *   `CompanyLetterhead` y en `api/company.ts`, cada uno con su razón.
 */

import type { PimiaEstimate } from "@/features/pimia/api/estimates";
import { formatCents } from "@/features/pimia/lib/money";
import { resolveDocumentTaxes, taxLabel } from "@/features/pimia/lib/taxes";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import {
  CompanyLetterhead,
  DOCUMENT_CARD,
  DOCUMENT_PLACEMENT,
  DocumentDate,
  DocumentField,
  DocumentSectionTitle,
  DocumentTotalRow,
  NUM_CELL,
  NUM_HEAD,
  ONLY_SM,
  QTY_CELL,
  TaxLines,
  addressLines,
  formatQuantity,
} from "@/features/pimia/ui/PimiaDocumentParts";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";

/* Los `id` que atan cada sección con su `<h2>`. Constantes de módulo y no
 * `useId()`: `aria-labelledby` los necesita **estables** entre renders. */
const DOCUMENT_TITLE_ID = "pimia-estimate-document-title";
const RECIPIENT_TITLE_ID = "pimia-estimate-recipient-title";

/**
 * ¿Va dirigido a una oportunidad del CRM en vez de a un cliente?
 *
 * Se decide por los **dos** campos y no por uno: `lead_id` relleno dice a quién
 * va, y `customer_id` vacío dice que no va a un cliente. Con solo el primero, un
 * presupuesto que arrastrara los dos —que el contrato no promete que no
 * ocurra— se pintaría como del CRM escondiendo al cliente que sí tiene.
 *
 * ⚠️ Depende de que `customerId` sea `null` de verdad. Hasta hoy valía la cadena
 * `"null"` (`String(null)`, *truthy*) y esta función habría dicho «no» de todos
 * los presupuestos del CRM; el arreglo está en `normalizeEstimate`.
 */
export function estimateGoesToLead(estimate: PimiaEstimate): boolean {
  return estimate.customerId === null && estimate.leadId !== null;
}

/**
 * La insignia de que el destinatario es una oportunidad del CRM y no un cliente.
 *
 * ⛔ **Va en la cabecera de la pantalla y NO dentro del papel**, aunque la
 * maqueta la ponga junto al nombre del destinatario. «LEAD» es una etiqueta
 * **interna**: dice en qué punto del embudo está quien recibe esto, y el papel
 * es justo lo que esa persona abre en su correo. Estamparle encima que todavía
 * no es cliente no es un dato del documento, es una nota de la casa que se
 * escapó al documento. En la cabecera —que no viaja— dice lo mismo a quien tiene
 * que saberlo. Y de paso sale UNA sola vez en la página: dos insignias con el
 * mismo texto se leen como dos hechos distintos.
 *
 * ⚠️ **El texto va en mayúsculas EN EL DOM y no puesto por CSS**, y no es
 * capricho: la regla de estas dos pantallas es que ninguna frase contenga el
 * rótulo de una insignia, y «Lead» escrito así chocaría con cualquier frase que
 * hablara de un lead. En mayúsculas la colisión no existe —`getByText` distingue
 * mayúsculas de minúsculas— y además se lee como lo que es: una marca, no una
 * palabra de la frase.
 */
export function PimiaLeadChip() {
  return (
    <Badge className="shrink-0" variant="outline">
      LEAD
    </Badge>
  );
}

/**
 * ¿A quién va dirigido esto? Es la pregunta que un presupuesto contesta distinto
 * de una factura.
 *
 * Tres ramas y ninguna inventada:
 *
 * - **Cliente**: nombre, NIF, dirección de facturación, correo y teléfono. Los
 *   dos primeros venían ya en la respuesta y el normalizador los tiraba.
 * - **Oportunidad del CRM**: el nombre de la persona o de la organización, el
 *   título de la oportunidad y el correo. Y si la relación `lead` no vino, se
 *   dice que va a una oportunidad **sin fingir cuál**: el `lead_id` a secas es
 *   un número, no un destinatario.
 * - **Ninguno de los dos**: un borrador sin destinatario asignado, que es un
 *   estado real y no un error de lectura.
 *
 * Cada dato es independiente, así que el que falte **no deja hueco**. El nombre
 * es lo único que se pinta con raya —sin destinatario el documento no se
 * sostiene—; el NIF y la dirección se omiten enteros, que «NIF: —» en un papel
 * es peor que no ponerlo.
 *
 * ⛔ **Y lo que le falta al destinatario no se comenta aquí.** Que una
 * oportunidad no tenga correo en el CRM es una cosa que hacer —sin dirección,
 * `sendEstimate` no tiene a quién mandarlo— pero es una nota **de la casa sobre
 * su propia ficha**, y esto es el papel que esa persona abre. Un documento que
 * dice de su destinatario «Sin correo en el CRM» está enseñándole el estado de
 * la base de datos de quien se lo manda. El aviso vive en el raíl, que no viaja.
 */
function EstimateRecipient({ estimate }: { estimate: PimiaEstimate }) {
  const lead = estimate.lead;
  const isLead = estimateGoesToLead(estimate);

  const customerContact = [
    ...addressLines(estimate.customerBilling),
    estimate.customerEmail,
    estimate.customerPhone,
  ].filter((line): line is string => Boolean(line));

  /* Una oportunidad se nombra por la persona; la organización es el respaldo, y
   * si viene además de la persona baja de renglón. Sin ninguna de las dos queda
   * el título de la oportunidad, que al menos dice de qué trato se habla. */
  const leadName = lead
    ? (lead.personName ?? lead.organizationName ?? lead.title)
    : null;
  const leadSecond =
    lead?.personName && lead.organizationName ? lead.organizationName : null;

  return (
    <section
      aria-labelledby={RECIPIENT_TITLE_ID}
      className="min-w-0 border-t border-border pt-5"
    >
      <DocumentSectionTitle id={RECIPIENT_TITLE_ID}>
        Presupuesto para
      </DocumentSectionTitle>

      <div className="mt-5 text-xs leading-5">
        {isLead ? (
          <>
            <p className="break-words text-base font-semibold text-foreground">
              {leadName ?? (
                <span className="text-muted-foreground">
                  Oportunidad sin nombre
                </span>
              )}
            </p>
            {leadSecond ? (
              <p className="mt-1 text-muted-foreground">{leadSecond}</p>
            ) : null}
            {/* El título solo cuando no se ha usado ya como nombre. */}
            {lead?.title && lead.title !== leadName ? (
              <p className="mt-2 break-words text-muted-foreground">
                {lead.title}
              </p>
            ) : null}
            {lead === null ? (
              <p className="mt-2 text-muted-foreground">
                El servidor no devolvió sus datos con el presupuesto.
              </p>
            ) : lead.email ? (
              <p className="mt-2 break-words text-muted-foreground">
                {lead.email}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="break-words text-base font-semibold text-foreground">
              {estimate.customerName ?? (
                <span className="text-muted-foreground">
                  Sin destinatario asignado
                </span>
              )}
            </p>
            {estimate.customerTaxId ? (
              <p className="mt-2 text-muted-foreground">
                <span className="font-semibold text-foreground">NIF:</span>{" "}
                {estimate.customerTaxId}
              </p>
            ) : null}
            {customerContact.length > 0 ? (
              <div className="mt-2 space-y-0.5 break-words text-muted-foreground">
                {customerContact.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * La identificación del documento: qué es, cuál es, por cuánto y con qué fechas.
 *
 * ⚠️ **El `<h2>` rotula el documento («Presupuesto»), no lo identifica.** El
 * número ya es el `<h1>` de `PimiaPageHeader`, y repetirlo aquí como encabezado
 * daría dos con **el mismo nombre accesible** en la misma página —para quien
 * navega saltando de encabezado, dos destinos indistinguibles—. El número no se
 * pierde: sigue debajo, en mono. Es la misma decisión que tomó la factura, y
 * aquí además dice lo que el `<h1>` no puede decir: que esto **es** un
 * presupuesto y no una factura.
 *
 * Emisión y caducidad se pintan siempre, con raya si faltan: son las dos fechas
 * de las que depende una oferta. La referencia es opcional y su casilla vacía
 * sería ruido.
 */
function EstimateIdentity({ estimate }: { estimate: PimiaEstimate }) {
  return (
    <section
      aria-label="Identificación del documento"
      className="min-w-0 border-t border-border pt-5"
    >
      {/* El `mt-5` compensa el alto del chip de al lado, para alinear las dos.
          Y el par envuelve —`flex-wrap`, y `break-words` en vez de `truncate`—
          porque el que cedía siempre era el número, que es la identidad del
          documento. Ahora baja el importe. */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2
            className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
            id={DOCUMENT_TITLE_ID}
          >
            Presupuesto
          </h2>
          <p className="mt-1 break-words text-lg font-semibold tracking-tight text-foreground">
            <span className="font-mono">{estimate.estimateNumber}</span>
          </p>
        </div>
        <PimiaAmount
          cents={estimate.totalCents}
          className="shrink-0 text-2xl font-semibold tracking-tight text-foreground"
        />
      </div>

      <dl className="mt-8 grid grid-cols-1 gap-5 text-xs leading-5 sm:grid-cols-3">
        <DocumentDate label="Fecha de emisión" value={estimate.estimateDate} />
        <DocumentDate label="Caducidad" value={estimate.expiryDate} />
        {estimate.referenceNumber ? (
          <DocumentField label="Referencia">
            {estimate.referenceNumber}
          </DocumentField>
        ) : null}
      </dl>
    </section>
  );
}

/** Una fila del pie de totales, ya resuelta. */
type EstimateTotalRow = {
  cents: number | null;
  /** El «(sobre 1.234,00 €)» ya formateado, o `null`. */
  hint: string | null;
  id: string;
  label: string;
};

/**
 * El desglose del pie del papel, en orden.
 *
 * Vive en una función y no dentro del JSX porque las condiciones de cada fila
 * son la parte que hay que poder leer de un vistazo: **ninguna se pinta «por
 * simetría»**.
 *
 * Los impuestos llegan honestos por las DOS ramas de `resolveDocumentTaxes` —la
 * cabecera intacta, y el caso `tax_per_item` sumado con `sumStrict`—, así que un
 * IVA ilegible vale `null` y su fila pinta la raya en vez de un cero que nadie
 * discutiría. El campo `tax` solo entra **sin** desglose: es el NETO de IVA
 * menos retención y esconde las dos. **Ninguna fila se pinta «por simetría»**:
 * la base cuelga de que `subTotalCents` se haya podido leer y el descuento de
 * que exista y no sea cero.
 *
 * ⚠️ **La base por tipo solo se escribe cuando el documento trae los impuestos
 * en la CABECERA**, que es la condición exacta de la primera rama de
 * `resolveDocumentTaxes`. En la otra rama el modelo se construye con un spread
 * del primer impuesto que aparece en las líneas, así que su `baseAmountCents`
 * sería el de UN renglón puesto junto a la cuota de TODOS — plausible y falso.
 * Ver el docblock de `PimiaEstimateTax.baseAmountCents`.
 */
function resolveEstimateTotals(estimate: PimiaEstimate): EstimateTotalRow[] {
  const documentTaxes = resolveDocumentTaxes(estimate.taxes, estimate.lines);
  const fromHeader = (estimate.taxes?.length ?? 0) > 0;
  /* La base de un tipo solo aclara algo cuando hay varios: con uno solo, la
   * base del tipo es la base imponible que está dos renglones más arriba, y
   * repetirla invita a buscar la diferencia entre dos cifras iguales. */
  const showsBase = fromHeader && documentTaxes.length > 1;

  const rows: EstimateTotalRow[] = [];
  const push = (
    id: string,
    label: string,
    cents: number | null,
    hint: string | null = null,
  ) => {
    rows.push({ cents, hint, id, label });
  };

  if (estimate.subTotalCents !== null) {
    push("base", "Base imponible", estimate.subTotalCents);
  }
  if (estimate.discountCents) {
    push("descuento", "Descuento", -estimate.discountCents);
  }
  if (documentTaxes.length > 0) {
    for (const tax of documentTaxes) {
      /* Cada fila lleva `id` propio, que es su clave: dos tipos del catálogo
       * del tenant que `taxLabel` escriba igual —dos «IVA 21%», que
       * `resolveDocumentTaxes` no agrupa en la rama de cabecera— son dos filas
       * con el mismo rótulo, y con él de clave React las cruza al recargar. */
      push(
        tax.id,
        taxLabel(tax),
        tax.amountCents,
        showsBase && tax.baseAmountCents !== null
          ? `(sobre ${formatCents(tax.baseAmountCents)})`
          : null,
      );
    }
  } else if (estimate.taxCents !== null) {
    push("impuestos", "Impuestos", estimate.taxCents);
  }

  return rows;
}

/**
 * El papel: membrete, «Presupuesto para», identificación, conceptos, totales y
 * la cláusula de validez.
 *
 * La banda de color llega a los bordes con márgenes negativos que **espejan el
 * padding del contenedor en cada salto** —ojo, que el vertical solo cambia en
 * `xl`—, y por eso el `overflow-hidden` va en la tarjeta: sin recortar, la banda
 * sale en cuadrado por encima de las esquinas. La tabla es cruda y no el `Table`
 * de shadcn: no es una lista de datos con la que se interactúa, es el cuerpo de
 * un documento. El `w-full` de la primera columna con el `max-w-0` de su celda
 * hace que el concepto absorba el ancho sobrante y trunque en vez de desbordar.
 *
 * ⚠️ **Ese `overflow-hidden` recortaba también la tabla, y por eso va dentro de
 * su propio `overflow-x-auto`.** Entre 1024 y 1205 px de ventana la tarjeta mide
 * 424 px y la tabla pedía más: el papel se comía la columna del importe y el
 * total **en silencio**. Con el carril, lo peor que puede pasar es arrastrar; la
 * banda de color sigue entera porque es hermana suya, no hija.
 */
export function EstimateDocument({ estimate }: { estimate: PimiaEstimate }) {
  const lines = estimate.lines ?? [];
  const hasLines = estimate.lines !== null && lines.length > 0;
  const totals = resolveEstimateTotals(estimate);

  return (
    <article
      aria-labelledby={DOCUMENT_TITLE_ID}
      className={cn(DOCUMENT_CARD, DOCUMENT_PLACEMENT)}
      data-testid="pimia-estimate-document"
    >
      <div
        aria-hidden="true"
        className="-mx-4 -mt-5 h-1.5 bg-primary sm:-mx-6 xl:-mx-8 xl:-mt-8"
      />

      <CompanyLetterhead testId="pimia-estimate-letterhead" />

      <div className="mt-6 grid grid-cols-1 gap-7 xl:grid-cols-2">
        <EstimateRecipient estimate={estimate} />
        <EstimateIdentity estimate={estimate} />
      </div>

      {/* ⚠️ El carril propio de la tabla: el `overflow-hidden` de la tarjeta
          —que la banda de color necesita— recortaba aquí dentro sin barra ni
          aviso. Es `auto`, así que no sale ninguna mientras quepa. */}
      <div className="mt-10 overflow-x-auto">
        <table
          aria-label="Conceptos presupuestados"
          className="w-full text-left text-sm"
          data-testid="pimia-estimate-lines"
        >
          <thead className="border-b border-border text-foreground">
            <tr>
              <th className="w-full px-0 py-3 font-semibold" scope="col">
                Concepto
              </th>
              {["Cantidad", "Precio"].map((head) => (
                <th className={cn(NUM_HEAD, ONLY_SM)} key={head} scope="col">
                  {head}
                </th>
              ))}
              <th className={NUM_HEAD} scope="col">
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            {hasLines ? (
              lines.map((line) => (
                <tr className="border-b border-border/60" key={line.id}>
                  <td className="max-w-0 px-0 py-4 align-top">
                    <span className="block truncate font-medium text-foreground">
                      {line.name}
                    </span>
                    {line.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {line.description}
                      </span>
                    ) : null}
                    <TaxLines taxes={line.taxes} />
                  </td>
                  <td className={QTY_CELL}>{formatQuantity(line)}</td>
                  <td className={cn(NUM_CELL, ONLY_SM)}>
                    {/* `dimZero={false}`: en una línea el cero es dato de
                        negocio (un concepto regalado), no ruido que apagar. */}
                    <PimiaAmount
                      cents={line.priceCents}
                      className="whitespace-nowrap text-muted-foreground"
                      dimZero={false}
                    />
                  </td>
                  <td className={NUM_CELL}>
                    <PimiaAmount
                      cents={line.totalCents}
                      className="whitespace-nowrap font-medium text-foreground"
                      dimZero={false}
                    />
                  </td>
                </tr>
              ))
            ) : (
              // Las dos causas, sin afirmar ninguna: `lines === null` es «no se
              // pidieron» y la lista vacía «no tiene», y aquí no se distinguen.
              // Sin `colSpan`: el aviso se queda en la columna del concepto —la
              // que absorbe el sobrante— y así ni él ni el pie inventan columnas
              // que bajo `sm` no existen y descuadran la vertical del dinero.
              <tr className="border-b border-border/60">
                <td className="max-w-0 px-0 py-6 text-muted-foreground">
                  El presupuesto no tiene conceptos, o el servidor no los
                  devolvió con la ficha.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {totals.map((row) => (
              <DocumentTotalRow
                amountCents={row.cents}
                hint={row.hint}
                key={row.id}
                label={row.label}
              />
            ))}
            <DocumentTotalRow
              amountCents={estimate.totalCents}
              divider
              emphasis
              label="Total"
            />
          </tfoot>
        </table>
      </div>

      {estimate.notes ? (
        /* `notes` es el único campo del recurso con tipo de unión rara
         * (`unknown[] | string`, 3355). `text()` devuelve `null` si llega un
         * array, así que aquí no puede colarse un «[object Object]». */
        <p className="mt-10 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {estimate.notes}
        </p>
      ) : null}

      {/* La cláusula de validez va SIEMPRE, con caducidad o sin ella: es lo que
          convierte esto en una oferta con plazo, y callarla cuando no hay fecha
          dejaría al que lo recibe suponiendo que el precio aguanta para
          siempre. La fecha se escribe corta y por `pimiaDates`, igual que en la
          casilla de arriba: dos formatos distintos para la misma fecha en el
          mismo papel es el defecto que esta ficha ya tuvo una vez. */}
      <p
        className={cn(
          "text-xs leading-5 text-muted-foreground",
          estimate.notes ? "mt-2" : "mt-10",
        )}
      >
        {estimate.expiryDate
          ? `Presupuesto válido hasta el ${formatIsoDateShort(estimate.expiryDate)}.`
          : "Presupuesto sin fecha de caducidad fijada."}
      </p>

      <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        {/* Relación opcional: sin nombre la línea se omite entera. */}
        {estimate.creatorName ? (
          <p className="min-w-0 break-words">
            Preparado por{" "}
            <span className="font-medium text-foreground">
              {estimate.creatorName}
            </span>
          </p>
        ) : (
          <span />
        )}
        {/* Donde la factura lleva el CSV de la AEAT. Sin esta frase, un papel
            con membrete, NIF e IVA desglosado se parece demasiado a una
            factura, y quien la recibe no tiene por qué saber distinguirlas. */}
        <p className="sm:text-right">
          Documento comercial: no tiene valor de factura.
        </p>
      </div>
    </article>
  );
}
