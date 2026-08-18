/**
 * El dinero en una tabla: céntimos formateados, a la derecha y en cifras de
 * ancho fijo.
 *
 * Alinear a la derecha en `tabular-nums` no es gusto: es lo que deja las comas
 * decimales en la misma columna y permite comparar una lista de un vistazo. El
 * formateo pasa SIEMPRE por `lib/money` — la API habla en céntimos enteros y
 * esa conversión vive en un solo sitio.
 *
 * ## Un hueco no es un cero
 *
 * ⚠️ Hasta el 2026-08-18 esta celda hacía `formatCents(cents ?? 0)`, así que un
 * importe que **no se pudo leer** (`readCents` devolvió `null`) se pintaba
 * «0,00 €», carácter por carácter igual que un importe que de verdad vale cero.
 * En el índice de clientes eso convertía un `due_amount` ilegible en «este
 * cliente está al corriente de pago»: una cifra equivocada con el mismo aspecto
 * que la buena, que es el peor fallo que puede tener una pantalla de dinero,
 * porque no se ve. Y `due_amount` es justo el campo que ya mordió una vez —
 * llega como cadena decimal (`"2000.00"`) y no como entero; el docblock de
 * `readCents` en `lib/money.ts` cuenta ese caso.
 *
 * Lo confirmó el anfitrión web: su `PimiaLeadList` esquiva esta celda con un
 * `if` para pintar la raya a mano en la columna de valor esperado, y lo dejó
 * anotado como deuda a reportar aquí. Este cambio arregla **el origen**, que es
 * lo que allí se pedía.
 *
 * 🕳️ Pero la limpieza de aquel rodeo **no la puede hacer este cambio, y sigue
 * pendiente**: el módulo de leads todavía no existe en este workspace, así que
 * el `if` y el punto 4 de su docblock —donde el `?? 0` de esta celda está
 * declarado como defecto vivo— siguen en pie en el anfitrión web hasta que leads
 * suba. Se dice aquí porque el orden de lectura es el que muerde: quien vaya a
 * tocar una columna de dinero en leads leerá primero aquella nota, creerá que
 * esta celda sigue mintiendo, y volverá a esquivarla a mano en una columna nueva
 * —una raya pintada dos veces, con dos juegos de clases que se separan al primer
 * retoque—. Cuando leads llegue, ese `if` se cae y la celda pinta las dos.
 *
 * Las tres decisiones, para que nadie las deshaga sin querer:
 *
 * 1. **`null`, `undefined` o cualquier cosa que no sea un número finito → la
 *    raya `—`.** Un `0` de verdad sigue siendo «0,00 €»: son dos hechos
 *    distintos («debe cero» y «no sé lo que debe») y tienen que verse distintos.
 * 2. **La raya va apagada SIEMPRE, mande lo que mande `dimZero`.** `dimZero`
 *    habla de ceros —de ruido que se baja de tono en una lista—, no de huecos.
 *    Un pie de tabla pasa `dimZero={false}` para que su total destaque; si eso
 *    encendiera también la raya, un dato que falta se leería como un dato
 *    enfático. Por eso la clase va **después** de `className` en el `cn()`:
 *    `twMerge` deja ganar a la última, y así ni un `text-foreground` de quien
 *    llama puede devolverle el color a un hueco.
 * 3. **`formatCents` no se toca.** Su contrato es «formatea un importe» y tiene
 *    otros usuarios (los `hint` de las listas, el desglose de las fichas) que le
 *    pasan cifras ya comprobadas; volverlo devolver-raya haría que un `string`
 *    se colara donde se espera dinero. Quien distingue el hueco es la celda,
 *    que es la única que sabe que está pintando una columna de una tabla.
 *
 * La raya no necesita alineación propia: `PimiaAmountCell` ya es `text-right`,
 * así que cae en la misma vertical que las comas decimales de las filas de
 * arriba y de abajo. Una raya centrada dentro de una columna numérica se lee
 * como otra columna.
 */

import { formatCents } from "@/features/pimia/lib/money";
import { cn } from "@/shared/lib/cn";
import { TableCell } from "@/shared/ui/table";

/** La raya de «no hay dato». Nunca un 0, nunca una celda vacía. */
const DASH = "—";

type PimiaAmountProps = {
  cents: number | null | undefined;
  className?: string;
  /** Los importes a cero son ruido en una lista: se apagan. */
  dimZero?: boolean;
};

/** El importe suelto, para fichas y totales fuera de una tabla. */
export function PimiaAmount({ cents, className, dimZero }: PimiaAmountProps) {
  // `Number.isFinite` y no `!= null`: un `NaN` o un `Infinity` colados por una
  // división de más arriba tampoco son un importe, y «NaN €» no es mejor que
  // «0,00 €» — las dos formas mienten, sólo que una lo disimula.
  const isAmount = typeof cents === "number" && Number.isFinite(cents);

  if (!isAmount) {
    return (
      <span className={cn("tabular-nums", className, "text-muted-foreground")}>
        {DASH}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "tabular-nums",
        dimZero && cents === 0 ? "text-muted-foreground" : undefined,
        className,
      )}
    >
      {formatCents(cents)}
    </span>
  );
}

/**
 * La celda de importe de una tabla del ERP.
 *
 * El `hint` es la segunda línea apagada del patrón de la referencia (allí,
 * «Total» sobre «Amount Due»). Aquí lleva la base imponible: la cifra grande es
 * lo que se cobra y debajo, en pequeño, de dónde sale.
 *
 * El `hint` es independiente del importe y se sigue pintando aunque arriba haya
 * raya: que el total no se haya podido leer y la base sí es información, no un
 * motivo para esconder lo poco que se sabe. Quien llama decide si lo manda.
 */
export function PimiaAmountCell({
  cents,
  className,
  dimZero = true,
  hint,
}: PimiaAmountProps & { hint?: string }) {
  return (
    <TableCell className={cn("text-right font-medium", className)}>
      <PimiaAmount cents={cents} dimZero={dimZero} />
      {hint ? (
        <span className="block whitespace-nowrap text-xs font-normal tabular-nums text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </TableCell>
  );
}
