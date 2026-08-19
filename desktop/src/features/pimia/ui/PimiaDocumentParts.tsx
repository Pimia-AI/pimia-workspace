/**
 * El vocabulario del **papel**: las piezas que comparten la ficha de una
 * factura y la de un presupuesto, sin nada de ninguna de las dos dentro.
 *
 * ## Por qué existe este fichero
 *
 * 👤 El rediseño de la factura (2026-08-18) inventó una forma —tarjeta-papel con
 * banda, membrete, chip de sección, tabla cruda de conceptos y pie de totales— y
 * la dejó escrita **privada de módulo** en `PimiaInvoiceDocument.tsx`. Cuando el
 * presupuesto tuvo que adoptar esa misma forma había exactamente dos caminos, y
 * los dos malos:
 *
 * - **Copiarla.** Dos papeles con las mismas clases escritas dos veces divergen
 *   al primer retoque, y este anfitrión existe precisamente para que eso no
 *   pase: el día que alguien arregle el canal de la tabla en uno, el otro se
 *   queda con el defecto y nadie se entera hasta que un tenant lo enseña.
 * - **Que el presupuesto importe de `PimiaInvoiceDocument.tsx`.** Ataría el
 *   papel de un documento comercial al de un documento fiscal por una decisión
 *   de borde — que es justo lo que el docblock de `DOCUMENT_CARD` allí dice que
 *   no quiere.
 *
 * Así que el vocabulario sube aquí, a un tercer sitio que no es de ninguno de
 * los dos. **Nada de este fichero sabe qué documento lo está usando**: `TaxLines`
 * habla de `PimiaEstimateTax` porque ese tipo ya lo comparten los dos recursos,
 * `addressLines` acepta cualquier dirección con calle y ciudad, y `BillTo` /
 * `DocumentIdentity` —que sí son de cada documento— se quedan fuera a propósito.
 *
 * ✅ **La otra mitad ya está hecha** (2026-08-19). `PimiaInvoiceDocument.tsx` no
 * define ninguna de estas piezas: las importa de aquí. Durante unas horas hubo
 * dos copias y **ya habían divergido**, así que juntarlas exigió comparar las dos
 * versiones línea a línea antes de borrar nada. El resultado de esa comparación,
 * escrito para que nadie lo repita: eran idénticas **carácter a carácter** salvo
 * la palabra `export`, y las dos únicas diferencias eran **añadidos de aquí que a
 * la factura no le cambian ni un nodo** —el renglón del país de `addressLines`
 * (ni `PimiaCompanyAddress` ni `PimiaInvoiceAddress` publican `country`, así que
 * allí sale `undefined` y el renglón se poda) y el `hint` de `DocumentTotalRow`
 * (opcional, y la factura no lo pasa)—. O sea que **no hubo que elegir**: las
 * decisiones caras de la factura —el impuesto de subtítulo y no de columna, el
 * importe que baja de renglón antes que recortarse, el `min-w-0`/`shrink-0` del
 * raíl, el rótulo del pie escrito dos veces por el salto de `sm`— estaban ya
 * enteras en este fichero, y siguen aquí.
 *
 * 🕳️ **Lo que sigue duplicado, y no se puede cerrar desde aquí**:
 * `PimiaInvoiceScreen.tsx` mantiene sus propios `LAYOUT_GRID`, `CARD` y `RailRow`
 * (98, 103 y 122), que son **estos mismos** —su `RailRow` es idéntico al de aquí,
 * comprobado con `diff`—. La pantalla del presupuesto ya los pide aquí; la de la
 * factura tiene que cambiar sus tres imports en su propio carril, y hasta que lo
 * haga este fichero le reexporta lo que ya le pedía a `PimiaInvoiceDocument`.
 *
 * ⚠️ Al portar, este fichero entra en la lista `VERBATIM` de
 * `scripts/portar-vistas.mjs` junto con `PimiaEstimateDocument.tsx`. Un fichero
 * que no está en la lista no viaja y tampoco lo delata `pnpm portar --check`,
 * que compara **la lista** contra `.portado-de.json`: el porte copiaría dos
 * pantallas que importan algo que allí no existe.
 */

