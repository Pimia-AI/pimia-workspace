/**
 * El papel: la tarjeta-documento de la ficha de una factura — membrete,
 * «Facturar a», identificación, la tabla de conceptos y el pie de totales.
 *
 * ## De dónde sale la forma: el chasis NO está aquí
 *
 * 👤 **La tarjeta-papel la inventó el rediseño de esta factura (2026-08-18), y
 * el 2026-08-19 se MUDÓ a `PimiaDocumentParts.tsx`.** Banda, membrete, chip de
 * sección, las medidas de la tabla y la fila del pie los comparte con el papel
 * del presupuesto: los dos salen de la misma empresa y el cliente los recibe con
 * una semana de diferencia, así que **no pueden ser dos códigos**. Se mudaron,
 * no se copiaron: hubo unas horas con dos copias y ya divergían —la del
 * presupuesto imprimía un renglón de país y un «(sobre 1.000,00 €)» que esta no
 * imprimía—, que es exactamente el defecto que la mudanza cierra.
 *
 * Lo que queda en este fichero es lo que **solo dice una factura**: «Facturar
 * a», la identificación con su vencimiento y su serie, el pie con la forma de
 * pago y el CSV de la AEAT.
 *
 * ⛔ **Y no al revés: el presupuesto no importa de aquí.** Atar el papel de un
 * documento comercial al de uno fiscal por una decisión de borde es justo lo que
 * el tercer fichero existe para evitar.
 *
 * ## Por qué vive aparte de `PimiaInvoiceScreen.tsx`
 *
 * 👤 **Se partió el 2026-08-18, el mismo día del rediseño**: la ficha entera
 * pasó de 479 a 1045 líneas y `scripts/check-file-sizes.mjs` —tope duro de
 * 1000, sin excepciones— dejó `pnpm check` en rojo. Pero el corte no es
 * aritmético: son **dos cosas distintas que cambian por razones distintas**. Lo
 * de aquí es el documento, y su forma la manda lo que una factura tiene que
 * decir; lo de allí es la pantalla —cabecera, acciones, el raíl del cobro y el
 * bloque de VeriFactu—, y su forma la manda lo que hoy se puede hacer con ella.
 * Un renglón fiscal nuevo se toca aquí sin releer el raíl, y al revés.
 *
 * ⚠️ **Es una vista más, y ahora arrastra otra**: cuando esto se porte al
 * anfitrión web hay que añadir a la lista `VERBATIM` de
 * `scripts/portar-vistas.mjs` este fichero, `lib/invoices.ts` y también
 * `PimiaDocumentParts.tsx`, de donde sale desde hoy el chasis del papel. Un
 * fichero que no está en la lista no viaja y tampoco lo delata
 * `pnpm portar --check`, que compara **la lista** contra `.portado-de.json`: el
 * porte copiaría una pantalla que importa algo que no existe allí.
 *
 * ## Lo que NO se puede perder al releerlo
 *
 * Consisten todos en **no** pintar algo, y por eso un rediseño se los lleva por
 * delante sin enterarse: **ni un `?? 0` en un importe** (el dinero pasa por
 * `PimiaAmount`, que distingue «vale cero» de «no se pudo leer» — el caso que lo
 * motivó, en el docblock de `DocumentTotalRow`, en `PimiaDocumentParts.tsx`);
 * **el desglose de impuestos sale de `resolveDocumentTaxes`**, que agrega en
 * estricto para no escribir una suma menor que la real en la casilla que se
 * copia al 303; **las fechas van por
 * `pimiaDates`, jamás por `new Date(cadena)`**, que es medianoche UTC y al oeste
 * de Greenwich cae el día anterior; y **un borrador no tiene número y se dice**,
 * en vez de fingir uno.
 *
 * ## Qué NO se pinta, y por qué
 *
 * - **La cronología de «Actividad» no se porta**: la maqueta fecha «publicó»,
 *   «envió» y «el cliente abrió» con la fecha de emisión, porque el servidor no
 *   manda esas marcas —`sent` y `viewed` son banderas, no fechas— y no hay
 *   endpoint de actividad de facturas en el contrato. Fabricar un registro de
 *   auditoría en un ERP fiscal es de lo peor que se puede hacer.
 * - **Ni logo, ni IBAN, ni email de la empresa**: los tres están anotados donde
 *   tocan, cada uno con su razón.
 */

