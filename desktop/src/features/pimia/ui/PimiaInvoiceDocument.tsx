/**
 * El papel: la tarjeta-documento de la ficha de una factura — membrete,
 * «Facturar a», identificación, la tabla de conceptos y el pie de totales.
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
 * ⚠️ **Es una vista más**: cuando esto se porte al anfitrión web hay que
 * añadirla a la lista `VERBATIM` de `scripts/portar-vistas.mjs`, igual que
 * `lib/invoices.ts`. Un fichero que no está en la lista no viaja y tampoco lo
 * delata `pnpm portar --check`, que compara **la lista** contra
 * `.portado-de.json`: el porte copiaría una pantalla que importa algo que no
 * existe allí.
 *
 * ## Lo que NO se puede perder al releerlo
 *
 * Consisten todos en **no** pintar algo, y por eso un rediseño se los lleva por
 * delante sin enterarse: **ni un `?? 0` en un importe** (el dinero pasa por
 * `PimiaAmount`, que distingue «vale cero» de «no se pudo leer» — el caso que lo
 * motivó, en el docblock de `DocumentTotalRow`); **el desglose de impuestos sale
 * de `resolveDocumentTaxes`**, que agrega en estricto para no escribir una suma
 * menor que la real en la casilla que se copia al 303; **las fechas van por
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

import type * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QrCode } from "lucide-react";

import {
  fetchCompanyProfile,
  type PimiaCompanyAddress,
} from "@/features/pimia/api/company";
import type {
  PimiaEstimateLine,
  PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import type {
  PimiaInvoice,
  PimiaInvoiceAddress,
} from "@/features/pimia/api/invoices";
import { resolveDocumentTaxes, taxLabel } from "@/features/pimia/lib/taxes";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { cn } from "@/shared/lib/cn";

/* Los `id` que atan cada sección con su `<h2>`. Constantes de módulo y no
 * `useId()`: `aria-labelledby` los necesita **estables** entre renders. */
const DOCUMENT_TITLE_ID = "pimia-invoice-document-title";
const BILL_TO_TITLE_ID = "pimia-invoice-bill-to-title";

/**
 * El papel ocupa dos columnas y las dos filas; el raíl se apila en la tercera.
 * La colocación es **explícita** y no heredada del orden del DOM, así que el
 * orden al derrumbarse a una columna se elige aparte: **el cobro primero**. La
 * usa también el esqueleto de la pantalla, y por eso se exporta.
 */
export const DOCUMENT_PLACEMENT =
  "lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1";

/* El chasis se deletrea aquí en vez de importar la constante `CARD` de la
 * pantalla: son las mismas cuatro clases que ya escriben a mano el
 * `CollectionCard` y `PimiaInvoiceVeriFactu`, y hacerlas viajar entre ficheros
 * ataría el documento a la pantalla por una decisión de borde. */
const DOCUMENT_CARD =
  "min-w-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-5 sm:px-6 sm:pb-8 xl:px-8 xl:pb-10 xl:pt-8";

/* El canal entre columnas numéricas, y las dos que se van bajo `sm`. El canal
 * solo abre a 32 px en `xl`; hasta ahí mide 24, que por los tres que hay son
 * los 24 px que le faltaban a la tabla para caber a 1024 px. */
const GUTTER = "pl-6 xl:pl-8";
const ONLY_SM = "hidden sm:table-cell";
const NUM_HEAD = `whitespace-nowrap py-3 ${GUTTER} pr-0 text-right font-semibold`;
const NUM_CELL = `py-4 ${GUTTER} pr-0 text-right align-top`;
const QTY_CELL = `${NUM_CELL} ${ONLY_SM} whitespace-nowrap tabular-nums text-muted-foreground`;

/**
 * Junta los trozos de una dirección saltándose los que no hay: sin esto, una
 * empresa con calle y sin ciudad imprime «Calle Mayor 12, » con el separador
 * colgando. `null` cuando no queda nada, para omitir el renglón entero.
 *
 * Vive aquí porque el papel la usa dos veces —membrete y «Facturar a»—, y se
 * exporta porque el raíl la usa una: la segunda línea de un cobro («método ·
 * referencia») cuelga el mismo separador cuando el método no vino.
 */
export function joinParts(
  parts: (string | null | undefined)[],
  separator: string,
): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(separator) : null;
}

/** Las líneas legibles de una dirección postal, ya podadas. */
function addressLines(
  address: PimiaCompanyAddress | PimiaInvoiceAddress | null,
): string[] {
  if (!address) {
    return [];
  }
  const locality = joinParts([address.zip, address.city], " ");
  return [
    joinParts([address.street1, address.street2], ", "),
    joinParts([locality, address.state], ", "),
  ].filter((line): line is string => line !== null);
}

