/**
 * `AddressResource` (`api.d.ts:2846-2863`) → una dirección postal podable.
 *
 * Vive en su propio fichero porque **la misma forma la usan tres recursos**: la
 * factura (`customer.billing`), el presupuesto (`customer.billing`) y la ficha
 * de cliente (`billing` y `shipping`, que son los dos el mismo tipo). Escribir
 * el normalizador una vez por pantalla es cómo dos documentos que imprimen la
 * misma dirección acaban podándola distinto.
 *
 * 🕳️ **Y hay un clon vivo que este fichero todavía no ha absorbido**:
 * `normalizeAddress` en `api/invoices.ts:507`, privado de módulo y con seis
 * campos (sin `name` ni `country`). No se toca desde aquí porque `api/invoices.ts`
 * es de otro carril y hay agentes en paralelo; el paso pendiente es que aquel
 * pase a importar de aquí y `PimiaInvoiceAddress` se quede como alias de
 * `PimiaAddress`. Mientras tanto son dos, y esto es deuda anotada, no una
 * decisión.
 *
 * ⛔ `AddressResource` **no tiene `email`**: el correo de un cliente es
 * `customer.email` (3197), no un campo de su dirección.
 */

/** Una dirección postal del ERP, con los campos que se pueden imprimir. */
export type PimiaAddress = {
  /** El nombre que va en la dirección, que puede no ser el del cliente. */
  name: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  /**
   * El nombre del país, por la relación **opcional** `country`
   * (`api.d.ts:2861` → `CountryResource.name`, 3049). El `country_id` pelado no
   * se lee: un número no es un país, y traducirlo aquí exigiría una tabla que
   * el servidor no manda.
   */
  country: string | null;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Devuelve `null` sólo cuando **la relación no vino**. Si vino y está vacía,
 * devuelve el objeto con todos los campos a `null`, que es un hecho distinto
 * («la hay, no tiene nada dentro») aunque quien pinta pode las dos igual.
 */
export function normalizeAddress(raw: unknown): PimiaAddress | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const address = raw as Record<string, unknown>;
  const country = address.country;
  return {
    name: text(address.name),
    street1: text(address.address_street_1),
    street2: text(address.address_street_2),
    city: text(address.city),
    state: text(address.state),
    zip: text(address.zip),
    phone: text(address.phone),
    country:
      typeof country === "object" && country !== null
        ? text((country as Record<string, unknown>).name)
        : null,
  };
}

/** ¿Queda algo que imprimir? Una dirección vacía no se pinta. */
export function hasAddress(address: PimiaAddress | null): boolean {
  if (!address) {
    return false;
  }
  return Object.values(address).some((value) => value !== null);
}