import { QrCode } from "lucide-react";

import type { PimiaInvoice } from "@/features/pimia/api/invoices";
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
import { cn } from "@/shared/lib/cn";

/* Los `id` que atan cada sección con su `<h2>`. Constantes de módulo y no
 * `useId()`: `aria-labelledby` los necesita **estables** entre renders. */
const DOCUMENT_TITLE_ID = "pimia-invoice-document-title";
const BILL_TO_TITLE_ID = "pimia-invoice-bill-to-title";

/**
 * 🕳️ **Reexportadas para `PimiaInvoiceScreen.tsx`, y solo por eso.** Las dos
 * viven ya en `PimiaDocumentParts.tsx`; la pantalla de la factura sigue
 * pidiéndoselas a este fichero, y cambiar sus imports es tocar su carril. En
 * cuanto lo haga —la del presupuesto ya las pide en su sitio— esta línea sobra y
 * se borra. No se redefine nada: es la misma constante y la misma función.
 */
export {
  DOCUMENT_PLACEMENT,
  joinParts,
} from "@/features/pimia/ui/PimiaDocumentParts";

/**
 * «Facturar a»: a quién se le factura y con qué identidad fiscal.
 *
 * Cada dato es independiente, así que el que falte **no deja hueco**. La razón
 * social es lo único que se pinta con raya —sin destinatario el documento no se
 * sostiene—; el NIF y la dirección se omiten enteros, que «NIF: —» en un papel
 * es peor que no ponerlo. Los dos (`customer.tax_id` y `customer.billing`) ya
 * venían en la respuesta y el normalizador los tiraba; la dirección llega por
 * relación opcional, y si no viene nadie sale a buscarla — sería un N+1 por un
 * renglón cosmético.
 */