import type * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchCompanyProfile } from "@/features/pimia/api/company";
import type {
  PimiaEstimateLine,
  PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import { taxLabel } from "@/features/pimia/lib/taxes";
import { useActivePimiaTenant } from "@/features/pimia/hooks/usePimiaAuth";
import { PimiaAmount } from "@/features/pimia/ui/PimiaAmountCell";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { cn } from "@/shared/lib/cn";

/* ────────────────────────────────────────────────────────────────────────── *
 * La rejilla y los chasis
 * ────────────────────────────────────────────────────────────────────────── */

/** La rejilla del documento y su raíl, compartida también con los esqueletos. */
export const LAYOUT_GRID = "grid grid-cols-1 items-start gap-6 lg:grid-cols-3";

/**
 * El papel ocupa dos columnas y las dos filas; el raíl se apila en la tercera.
 * La colocación es **explícita** y no heredada del orden del DOM, así que el
 * orden al derrumbarse a una columna se elige aparte: **el raíl primero**, que
 * es donde está lo que cambia (el cobro en una factura, el ciclo en un
 * presupuesto). La usan también los esqueletos.
 */
export const DOCUMENT_PLACEMENT =
  "lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1";

/** El chasis de las tarjetas del raíl. */
export const CARD = "rounded-xl border border-border bg-card";

/**
 * El chasis del papel. El `overflow-hidden` no es cosmético: la banda de color
 * de arriba llega a los bordes con márgenes negativos, y sin recortar sale en
 * cuadrado por encima de las esquinas redondeadas.
 */
export const DOCUMENT_CARD =
  "min-w-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-5 sm:px-6 sm:pb-8 xl:px-8 xl:pb-10 xl:pt-8";

/* El canal entre columnas numéricas, y las dos que se van bajo `sm`. El canal
 * solo abre a 32 px en `xl`; hasta ahí mide 24, que por los tres que hay son
 * los 24 px que le faltaban a la tabla para caber a 1024 px. */
export const GUTTER = "pl-6 xl:pl-8";
export const ONLY_SM = "hidden sm:table-cell";
export const NUM_HEAD = `whitespace-nowrap py-3 ${GUTTER} pr-0 text-right font-semibold`;
export const NUM_CELL = `py-4 ${GUTTER} pr-0 text-right align-top`;
export const QTY_CELL = `${NUM_CELL} ${ONLY_SM} whitespace-nowrap tabular-nums text-muted-foreground`;

/* ────────────────────────────────────────────────────────────────────────── *
 * Poda de texto
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Junta los trozos de una dirección saltándose los que no hay: sin esto, una
 * empresa con calle y sin ciudad imprime «Calle Mayor 12, » con el separador
 * colgando. `null` cuando no queda nada, para omitir el renglón entero.
 *
 * Se usa en el membrete, en el destinatario y en el raíl: la segunda línea de
 * un cobro («método · referencia») cuelga el mismo separador cuando el método
 * no vino.
 */
export function joinParts(
  parts: (string | null | undefined)[],
  separator: string,
): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(separator) : null;
}

/**
 * Lo mínimo que este módulo necesita saber de una dirección para imprimirla.
 *
 * Estructural a propósito: casan `PimiaCompanyAddress` (`api/company.ts`, seis
 * campos), `PimiaAddress` (`api/addresses.ts`, con `name` y `country`) y el
 * `PimiaInvoiceAddress` que todavía vive dentro de `api/invoices.ts`. Ninguna de
 * las tres tiene que importar de las otras para pasar por aquí.
 */
type DocumentAddressLike = {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Solo lo publica `PimiaAddress`; en las demás no existe y no se pinta. */
  country?: string | null;
};

/** Las líneas legibles de una dirección postal, ya podadas. */
export function addressLines(address: DocumentAddressLike | null): string[] {
  if (!address) {
    return [];
  }
  const locality = joinParts([address.zip, address.city], " ");
  return [
    joinParts([address.street1, address.street2], ", "),
    joinParts([locality, address.state], ", "),
    // El país va en su propio renglón, como en un sobre, y solo si el servidor
    // mandó el nombre: el `country_id` pelado no se traduce aquí.
    address.country ?? null,
  ].filter((line): line is string => line !== null);
}