function formatQuantity(line: PimiaEstimateLine) {
  if (line.quantity === null) {
    return "—";
  }
  const quantity = line.quantity.toLocaleString("es-ES", {
    maximumFractionDigits: 3,
  });
  return line.unitName ? `${quantity} ${line.unitName}` : quantity;
}

/**
 * Los impuestos de UNA línea, de subtítulo bajo el concepto.
 *
 * `amountCents` es `number | null` —`normalizeTaxes` lo llena con `readCents`—
 * y el hueco llega hasta `PimiaAmount` en vez de formatearse como cero: un IVA
 * ilegible escrito «0,00 €» afirma que la línea no lleva impuesto, y la etiqueta
 * de al lado, que sigue diciendo «IVA 21%», demuestra que es falso.
 *
 * 👤 **Esto era una quinta columna hasta el 2026-08-18, y no cabía**: la tabla
 * pedía 545 px de mínimo medidos y a 1024 px de ventana la tarjeta le da 424, o
 * sea que el `overflow-hidden` del papel se comía la columna del importe y el
 * total sin barra y sin aviso. Se adopta la forma de la maqueta —el impuesto
 * bajo el concepto— pero **con la cuota**, que es lo que allí falta: sin ella
 * una factura que mezcla IVA e IRPF no se cuadra a mano. Lo único que se pierde
 * es la vertical de las cuotas, y esa se lee en el pie, de donde sale la casilla
 * del 303. Sin etiqueta, o sin importe, esto no se puede repetir. Y una línea
 * sin impuestos no pinta nada: la raya decía «no se pudo leer», que de subtítulo
 * sería falso.
 */
function TaxLines({ taxes }: { taxes: PimiaEstimateTax[] | null }) {
  if (!taxes || taxes.length === 0) {
    return null;
  }
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      {taxes.map((tax) => (
        // El par entero NO va `whitespace-nowrap`: partible, el mínimo de la
        // columna es el mayor de los dos trozos y no su suma —y ese mínimo es
        // el que decide si la tabla cabe—. El importe sí es indivisible.
        <span key={tax.id}>
          {taxLabel(tax)}{" "}
          <PimiaAmount
            cents={tax.amountCents}
            className="whitespace-nowrap text-foreground"
          />
        </span>
      ))}
    </span>
  );
}

/**
 * Una fila del pie de totales: la etiqueta pegada al importe, a la derecha,
 * como en una factura de papel.
 *
 * ⚠️ **`amountCents` admite `null` a propósito y ese `null` tiene que llegar
 * entero hasta `PimiaAmount`.** Hasta el 2026-08-18 el tipo era `number`, y el
 * «Total» en negrita llamaba con `invoice.totalCents ?? 0`: el hueco moría en
 * el llamante, antes de que la celda de dinero —que sí sabe distinguirlo—
 * pudiera pintar la raya.
 *
 * Y el hueco no es teórico: `readCents` lee la cadena decimal que este ERP manda
 * hoy (`"1000.00"` → 1000) pero devuelve `null` ante un decimal con céntimos de
 * verdad (`"1234.56"`), que ya sería otra unidad. O sea que aparece cuando el
 * servidor **cambia la forma** de un importe sin avisar, y `due_amount` ya
 * demostró que eso pasa. El día que pase, la misma factura pintaba «—» en la
 * lista, se le caía el pie «Total en pantalla»... y aquí, donde más se mira,
 * decía «Total 0,00 €» en negrita: quien confunde «no se pudo leer lo que debe»
 * con «debe cero» da el documento por saldado. Por eso no hay ni un `?? 0`, y el
 * énfasis no enciende la raya —decisión 2 de `PimiaAmountCell`.
 */