function BillTo({ invoice }: { invoice: PimiaInvoice }) {
  const contact = [
    ...addressLines(invoice.customerBilling),
    invoice.customerEmail,
    invoice.customerPhone,
  ].filter((line): line is string => Boolean(line));

  return (
    <section
      aria-labelledby={BILL_TO_TITLE_ID}
      className="min-w-0 border-t border-border pt-5"
    >
      <DocumentSectionTitle id={BILL_TO_TITLE_ID}>
        Facturar a
      </DocumentSectionTitle>
      <div className="mt-5 text-xs leading-5">
        <p className="text-base font-semibold text-foreground">
          {invoice.customerName ?? (
            <span className="text-muted-foreground">—</span>
          )}
        </p>
        {invoice.customerTaxId ? (
          <p className="mt-2 text-muted-foreground">
            <span className="font-semibold text-foreground">NIF:</span>{" "}
            {invoice.customerTaxId}
          </p>
        ) : null}
        {contact.length > 0 ? (
          <div className="mt-2 space-y-0.5 break-words text-muted-foreground">
            {contact.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * La identificación del documento: qué documento es, cuál es, por cuánto y con
 * qué fechas. Número e importe van emparejados en la misma línea, y el total es
 * la cifra más grande del papel: quien abre una factura pregunta las dos cosas
 * a la vez.
 *
 * ⚠️ **El `<h2>` rotula el documento («Factura» / «Factura rectificativa»), no
 * lo identifica.** Hasta el 2026-08-18 repetía aquí el número de factura, que ya
 * es el `<h1>` de `PimiaPageHeader`: dos encabezados con **el mismo nombre
 * accesible** en la misma página, que para quien navega saltando de encabezado
 * son dos destinos indistinguibles y no dicen cuál es cuál. El número no se
 * pierde —sigue debajo, en mono y al mismo cuerpo de antes—, solo deja de ser
 * encabezado: como nombre del `<article>`, «Factura rectificativa» dice lo que
 * el papel **es**, que es justo lo que el `<h1>` no puede decir. Y de paso
 * recupera dentro del documento el rótulo que el rediseño había sacado a una
 * insignia de la cabecera —el sitio donde una factura de papel lo lleva—, así
 * que la insignia sobraba y se quitó.
 *
 * Emisión y vencimiento se pintan siempre, con raya si faltan: son obligatorias
 * en un documento fiscal. Serie y referencia son opcionales y su casilla vacía
 * sería ruido — y la serie **no se deduce** partiendo el número por el guion,
 * que es adivinar el formato de otro tenant.
 */
function DocumentIdentity({ invoice }: { invoice: PimiaInvoice }) {
  const series = invoice.series
    ? (invoice.series.name ?? invoice.series.code)
    : null;

  return (
    <section
      aria-label="Identificación del documento"
      className="min-w-0 border-t border-border pt-5"
    >
      {/* El `mt-5` compensa el alto del chip de al lado, para alinear las dos.
          Y el par envuelve —`flex-wrap`, y `break-words` en vez de `truncate`—
          porque el que cedía siempre era el número, que es la identidad del
          documento: salía «F-20…» por dejarle sitio a un importe que ya está
          repetido en la cabecera y en el raíl. Ahora baja el importe. */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2
            className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
            id={DOCUMENT_TITLE_ID}
          >
            {invoice.isCreditNote ? "Factura rectificativa" : "Factura"}
          </h2>
          <p className="mt-1 break-words text-lg font-semibold tracking-tight text-foreground">
            {invoice.invoiceNumber ? (
              <span className="font-mono">{invoice.invoiceNumber}</span>
            ) : (
              // Sin fingir identificadores: el número existe al publicar.
              "Borrador"
            )}
          </p>
          {invoice.invoiceNumber ? null : (
            <p className="mt-1 text-xs text-muted-foreground">
              Se numera al publicar.
            </p>
          )}
          {/* El número de la rectificada, no su id: lo manda el servidor. */}
          {invoice.rectifiedInvoiceNumber ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Rectifica{" "}
              <span className="font-mono">
                {invoice.rectifiedInvoiceNumber}
              </span>
            </p>
          ) : null}
        </div>
        <PimiaAmount
          cents={invoice.totalCents}
          className="shrink-0 text-2xl font-semibold tracking-tight text-foreground"
        />
      </div>

      <dl className="mt-8 grid grid-cols-1 gap-5 text-xs leading-5 sm:grid-cols-3">
        <DocumentDate label="Fecha de emisión" value={invoice.invoiceDate} />
        <DocumentDate label="Vencimiento" value={invoice.dueDate} />
        {series ? <DocumentField label="Serie">{series}</DocumentField> : null}
        {invoice.referenceNumber ? (
          <DocumentField label="Referencia">
            {invoice.referenceNumber}
          </DocumentField>
        ) : null}
      </dl>
    </section>
  );
}

/**
 * El papel: membrete, «Facturar a», identificación, conceptos, totales y pie.
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
 * total **en silencio**, en una factura. Con el carril, lo peor que puede pasar
 * es arrastrar; la banda de color sigue entera porque es hermana suya, no hija.
 * Que casi nunca haga falta es cosa de las otras dos medidas: el impuesto dejó
 * de ser columna (ver `TaxLines`) y el bloque de arriba no se parte hasta `xl`.
 */
export function InvoiceDocument({ invoice }: { invoice: PimiaInvoice }) {
  const lines = invoice.lines ?? [];
  const hasLines = invoice.lines !== null && lines.length > 0;

  /* Las filas del pie, en orden. Los impuestos llegan honestos por las DOS
   * ramas de `resolveDocumentTaxes` —la cabecera intacta, y el caso
   * `tax_per_item` sumado con `sumStrict`—, así que un IVA ilegible vale `null`
   * y su fila pinta la raya en vez de un cero que nadie discutiría. El campo
   * `tax` solo entra sin desglose: es el NETO de IVA menos retención y esconde
   * las dos. Ninguna fila se pinta «por simetría». */
  const documentTaxes = resolveDocumentTaxes(invoice.taxes, invoice.lines);
  /* Cada fila lleva `id` propio, que es su clave: dos tipos del catálogo del
   * tenant que `taxLabel` escriba igual —dos «IVA 21%», que `resolveDocumentTaxes`
   * no agrupa en la rama de cabecera— son dos filas con el mismo rótulo, y con
   * él de clave React las cruza al recargar la ficha. */
  const totals: { cents: number | null; id: string; label: string }[] = [];
  const pushTotal = (id: string, label: string, cents: number | null) => {
    totals.push({ cents, id, label });
  };
  if (invoice.subTotalCents !== null) {
    pushTotal("base", "Base imponible", invoice.subTotalCents);
  }
  if (invoice.discountCents) {
    pushTotal("descuento", "Descuento", -invoice.discountCents);
  }
  if (documentTaxes.length > 0) {
    for (const tax of documentTaxes) {
      pushTotal(tax.id, taxLabel(tax), tax.amountCents);
    }
  } else if (invoice.taxCents !== null) {
    pushTotal("impuestos", "Impuestos", invoice.taxCents);
  }

  return (
    <article
      aria-labelledby={DOCUMENT_TITLE_ID}
      className={cn(DOCUMENT_CARD, DOCUMENT_PLACEMENT)}
      data-testid="pimia-invoice-document"
    >
      <div
        aria-hidden="true"
        className="-mx-4 -mt-5 h-1.5 bg-primary sm:-mx-6 xl:-mx-8 xl:-mt-8"
      />

      <CompanyLetterhead testId="pimia-invoice-letterhead" />

      <div className="mt-6 grid grid-cols-1 gap-7 xl:grid-cols-2">
        <BillTo invoice={invoice} />
        <DocumentIdentity invoice={invoice} />
      </div>

      {/* ⚠️ El carril propio de la tabla: el `overflow-hidden` de la
          tarjeta —que la banda de color necesita— recortaba aquí dentro sin
          barra ni aviso. Es `auto`, así que no sale ninguna mientras quepa. */}
      <div className="mt-10 overflow-x-auto">
        <table
          aria-label="Conceptos facturados"
          className="w-full text-left text-sm"
          data-testid="pimia-invoice-lines"
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
                  La factura no tiene conceptos, o el servidor no los devolvió
                  con la ficha.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {totals.map((row) => (
              <DocumentTotalRow
                amountCents={row.cents}
                key={row.id}
                label={row.label}
              />
            ))}
            <DocumentTotalRow
              amountCents={invoice.totalCents}
              divider
              emphasis
              label="Total"
            />
          </tfoot>
        </table>
      </div>

      {invoice.notes ? (
        <p className="mt-10 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
          {invoice.notes}
        </p>
      ) : null}

      {/* Relación opcional: sin ella la línea se omite entera, que «Forma de
          pago: —» no dice nada. Y nunca un IBAN: no viaja en esta respuesta. */}
      {invoice.paymentMethodName ? (
        <p
          className={cn(
            "text-xs leading-5 text-muted-foreground",
            invoice.notes ? "mt-2" : "mt-10",
          )}
        >
          Forma de pago: {invoice.paymentMethodName}.
        </p>
      ) : null}

      {/* El pie solo existe con CSV, que es la prueba de que el registro está
          hecho: sin ella, cualquier frase sobre VeriFactu afirmaría cómo está
          configurado el tenant, y eso esta pantalla no lo sabe. */}
      {invoice.aeatCsv ? (
        <p className="mt-6 flex items-start gap-2 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
          <QrCode aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            Factura verificable en la sede electrónica de la AEAT ·{" "}
            <span className="break-all font-mono">{invoice.aeatCsv}</span>
          </span>
        </p>
      ) : null}
    </article>
  );
}