/** `2` → `2`; `2,5 h` → `2,5 h`. Sin decimales de adorno. */
export function formatQuantity(line: PimiaEstimateLine) {
  if (line.quantity === null) {
    return "—";
  }
  const quantity = line.quantity.toLocaleString("es-ES", {
    maximumFractionDigits: 3,
  });
  return line.unitName ? `${quantity} ${line.unitName}` : quantity;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Las piezas del papel
 * ────────────────────────────────────────────────────────────────────────── */

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
export function TaxLines({ taxes }: { taxes: PimiaEstimateTax[] | null }) {
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
 * demostró que eso pasa. El día que pase, el mismo documento pintaba «—» en la
 * lista, se le caía el pie «Total en pantalla»... y aquí, donde más se mira,
 * decía «Total 0,00 €» en negrita: quien confunde «no se pudo leer lo que debe»
 * con «debe cero» da el documento por saldado. Por eso no hay ni un `?? 0`, y el
 * énfasis no enciende la raya —decisión 2 de `PimiaAmountCell`.
 *
 * El `hint` es el «(sobre 1.234,00 €)» que la maqueta pone junto a una cuota
 * cuando conviven varios tipos. Es **opcional y llega ya formateado**: esta fila
 * no calcula ninguna base, solo la escribe si quien llama la sabe de verdad. Va
 * en `tabular-nums` como todo el dinero del papel —lo demás lo hereda de
 * `PimiaAmount`, y este no pasa por ahí porque llega en cadena—: con IVA e IRPF
 * conviviendo salen dos hints seguidos, uno bajo otro, y en ancho proporcional
 * dos bases del mismo orden dejan de tener la coma en la misma vertical, que es
 * para lo único que sirven.
 */
export function DocumentTotalRow({
  amountCents,
  divider,
  emphasis,
  hint,
  label,
}: {
  amountCents: number | null;
  /** Raya de separación encima, para el total. */
  divider?: boolean;
  emphasis?: boolean;
  /** Ya formateado por quien llama, o nada. */
  hint?: string | null;
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
  const text = (
    <>
      {label}
      {hint ? <span className="font-normal tabular-nums"> {hint}</span> : null}
    </>
  );
  return (
    <tr>
      {/* El rótulo va DOS veces, como en la maqueta, porque `colSpan` no
          entiende de saltos: bajo `sm`, cantidad y precio son `display:none` y
          salen de la tabla, así que uno fijo reclamaba columnas que ya no
          estaban y echaba los totales 122 px a la derecha —medidos en un móvil
          de 375— de las cifras que suman. */}
      <th className={cn(head, "text-left sm:hidden")} scope="row">
        {text}
      </th>
      <th
        className={cn(head, "hidden text-right sm:table-cell")}
        colSpan={3}
        scope="row"
      >
        {text}
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

/** Una casilla del identificador del documento (fecha, caducidad, serie…). */
export function DocumentField(props: {
  children: React.ReactNode;
  label: string;
}) {
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
export function DocumentDate(props: { label: string; value: string | null }) {
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
 * El rótulo de una sección del papel, en chip.
 *
 * Sin redondear a propósito: esquinas vivas, que es lo que lo lee como el sello
 * de un documento y no como una insignia más. Es el `<h2>` de su `<section>`,
 * así que se le pasa el `id` con el que la sección lo ata por `aria-labelledby`.
 */
export function DocumentSectionTitle(props: {
  children: React.ReactNode;
  id: string;
}) {
  return (
    <h2
      className="inline-flex bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
      id={props.id}
    >
      {props.children}
    </h2>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * El raíl
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Una fila del raíl: rótulo a la izquierda, importe alineado a la derecha.
 *
 * ⚠️ **La fila ENVUELVE y el importe no encoge, y eso no es cosmético.** A
 * 1024 px de ventana —una sin maximizar, o Tauri a media pantalla— el raíl mide
 * 224 px y dentro de la tarjeta quedan 190 px útiles; un importe de siete
 * cifras pide 128, el rótulo ya está en su mínimo, y el importe es
 * **indivisible** (el separador de `Intl` es U+00A0). En una sola línea no
 * caben: como la `<section>` es `overflow-hidden`, lo que sobraba se cortaba
 * **sin barra y sin pista** —«1.234.567,8»—, que es exactamente el defecto que
 * echó la tabla del papel a su propio carril, movido al raíl y encima de la
 * cifra que responde a la pregunta de la pantalla. Con `flex-wrap` el importe
 * se baja entero a su renglón antes que perder un dígito; el `ml-auto` lo deja
 * a la derecha también allí abajo, y el `shrink-0` impide que lo aprieten
 * mientras comparten línea. Un `truncate` no valdría: recortar dinero es
 * mentir, aunque se vean los puntos suspensivos.
 */
export function RailRow(props: {
  amountCents: number | null;
  amountClassName?: string;
  children: React.ReactNode;
}) {
  const { amountCents, amountClassName, children } = props;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="min-w-0 text-muted-foreground">{children}</dt>
      <dd className="ml-auto shrink-0">
        <PimiaAmount
          cents={amountCents}
          className={cn("font-medium text-foreground", amountClassName)}
        />
      </dd>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * El membrete
 * ────────────────────────────────────────────────────────────────────────── */

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
export function useCompanyProfileQuery() {
  const tenant = useActivePimiaTenant();

  return useQuery({
    queryKey: ["pimia", "data", tenant?.id ?? "none", "company-profile"],
    queryFn: fetchCompanyProfile,
    enabled: Boolean(tenant),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * El membrete: quién emite el documento.
 *
 * 👤 **Decisión tomada: se enseña solo lo que exista, y lo que falta no deja
 * hueco.** No es precaución teórica — el tenant real de pruebas trae la razón
 * social y **nada más** (ni dirección, ni teléfono, ni NIF, ni logo), así que su
 * estado normal hoy es **una sola línea**. Cada renglón se omite entero: ni
 * etiquetas sueltas, ni separadores colgando, ni contenedores vacíos que aportan
 * margen. Mientras la consulta vuela, o si se cae, el membrete tampoco se pinta:
 * un rectángulo gris donde va la razón social se lee como un fallo de impresión.
 * ⛔ Y sin logotipo: `CompanyResource` publica `logo` y `logo_path`, pero nadie
 * ha comprobado si son URL o ruta, y una imagen rota en la cabecera de un
 * documento es peor que ninguna.
 *
 * El `testId` lo pone quien llama porque el atributo lo consumen las pruebas de
 * cada pantalla; el membrete en sí es el mismo en las dos.
 */
export function CompanyLetterhead({ testId }: { testId: string }) {
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
    <div className="mt-6" data-testid={testId}>
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
