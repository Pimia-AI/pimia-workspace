/**
 * Las dos reglas de la ficha de cliente que se pueden probar sin navegador: la
 * que tapa un IBAN y la que decide si dos direcciones son la misma.
 *
 * ⚠️ **Este fichero no importa NADA** (ver `./series.ts`): así se prueba con el
 * type stripping de `node --test`, que no resuelve el alias `@/`.
 *
 * ⛔ Lo que **no** vive aquí, y no es un olvido: **validar el IBAN y sacarle el
 * nombre del banco**. La maqueta lo hace con una tabla propia de entidades
 * (`validarIban(...)?.entidad`), y el servidor **no manda el nombre del banco**.
 * Escribir «Banco Santander» bajo un IBAN a partir de cuatro dígitos es afirmar
 * un dato derivado en la pantalla donde se paga dinero. Se tapa el IBAN, se
 * enseña el que llegó, y nada más.
 */

/** Los cuatro últimos dígitos que se dejan ver. */
const IBAN_TAIL = 4;

/** El IBAN sin espacios ni minúsculas, tal como se compara y se trocea. */
function compactIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * El IBAN en grupos de cuatro, que es como se lee y como se teclea.
 *
 * Lo que llega puede venir ya espaciado, sin espaciar, o espaciado de otra
 * forma: se normaliza siempre, para que el mismo número no se vea de dos
 * maneras según el tenant.
 */
export function groupIban(iban: string): string {
  const compact = compactIban(iban);
  const groups = compact.match(/.{1,4}/g);
  return groups ? groups.join(" ") : compact;
}

/**
 * El IBAN tapado: `•••• •••• •••• 1332`.
 *
 * 👤 La maqueta lo tapa por defecto con este comentario, que se porta entero
 * porque es patrón visual y no dato: es el único campo de la ficha que no
 * debería leerse de reojo por encima del hombro.
 *
 * ⚠️ Un IBAN demasiado corto para tener cola se tapa **entero**. Enseñar los
 * cuatro últimos de una cadena de seis es no taparlo.
 */
export function maskIban(iban: string): string {
  const compact = compactIban(iban);
  if (compact.length < IBAN_TAIL * 2) {
    return "••••";
  }
  return `•••• •••• •••• ${compact.slice(-IBAN_TAIL)}`;
}

/** Lo justo de una dirección para saber si dos son la misma. */
type ComparableAddress = {
  name: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
};

/**
 * ¿Son la misma dirección?
 *
 * Sirve para escribir «La misma que la de facturación» en vez de repetirla, y
 * por eso tiene que ser **estricta**: si se equivoca, la ficha afirma que el
 * envío va a la dirección de facturación cuando va a otra, y eso son bultos en
 * la puerta equivocada.
 *
 * ⛔ **El teléfono no entra en la comparación**: dos direcciones idénticas con
 * teléfonos distintos siguen siendo el mismo sitio, y `phone` se pinta aparte.
 *
 * ⚠️ Dos direcciones **vacías** no son «la misma»: son dos ausencias. Quien
 * llama no pinta ninguna de las dos, así que decir que coinciden sería la única
 * frase de un bloque que no tiene nada dentro.
 */
export function sameAddress(
  a: ComparableAddress | null,
  b: ComparableAddress | null,
): boolean {
  if (!a || !b) {
    return false;
  }
  const keys: (keyof ComparableAddress)[] = [
    "name",
    "street1",
    "street2",
    "city",
    "state",
    "zip",
    "country",
  ];
  if (keys.every((key) => a[key] === null)) {
    return false;
  }
  return keys.every((key) => a[key] === b[key]);
}