function DocumentTotalRow({
  amountCents,
  divider,
  emphasis,
  label,
}: {
  amountCents: number | null;
  /** Raya de separación encima, para el total. */
  divider?: boolean;
  emphasis?: boolean;
  label: string;
}) {
  const edge = divider ? "border-t border-border" : undefined;
  const head = cn(
    "px-0 pb-0 pt-4",
    emphasis
      ? "font-semibold text-foreground"
      : "font-normal text-muted-foreground",
    edge,
  );
  return (
    <tr>
      {/* El rótulo va DOS veces, como en la maqueta, porque `colSpan` no
          entiende de saltos: bajo `sm`, cantidad y precio son `display:none` y
          salen de la tabla, así que uno fijo reclamaba columnas que ya no
          estaban y echaba los totales 122 px a la derecha —medidos en un móvil
          de 375— de las cifras que suman. */}
      <th className={cn(head, "text-left sm:hidden")} scope="row">
        {label}
      </th>
      <th
        className={cn(head, "hidden text-right sm:table-cell")}
        colSpan={3}
        scope="row"
      >
        {label}
      </th>
      <td className={cn("pb-0 pr-0 pt-4 text-right", GUTTER, edge)}>
        <PimiaAmount
          cents={amountCents}
          className={cn(
            // Sin esto el «€» del total cuelga en un segundo renglón: la
            // columna la dimensiona el importe de línea, a 14 px, y el total
            // va a 18. Los de las líneas ya lo llevaban.
            "whitespace-nowrap",
            emphasis
              ? "text-lg font-semibold text-foreground"
              : "text-sm text-foreground",
          )}
        />
      </td>
    </tr>
  );
}

/** Una casilla del identificador del documento (fecha, vencimiento, serie…). */
function DocumentField(props: { children: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="mt-1 font-medium text-foreground">{props.children}</dd>
    </div>
  );
}

/* Una fecha en `<time>`: ISO cruda en el atributo, forma CORTA en el texto —
 * «18 de agosto de 2026» no cabe en las casillas de 78 px en que queda esta
 * rejilla cuando el papel se parte en dos, y salía repartida en tres renglones. */
function DocumentDate(props: { label: string; value: string | null }) {
  return (
    <DocumentField label={props.label}>
      {props.value ? (
        <time dateTime={props.value}>{formatIsoDateShort(props.value)}</time>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </DocumentField>
  );
}

/**
 * Los datos fiscales de la empresa que emite, para el membrete.
 *
 * 📌 **Debería vivir en `hooks/usePimiaResources.ts`** —el docblock de
 * `fetchCompanyProfile` así lo pide—, y está aquí solo porque el rediseño y el
 * ensanche del normalizador se hicieron en carriles separados y el fichero de
 * hooks no era de ninguno de los dos. Al subirla, de paso lo que allí ya está
 * anotado: hoy hay **tres** consultas que piden `/bootstrap` entero para sacar
 * unos campos cada una, y lo suyo es una sola de la que cuelguen por `select`.
 * La clave copia la forma de las demás para que la invalidación por tenant siga
 * alcanzándola.
 */
function useCompanyProfileQuery() {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: ["pimia", "data", tenant?.id ?? "none", "company-profile"],
    queryFn: fetchCompanyProfile,
    enabled: Boolean(tenant),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * El membrete: quién emite la factura.
 *
 * 👤 **Decisión tomada: se enseña solo lo que exista, y lo que falta no deja
 * hueco.** No es precaución teórica — el tenant real de pruebas trae la razón
 * social y **nada más** (ni dirección, ni teléfono, ni NIF, ni logo), así que su
 * estado normal hoy es **una sola línea**. Cada renglón se omite entero: ni
 * etiquetas sueltas, ni separadores colgando, ni contenedores vacíos que aportan
 * margen. Mientras la consulta vuela, o si se cae, el membrete tampoco se pinta:
 * un rectángulo gris donde va la razón social se lee como un fallo de impresión.
 * ⛔ Y sin logotipo: `CompanyResource` publica `logo` y `logo_path`, pero nadie
 * ha comprobado si son URL o ruta, y una imagen rota en la cabecera de una
 * factura es peor que ninguna.
 */
function CompanyLetterhead() {
  const company = useCompanyProfileQuery().data;

  if (!company) {
    return null;
  }

  const heading = company.name ?? company.tradeName;
  const details = [
    ...addressLines(company.address),
    company.address?.phone ?? null,
    company.taxId ? `NIF: ${company.taxId}` : null,
  ].filter((line): line is string => Boolean(line));

  if (!heading && details.length === 0) {
    return null;
  }

  return (
    <div className="mt-6" data-testid="pimia-invoice-letterhead">
      {heading ? (
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {heading}
        </h2>
      ) : null}
      {/* Solo cuando dice algo que la razón social no diga ya. */}
      {company.tradeName && company.tradeName !== heading ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {company.tradeName}
        </p>
      ) : null}
      {details.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
          {details.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
      {/* Sin redondear a propósito: esquinas vivas, que es lo que lo lee como
          el sello de un documento y no como una insignia más. */}
      <h2
        className="inline-flex bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
        id={BILL_TO_TITLE_ID}
      >
        Facturar a
      </h2>
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

      <CompanyLetterhead />

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
