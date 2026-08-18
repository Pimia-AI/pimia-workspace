/**
 * Facturas del ERP.
 *
 * Lo que una factura tiene y un presupuesto no, y condiciona toda la UI:
 *
 * 1. ⛔ **Un borrador NO tiene número.** `invoice_number` se asigna al
 *    **publicar** (`ChangeInvoiceStatusController`), que además registra la
 *    factura en VeriFactu/AEAT y descuenta stock. `invoiceNumber: null` es un
 *    estado normal, no un dato que falte.
 * 2. **Dos ejes de estado.** `status` (DRAFT → PUBLISHED → SENT → VIEWED →
 *    COMPLETED) dice dónde está el documento; `paid_status` (UNPAID →
 *    PARTIALLY_PAID → PAID) dice cuánto se ha cobrado. Son independientes y
 *    la API los filtra por claves distintas (`status` y `paid_status`).
 * 3. **`due_amount`** es lo pendiente de cobro, y `overdue` lo calcula el
 *    servidor (vencida y sin pagar del todo). Aquí no se recalcula ninguno.
 * 4. **`is_credit_note`**: las rectificativas viven en la misma tabla y salen
 *    en el mismo índice. Se señalan, no se esconden. Y en la factura que
 *    corrigen, los `effective_*` dicen lo que queda **neto** de ellas: el
 *    nominal es el importe legal del documento, el efectivo es lo que de
 *    verdad se debe.
 * 5. **Un tercer eje: el estado en la AEAT** (`aeat_status`), que no es ni el
 *    del documento ni el del cobro. Con su prueba (`aeat_csv`, `hash`,
 *    `qr_data`) cuando la AEAT aceptó el registro — pero eso solo en la ficha:
 *    el índice lleva el estado, no el expediente.
 *
 * Los impuestos y las líneas tienen la misma forma de cable que en
 * presupuestos, así que se reutilizan sus tipos y su normalizador — un solo
 * sitio donde viven las trampas del IVA + IRPF.
 *
 * ---
 *
 * ## Lo que la ficha necesita y este normalizador tiraba (2026-08-18)
 *
 * `GET /invoices/{invoice}` **no acepta ningún parámetro de query**
 * (`query?: never` en `invoices.show`): no hay `include=` que pedir, y lo que
 * carga lo carga el servidor. Y cargaba más de lo que aquí se leía. Al rediseñar la
 * ficha como **documento** —membrete, «Facturar a», cobros aplicados— resultó
 * que el dato ya venía pagado en la respuesta y se soltaba en este mapeo. Lo
 * rescatado, y qué desbloquea cada cosa:
 *
 * | Campo | De dónde sale | Para qué |
 * |---|---|---|
 * | `customerTaxId` | `customer.tax_id` (3217) | el NIF en «Facturar a» |
 * | `customerBilling` | `customer.billing` (3230, **relación**) | su dirección |
 * | `payments` | `payments` (3689, **relación**) | «Pagos aplicados» |
 * | `paymentMethodName` | `payment_method.name` (3692→4035, **relación**) | «Forma de pago» del pie |
 * | `series` | `invoice_series` (3691, **relación**) | la casilla «Serie» |
 * | `creditNotesCount` | `credit_notes_count` (3687) | «N rectificativas» sin adivinar |
 * | `rectifiedInvoiceNumber` | `rectified_invoice_number` (3674) | «Rectifica FAC-…» |
 * | `allowEdit` | `allow_edit` (3661) | el candado de edición (**sin lector**) |
 * | `templateName` | `template_name` (3634) | la plantilla del PDF (**sin lector**) |
 * | `creditedTotalCents` | `credited_total` (3654) | lo ya rectificado, sin restas a mano |
 *
 * ### Las dos reglas de lectura, que aquí no son teoría
 *
 * ⚠️ **El `string` del `.d.ts` NO es la forma del cable.** El generador de
 * OpenAPI de factSaas tipa `string` todo atributo de un Resource de Laravel,
 * booleanos y enteros incluidos. Se ve en código que lleva meses funcionando:
 * `overdue` está tipado `string` (3665) y se lee `=== true`; `total` (3626)
 * llega **número** y `due_amount` (3629) llega **cadena `"1000.00"`** en la
 * **misma factura** (ver el docblock de `lib/money.ts`). De ahí que:
 *
 * 1. **Todo importe pasa por `readCents`**, jamás por `Number()`. Ilegible es
 *    `null` → **raya**, nunca 0, y fuera de toda suma (`sumStrict`).
 * 2. **Todo booleano se lee `=== true`**, jamás `Boolean(x)`: `Boolean("false")`
 *    es `true`. Para `allowEdit` eso no es cosmético: es un permiso, y
 *    equivocarlo hacia el «sí» abriría lo que el servidor va a cerrar.
 * 3. **El `?` del contrato significa «puede no venir»**, y la ficha no puede
 *    pedir que venga. Su ausencia es raya o bloque que no se pinta — nunca un
 *    cero ni un id pelado donde iba un nombre.
 *
 * ⚠️ Dos de los rescatados —`allowEdit` y `templateName`— se normalizan y **no
 * los lee todavía ninguna vista**. Están aquí porque el dato venía y tirarlo
 * era la pérdida; poner el candado y ofrecer la plantilla son decisiones que
 * aún no se han tomado. Sus docblocks dicen qué haría falta: se marcan así
 * para que nadie dé por hecho que la ficha ya los respeta.
 *
 * La única excepción a la regla 1 es `credit_notes_count` (3687), **el único
 * `number` declarado de todo el recurso**: no es dinero, así que se comprueba
 * `typeof === "number"` y si no, raya.
 */

import {
  normalizeLine,
  normalizeTaxes,
  text,
  type PimiaEstimateLine,
  type PimiaEstimateTax,
} from "@/features/pimia/api/estimates";
import {
  pimiaRequest,
  derivePagination,
  PimiaApiError,
  readCompanyCount,
  readPagination,
  unwrapItem,
  unwrapList,
  type PimiaPagination,
} from "@/features/pimia/api/pimiaClient";
import { readCents } from "@/features/pimia/lib/money";

export const INVOICE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "SENT",
  "VIEWED",
  "COMPLETED",
] as const;

export type PimiaInvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_PAID_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;

export type PimiaInvoicePaidStatus = (typeof INVOICE_PAID_STATUSES)[number];

/**
 * El estado del registro en VeriFactu (AEAT), que es un eje aparte del estado
 * del documento y del cobro.
 *
 * La lista sale de los sitios que lo escriben en factSaas —
 * `ChangeInvoiceStatusController::registerInVeriFactu`, el job
 * `RetryVeriFactuRegistration` y lo que devuelve la API de VeriFactu — y es la
 * misma que usa el panel Vue (`helpers/invoice-status.js`).
 *
 * ⛔ **Dos de estos estados significan «no hay registro que tocar»**, y eso
 * decide qué acciones tienen sentido:
 *
 * - `pending` — el registro falló al publicar y el reintento **automático**
 *   está en marcha (`RetryVeriFactuRegistration`). No hay
 *   `verifactu_record_id`, así que sync y retry contestarían 422.
 * - `sandbox_only` — el plan del tenant no llega a producción; nunca se mandó.
 *
 * Y `error` es ambiguo a propósito del servidor: puede ser un registro que la
 * AEAT rechazó (existe, se puede reintentar) o los reintentos automáticos
 * agotados sin llegar a crearlo (no existe). Desde fuera no se distinguen: lo
 * dice el 422 de `/verifactu/detail`, y por eso la ficha lo sondea.
 */
export const INVOICE_AEAT_STATUSES = [
  "not_applicable",
  "queued",
  "pending",
  "sent",
  "accepted",
  "accepted_with_warnings",
  "rejected",
  "error",
  "annulled",
  "sandbox_only",
] as const;

export type PimiaInvoiceAeatStatus = (typeof INVOICE_AEAT_STATUSES)[number];

/** Los dos estados en los que hay algo que reintentar. */
export const AEAT_FAILURE_STATUSES: readonly string[] = ["rejected", "error"];

/**
 * ¿Tiene sentido enseñar el bloque VeriFactu? Igual que `hasAeatState` del
 * panel: no cuando la factura queda fuera del ámbito AEAT (un borrador sin
 * estado, o `not_applicable`).
 */
export function hasAeatState(status: string | null): boolean {
  return Boolean(status) && status !== "not_applicable";
}

/**
 * ¿El estado AEAT pide atención, o solo acompaña?
 *
 * Decide **dónde** va el bloque en la ficha: lo que va mal es lo más urgente de
 * la página y sube justo bajo la cabecera; lo que salió bien es prueba
 * documental y baja con el resto. Es el mismo criterio del panel, que reserva
 * el bloque tintado de arriba para el rechazo y el error.
 */
export function isAeatUrgent(status: string | null): boolean {
  return AEAT_FAILURE_STATUSES.includes(status ?? "") || status === "pending";
}

/**
 * Una dirección postal, tal como la sirve `AddressResource` (`api.d.ts:2846`).
 *
 * Cada campo es `string | null` y **nunca cadena vacía**: Laravel serializa una
 * columna sin rellenar como `""`, que pasa cualquier `if`, y el documento poda
 * renglón a renglón. Un `""` que se cuela pinta el icono del mapa con nada
 * detrás, y en un papel eso se lee peor que no pintar la línea.
 */
export type PimiaInvoiceAddress = {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
};

/**
 * Un cobro aplicado a la factura (`PaymentResource`, `api.d.ts:4069`).
 *
 * Llega **dentro de la ficha**, en `payments` (`api.d.ts:3689`), y no hay otro
 * sitio de donde sacarlo: `GET /payments` declara `query?: never`
 * (`api.d.ts:9299`), o sea que el contrato no publica ningún filtro por
 * `invoice_id`. Si la relación no vino, no se puede ir a buscar.
 *
 * ⚠️ **`amountCents` se lee con `readCents`, jamás con `Number()`.** El `.d.ts`
 * tipa `amount` como `string` (4074) exactamente igual que tipa `total` (3626)
 * —que en el cable llega **número**— y `due_amount` (3629) —que llega **cadena
 * decimal `"1000.00"`**, en la misma factura—. El contrato no permite saber
 * cuál de las dos formas trae un cobro, así que no se puede escribir código que
 * asuma ninguna. Un importe que no se pudo leer es `null`: se pinta **raya**,
 * nunca 0, y **queda fuera de toda suma** — si alguien totaliza los cobros, va
 * por `sumStrict`, que envenena el total con un solo hueco en vez de dar una
 * cifra más pequeña con el mismo aspecto que la buena.
 *
 * ⚠️ Nótese la asimetría con la escritura: `PaymentRequest.amount` es un
 * **`number`** de céntimos (`api.d.ts:4045`). Se escribe número y se lee cadena.
 */
export type PimiaInvoicePayment = {
  id: string;
  /**
   * La referencia honesta del cobro (`payment_number`, 4071). ⛔ No confundir
   * con `transaction_id` (4084), que es la conciliación bancaria: ese identifica
   * el movimiento del banco, no el recibo del ERP.
   */
  paymentNumber: string | null;
  /** `YYYY-MM-DD`. Se formatea con `pimiaDates`, nunca con `new Date(...)`. */
  paymentDate: string | null;
  amountCents: number | null;
  /**
   * El nombre del método de pago, que sale de la relación `payment_method`
   * (4091 → `PaymentMethodResource.name`, 4035) y es **opcional**.
   *
   * ⛔ Sin ella queda `payment_method_id` (4078), un id pelado, y aquí se
   * devuelve `null`: pintar un id donde va un nombre es dato inventado. Raya.
   */
  paymentMethodName: string | null;
  /**
   * ⚠️ `notes` viene tipado **`unknown[] | string`** (4073) porque Laravel
   * serializa el `null` de esa columna como **`[]`**. Pasa por `text()`, que
   * solo acepta `string`: un `String(raw.notes)` aquí escribiría la cadena
   * vacía o `"[object Object]"` dentro del documento.
   */
  notes: string | null;
  /** El recibo en PDF (`payment_pdf_url`, 4088). */
  pdfUrl: string | null;
};

/**
 * La serie de numeración del documento (`InvoiceSeriesResource`,
 * `api.d.ts:3716`), que llega por la relación **opcional** `invoice_series`
 * (3691).
 *
 * `null` cuando no viene, y entonces la casilla «Serie» del documento va con
 * raya: lo que queda es `invoice_series_id` (3635), y un id no es un nombre.
 * Tampoco se deduce partiendo el número de factura por el guion — eso es
 * adivinar el formato de otro tenant.
 */
export type PimiaInvoiceSeries = {
  id: string | null;
  /** El código corto, el que va en el número («FAC», «R»). */
  code: string | null;
  name: string | null;
};

export type PimiaInvoice = {
  id: string;
  /** `null` hasta publicar: el número oficial se asigna entonces. */
  invoiceNumber: string | null;
  /**
   * La serie de la que cuelga el número. Solo en el detalle, y `null` cuando
   * el servidor no cargó la relación — ver `PimiaInvoiceSeries`.
   */
  series: PimiaInvoiceSeries | null;
  referenceNumber: string | null;
  status: PimiaInvoiceStatus | string;
  paidStatus: PimiaInvoicePaidStatus | string;
  /**
   * ¿Deja el servidor editar esta factura? (`allow_edit`, `api.d.ts:3661`).
   *
   * ⛔ **Hoy no lo lee nadie, y esto no pone ningún candado por sí solo.** Se
   * normaliza y se expone, y ni una vista lo consulta: el escritorio no ofrece
   * editar una factura —lo que ofrece es publicar, enviar, marcar enviada,
   * duplicar y rectificar—, y cuáles de esas caben en cada momento lo decide
   * `PimiaInvoiceActions` mirando `status`. Se dice aquí con todas las letras
   * porque el párrafo de abajo describe la consecuencia de leer mal el campo, y
   * de un párrafo así se sale creyendo que la ficha ya lo respeta.
   *
   * 👉 **Qué haría falta para que fuese un candado de verdad**: el día que
   * exista una edición (`PUT /invoices/{invoice}` está en el contrato; pantalla
   * no hay), que la pantalla pregunte por `allowEdit` y **no** por
   * `status === "DRAFT"`. No son el mismo predicado: el estado del documento es
   * una conjetura sobre el permiso, y el permiso lo dicta el servidor, que es
   * quien va a rechazar el PUT. Dos trampas para ese día: el campo **solo llega
   * en la ficha** —el índice va con `view=summary`, que no lo trae, así que
   * desde una fila `allowEdit` sale `false` sin que nadie lo haya negado— y el
   * mock de los e2e tampoco lo emite todavía, así que allí toda factura saldría
   * cerrada hasta que se añada. Cambiar quién decide si una factura se puede
   * editar, con VeriFactu de por medio, no es una limpieza: es una decisión de
   * producto.
   *
   * ⚠️ **Cuando se lea, se lee estricto** (`=== true`), y **lo que no se pueda
   * leer cuenta como «no se puede editar»**. El campo está tipado `string` por
   * el mismo generador de OpenAPI que tipó `overdue` (3665) así siendo
   * booleano: un `Boolean(raw.allow_edit)` diría `true` ante la cadena
   * `"false"`. Y equivocarse hacia el «sí» no es cosmético — abriría una
   * edición que el servidor va a rechazar, y sobre una factura ya publicada,
   * registrada en VeriFactu, eso no se deshace.
   *
   * Por lo mismo el tipo es `boolean` y no `boolean | null`: aquí no hay
   * «no se sabe» que ofrecer al usuario. La duda se resuelve cerrando.
   */
  allowEdit: boolean;
  /** Vencida y sin cobrar del todo. Lo dice el servidor, no se recalcula. */
  isOverdue: boolean;
  isCreditNote: boolean;
  /**
   * El número de la factura que esta rectifica (`rectified_invoice_number`,
   * `api.d.ts:3674`), para poder escribir «Rectifica FAC-2026/0031» en vez de
   * un id.
   *
   * Es el único campo del recurso que es **opcional y anulable a la vez**: si
   * no viene, o viene `null`, esta factura no rectifica a ninguna.
   */
  rectifiedInvoiceNumber: string | null;
  /**
   * Cuántas rectificativas se han emitido **contra** esta factura
   * (`credit_notes_count`, `api.d.ts:3687`).
   *
   * ⚠️ **Es el único `number` declarado de todo `InvoiceResource`**, así que no
   * pasa por `readCents` —no es dinero— ni por `text()`: se comprueba
   * `typeof === "number"` y, si no lo es, **raya**. Nunca 0: «no lo pude leer»
   * y «no tiene ninguna» son cosas distintas y la segunda es una afirmación.
   *
   * 👉 **Dónde llega y dónde no**, que es lo que decide quién manda al pintar
   * la marca «Rectificada». En el contrato está declarado **sin `?`**, pero eso
   * no lo hace ubicuo: lo trae quien pide el recurso entero, o sea la **ficha**
   * (`getInvoice`, que no manda parámetros porque `invoices.show` no acepta
   * ninguno). En el **índice no llega nunca**: `listInvoices` pide
   * `view=summary`, y esa vista ligera trae los `effective_*` pero no el
   * recuento. Ahí este campo es `null` en toda fila.
   *
   * Por eso la lista deduce la marca comparando `total` contra
   * `effective_total`. Esa heurística **no es una deuda que este campo salde**:
   * donde manda es porque es el único indicio que la vista ligera trae. Acierta
   * de casualidad —los dos importes también difieren por otras razones, y con
   * uno ilegible (`null`) la comparación no dice nada—, pero callar que una
   * factura está rectificada es peor que marcarla de más. Donde el recuento sí
   * llega manda él: dice **cuántas**, y un `0` suyo apaga la marca aunque el
   * neto difiera, porque el servidor ya ha contado.
   */
  creditNotesCount: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  /**
   * El NIF/CIF del cliente (`customer.tax_id`, `api.d.ts:3217`).
   *
   * ⚠️ **Ya llegaba en la respuesta y se tiraba en este mismo normalizador.**
   * `invoices.show` no acepta ningún parámetro de query (`api.d.ts:8203`) y
   * `getInvoice` no manda `view=summary`, así que la ficha recibe el
   * `CustomerResource` **entero** —y `tax_id` es un atributo sin `?`: si viene
   * el cliente, viene él— y aquí nos quedábamos con nombre, correo y teléfono.
   * Sin este campo la factura no puede escribir el identificador fiscal de
   * quien la paga, que en España es parte del documento, no un adorno.
   *
   * En el índice sí es `null` de verdad: `view=summary` recorta el cliente a
   * `{id, name, email, phone}`.
   *
   * ⛔ No existe ningún campo `nif` ni `cif` en el contrato. Se llama `tax_id`,
   * igual que el de la empresa (2990), y punto.
   */
  customerTaxId: string | null;
  /**
   * La dirección de facturación del cliente (`customer.billing`,
   * `api.d.ts:3230`), para el bloque «Facturar a».
   *
   * ⚠️ Es una **relación opcional** de Eloquent: viene si el servidor la cargó
   * al serializar la ficha, y **el contrato no promete que lo haga** (ni
   * siquiera en `GET /customers/{customer}`, donde `billing` sigue llevando
   * `?`). Se lee de forma oportunista: si viene, se pinta; si no, el bloque de
   * dirección **no se pinta y no deja hueco**.
   *
   * 👉 Y **no se sale a buscarla** a `/customers/{id}`: sería un N+1 por un
   * renglón cosmético cuando el «Facturar a» ya tiene nombre, NIF y correo. Si
   * un día se comprueba contra un tenant que el show nunca la carga, la
   * decisión de pedirla se toma entonces, con el dato delante.
   *
   * ⛔ `AddressResource` **no tiene `email`**: el correo del cliente es
   * `customer.email` (3197), que ya se lee arriba.
   */
  customerBilling: PimiaInvoiceAddress | null;
  /** Solo en el detalle: el índice no trae el cuerpo del documento. */
  notes: string | null;
  /** Solo en el detalle, como `lines`. */
  taxes: PimiaEstimateTax[] | null;
  /** Solo en el detalle, y `null` es «no se pidieron», no «no tiene». */
  lines: PimiaEstimateLine[] | null;
  /**
   * Los cobros aplicados (`payments`, `api.d.ts:3689`). Relación **opcional**:
   * `null` es «no vinieron con esta respuesta» —el índice nunca los trae, va
   * con `view=summary`— y `[]` es «esta factura no tiene ninguno». La
   * diferencia es justo la que separa «Sin pagos registrados» de no pintar el
   * bloque.
   */
  payments: PimiaInvoicePayment[] | null;
  /**
   * La forma de pago pactada en el documento, por la relación **opcional**
   * `payment_method` (`api.d.ts:3692` → `name`, 4035).
   *
   * `null` cuando no viene, y entonces la línea «Forma de pago: …» del pie del
   * papel **se omite entera**, no se escribe «Forma de pago: —», que no dice
   * nada. ⛔ Y el IBAN de cobro **no viaja en esta respuesta**: un IBAN
   * equivocado en una factura es dinero que se va a otra cuenta, así que si no
   * viene del servidor no se imprime.
   */
  paymentMethodName: string | null;
  subTotalCents: number | null;
  discountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  /** Lo pendiente de cobro, en céntimos. */
  dueCents: number | null;
  /**
   * El total **neto de rectificativas** (`effective_total`): el nominal menos
   * lo que le hayan rectificado. Igual a `totalCents` mientras no haya
   * ninguna, y es lo que impide que una factura anulada del todo se siga
   * leyendo por su importe original.
   *
   * ⚠️ En una **rectificativa** es su propio importe en negativo, no cero: el
   * servidor sirve estos campos por accessor, y el accessor devuelve el total
   * tal cual cuando `is_credit_note`.
   */
  effectiveTotalCents: number | null;
  /**
   * Lo **ya rectificado** contra esta factura (`credited_total`,
   * `api.d.ts:3654`): el sumando que explica por sí solo la diferencia entre
   * `totalCents` y `effectiveTotalCents`, sin restarlos a mano en la vista.
   */
  creditedTotalCents: number | null;
  /** Lo pendiente de cobro neto de rectificativas (`effective_due_amount`). */
  effectiveDueCents: number | null;
  /**
   * Vencida **y con saldo neto pendiente** (`effective_overdue`): una factura
   * rectificada del todo está vencida sobre el papel, pero no debe nada.
   *
   * El servidor manda también `effective_paid_status`, que aquí NO se usa: en
   * una factura anulada vale `PAID`, y eso significa «no queda saldo», no «se
   * cobró». Pintar «Pagada» sobre una factura que nadie pagó sería mentir, así
   * que la insignia de cobro se queda con el `paid_status` nominal.
   */
  effectiveOverdue: boolean | null;
  /** Ruta pública por hash, como la del presupuesto: sin token ni scope. */
  pdfUrl: string | null;
  /**
   * El slug de la plantilla con la que se imprime el PDF (`template_name`,
   * `api.d.ts:3634`). Es dato de **impresión**, no del documento: no va en el
   * papel.
   *
   * ⚠️ **Tampoco lo lee nadie todavía**, y no hay dónde elegir plantilla: se
   * expone porque `ChangeInvoiceStatusRequest` la acepta al publicar
   * (`api.d.ts:2977-2982`) y `publishInvoice` hoy manda solo `status`. O sea
   * que es dato disponible para quien monte esa elección —que necesitaría
   * saber cuál está puesta—, no una función que ya exista. Como `allowEdit`,
   * solo llega en la ficha.
   */
  templateName: string | null;
  /** El eje AEAT. `null` en un borrador: aún no hay nada que registrar. */
  aeatStatus: PimiaInvoiceAeatStatus | string | null;
  /** El CSV que devuelve la AEAT al aceptar el registro. Solo en el detalle. */
  aeatCsv: string | null;
  /** La huella encadenada del registro VeriFactu. Solo en el detalle. */
  aeatHash: string | null;
  /** URL de verificación en la sede de la AEAT (el QR). Solo en el detalle. */
  aeatQrUrl: string | null;
};

export type PimiaInvoicePage = {
  invoices: PimiaInvoice[];
  pagination: PimiaPagination | null;
  totalCount: number | null;
  companyTotalCount: number | null;
};

export const INVOICE_SORT_FIELDS = [
  "invoice_date",
  "due_date",
  "invoice_number",
  "status",
  "total",
] as const;

export type PimiaInvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

type RawInvoice = Record<string, unknown>;

/**
 * `AddressResource` → dirección podable.
 *
 * Devuelve `null` solo cuando **la relación no vino**. Si vino y está vacía,
 * devuelve el objeto con los seis campos a `null`, que es un hecho distinto
 * («la hay, no tiene nada dentro») aunque el documento pode las dos igual.
 */
function normalizeAddress(raw: unknown): PimiaInvoiceAddress | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const address = raw as Record<string, unknown>;
  return {
    street1: text(address.address_street_1),
    street2: text(address.address_street_2),
    city: text(address.city),
    state: text(address.state),
    zip: text(address.zip),
    phone: text(address.phone),
  };
}

function normalizeSeries(raw: unknown): PimiaInvoiceSeries | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const series = raw as Record<string, unknown>;
  return {
    id:
      series.id === undefined || series.id === null ? null : String(series.id),
    code: text(series.code),
    name: text(series.name),
  };
}

function normalizePayment(raw: Record<string, unknown>): PimiaInvoicePayment {
  const method = raw.payment_method as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    paymentNumber: text(raw.payment_number),
    paymentDate: text(raw.payment_date),
    // `readCents`, nunca `Number()`: ver el docblock de `PimiaInvoicePayment`.
    // Ilegible → `null` → raya, y fuera de cualquier suma.
    amountCents: readCents(raw.amount),
    // Sin la relación queda el id pelado (4078), que no es un nombre: raya.
    paymentMethodName: method ? text(method.name) : null,
    // `text()` y no `String()`: el `null` de esta columna llega como `[]`.
    notes: text(raw.notes),
    pdfUrl: text(raw.payment_pdf_url),
  };
}

function normalizeInvoice(raw: RawInvoice): PimiaInvoice {
  const customer = raw.customer as Record<string, unknown> | undefined;
  const paymentMethod = raw.payment_method as
    | Record<string, unknown>
    | undefined;
  const items = raw.items;
  const payments = raw.payments;
  return {
    id: String(raw.id ?? ""),
    invoiceNumber: text(raw.invoice_number),
    series: normalizeSeries(raw.invoice_series),
    referenceNumber: text(raw.reference_number),
    status: text(raw.status) ?? "DRAFT",
    paidStatus: text(raw.paid_status) ?? "UNPAID",
    // `=== true` estricto, igual que `overdue`: el generador tipa `string` lo
    // que en el cable es booleano, y un `Boolean("false")` vale `true`. Un
    // permiso ilegible se resuelve a «no», que es el lado seguro del candado.
    allowEdit: raw.allow_edit === true,
    isOverdue: raw.overdue === true,
    isCreditNote: raw.is_credit_note === true,
    rectifiedInvoiceNumber: text(raw.rectified_invoice_number),
    // El único `number` declarado del recurso: se comprueba el tipo y, si no
    // lo es, `null` (raya). Nunca 0, que sería afirmar «no tiene ninguna».
    creditNotesCount:
      typeof raw.credit_notes_count === "number"
        ? raw.credit_notes_count
        : null,
    invoiceDate: text(raw.invoice_date),
    dueDate: text(raw.due_date),
    customerId: raw.customer_id === undefined ? null : String(raw.customer_id),
    customerName: customer ? text(customer.name) : null,
    customerEmail: customer ? text(customer.email) : null,
    customerPhone: customer ? text(customer.phone) : null,
    // Los dos que la respuesta ya traía y este normalizador tiraba.
    customerTaxId: customer ? text(customer.tax_id) : null,
    customerBilling: customer ? normalizeAddress(customer.billing) : null,
    notes: text(raw.notes),
    taxes: normalizeTaxes(raw.taxes),
    lines: Array.isArray(items)
      ? items.map((item) => normalizeLine(item as Record<string, unknown>))
      : null,
    // `null` (no vinieron) vs `[]` (no tiene): el índice va con `view=summary`
    // y nunca los trae, así que la ficha es el único sitio donde `[]` significa
    // de verdad «esta factura no tiene cobros».
    payments: Array.isArray(payments)
      ? payments.map((payment) =>
          normalizePayment(payment as Record<string, unknown>),
        )
      : null,
    paymentMethodName: paymentMethod ? text(paymentMethod.name) : null,
    subTotalCents: readCents(raw.sub_total),
    discountCents: readCents(raw.discount_val),
    taxCents: readCents(raw.tax),
    totalCents: readCents(raw.total),
    dueCents: readCents(raw.due_amount),
    effectiveTotalCents: readCents(raw.effective_total),
    creditedTotalCents: readCents(raw.credited_total),
    effectiveDueCents: readCents(raw.effective_due_amount),
    // `null` cuando no viene, para que la insignia sepa distinguir «el
    // servidor dice que no» de «el servidor no lo dijo» y caiga en `overdue`.
    effectiveOverdue:
      typeof raw.effective_overdue === "boolean" ? raw.effective_overdue : null,
    pdfUrl: text(raw.invoice_pdf_url),
    templateName: text(raw.template_name),
    aeatStatus: text(raw.aeat_status),
    aeatCsv: text(raw.aeat_csv),
    aeatHash: text(raw.hash),
    aeatQrUrl: text(raw.qr_data),
  };
}

export type ListInvoicesInput = {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  /**
   * Además de los cinco estados, `applyFilters` acepta aquí los virtuales
   * `DUE` y `OVERDUE` (pendientes de cobro / vencidas). Van por la MISMA clave
   * que el estado, así que no se pueden combinar con él.
   */
  status?: PimiaInvoiceStatus | "DUE" | "OVERDUE";
  /** Eje independiente del estado: sí se combina con `status`. */
  paidStatus?: PimiaInvoicePaidStatus;
  /** `YYYY-MM-DD`. La API exige las dos o ninguna. */
  fromDate?: string;
  toDate?: string;
  orderByField?: PimiaInvoiceSortField;
  orderBy?: "asc" | "desc";
};

export async function listInvoices(
  input: ListInvoicesInput = {},
): Promise<PimiaInvoicePage> {
  const hasRange = Boolean(input.fromDate && input.toDate);

  const payload = await pimiaRequest<unknown>({
    path: "/invoices",
    query: {
      // Opt-in a la vista ligera del índice (`view=summary`, factSaas #334):
      // la cabecera con los tres ejes de estado —documento, cobro y AEAT—,
      // los importes en céntimos, customer {id, name, email, phone} y la URL
      // del PDF; sin líneas, impuestos, notas ni las pruebas del registro
      // AEAT, que solo lee la ficha (`getInvoice`). Baja la página de
      // ~480-670 KB a ~19 KB. Un servidor que aún no conoce el parámetro lo
      // ignora y responde la vista completa, así que este opt-in puede
      // desplegarse por delante de la plataforma.
      view: "summary",
      page: input.page,
      limit: input.limit,
      search: input.search?.trim() || undefined,
      customer_id: input.customerId,
      status: input.status,
      paid_status: input.paidStatus,
      from_date: hasRange ? input.fromDate : undefined,
      to_date: hasRange ? input.toDate : undefined,
      orderByField: input.orderByField,
      orderBy: input.orderByField ? (input.orderBy ?? "desc") : undefined,
    },
  });

  const companyTotalCount = readCompanyCount(payload, "invoice_total_count");
  const pagination = derivePagination(
    readPagination(payload),
    companyTotalCount,
    input.page,
    input.limit,
  );

  return {
    invoices: unwrapList<RawInvoice>(payload).map(normalizeInvoice),
    pagination,
    totalCount: pagination?.total ?? companyTotalCount,
    companyTotalCount,
  };
}

export async function getInvoice(
  invoiceId: string,
): Promise<PimiaInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    path: `/invoices/${encodeURIComponent(invoiceId)}`,
  });
  const raw = unwrapItem<RawInvoice>(payload);
  return raw ? normalizeInvoice(raw) : null;
}

/**
 * Publica una factura borrador.
 *
 * ⛔ La acción irreversible de verdad: el servidor asigna el número oficial de
 * la serie, registra la factura en VeriFactu (AEAT) y descuenta stock. Solo
 * acepta borradores. Responde `{success, invoice_number, ...}` — se invalida y
 * se relee, no se siembra caché.
 */
export async function publishInvoice(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/status`,
    body: { status: "PUBLISHED" },
  });
}

/**
 * Marca una factura como enviada.
 *
 * ⚠️ Un borrador se **publica primero** (auto-publish del controlador): número
 * + AEAT. La UI tiene que avisarlo antes, no descubrirse después.
 */
export async function markInvoiceSent(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/status`,
    body: { status: "SENT" },
  });
}

export type PimiaInvoiceMail = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Manda la factura por correo. Mismo contrato que el presupuesto: `from` lo
 * pone la instancia y el que se mande se ignora (factSaas #314/#315). Enviar
 * un borrador también lo publica primero.
 */
export async function sendInvoice(
  invoiceId: string,
  mail: PimiaInvoiceMail,
): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/send`,
    body: {
      to: mail.to.trim(),
      subject: mail.subject.trim(),
      body: mail.body,
    },
  });
}

/** Duplica la factura en un borrador nuevo, sin número, con las mismas líneas. */
export async function cloneInvoice(
  invoiceId: string,
): Promise<PimiaInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/clone`,
  });
  const raw = unwrapItem<RawInvoice>(payload);
  return raw ? normalizeInvoice(raw) : null;
}

export type PimiaInvoicePaymentDraft = {
  invoiceId: string;
  customerId: string;
  /** Céntimos enteros, > 0. */
  amountCents: number;
  /** `YYYY-MM-DD`. */
  paymentDate: string;
};

/**
 * Registra el cobro (total o parcial) de una factura.
 *
 * Escribe en el dominio `payments` — exige `payments:write`. El
 * `payment_number` NO se manda: es opcional y lo genera el servidor con la
 * misma serie que `next-number`, así que no hay carrera que reintentar. El
 * servidor recalcula `due_amount` y `paid_status` de la factura.
 */
export async function recordInvoicePayment(
  draft: PimiaInvoicePaymentDraft,
): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: "/payments",
    body: {
      payment_date: draft.paymentDate,
      customer_id: draft.customerId,
      invoice_id: draft.invoiceId,
      amount: draft.amountCents,
    },
  });
}

/**
 * Crea la factura **rectificativa** de una factura emitida.
 *
 * Lo que hace el servidor (`Invoice::createCreditNote`), y que la UI tiene que
 * contar sin adornar: una **factura nueva** de la serie `R-` con su propio
 * número oficial —asignado ya, no al publicar—, las mismas líneas e impuestos
 * en **negativo**, `status: SENT` y `paid_status: PAID` con deuda cero, y un
 * enlace a la original (`rectified_invoice_id`, tipo AEAT `R1`). La original no
 * se toca.
 *
 * ⚠️ Se crea directamente como `SENT`, **sin pasar por la transición a
 * PUBLISHED**, que es la única que registra en VeriFactu — así que la
 * rectificativa nace sin `aeat_status`. Es cosa del ERP, no de aquí; esta capa
 * no lo disimula.
 *
 * El servidor rechaza con 422 en tres casos que la UI ya evita ofrecer
 * (rectificativa de rectificativa, de un borrador) más uno que **no puede
 * saber**: que la factura ya tenga la suya. Ese mensaje trae el número de la
 * que existe, así que se enseña tal cual.
 *
 * ⚖️ Sin cuota: emitir una rectificativa es una obligación, no una
 * funcionalidad de pago (la ruta va sin `enforce.plan`). Cuenta para el
 * contador del mes porque es una fila de `invoices`, pero nunca se bloquea.
 */
export async function createCreditNote(
  invoiceId: string,
): Promise<PimiaInvoice | null> {
  const payload = await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/credit-note`,
  });
  const raw = unwrapItem<RawInvoice>(payload);
  return raw ? normalizeInvoice(raw) : null;
}

/**
 * El detalle remoto del registro VeriFactu: lo que la AEAT contestó.
 *
 * No sale de la fila de la factura sino de la API de VeriFactu, a la que el ERP
 * hace de proxy. Solo interesa cuando algo falló —es donde vive el motivo— y
 * por eso la ficha lo pide únicamente entonces, igual que el panel.
 *
 * ⛔ Contesta **422 «Invoice not registered in VeriFactu»** cuando la factura no
 * tiene `verifactu_record_id`. Eso no es un fallo de la llamada: es el único
 * modo de distinguir un registro que la AEAT rechazó (existe, se reintenta) de
 * uno que nunca llegó a crearse (no hay nada que reintentar). Se devuelve como
 * dato, no como excepción.
 */
export type PimiaInvoiceVeriFactu = {
  /** La respuesta de la AEAT, aplanada a texto: llega como cadena u objeto. */
  aeatResponse: string | null;
  /** `false` si el 422 dijo que la factura no está registrada. */
  isRegistered: boolean;
};

export async function getInvoiceVeriFactu(
  invoiceId: string,
): Promise<PimiaInvoiceVeriFactu> {
  try {
    const payload = await pimiaRequest<unknown>({
      path: `/invoices/${encodeURIComponent(invoiceId)}/verifactu/detail`,
    });
    const raw = unwrapItem<Record<string, unknown>>(payload);
    const response = raw?.aeat_response;
    return {
      aeatResponse:
        response === undefined || response === null
          ? null
          : typeof response === "string"
            ? response
            : JSON.stringify(response, null, 2),
      isRegistered: true,
    };
  } catch (error) {
    if (
      error instanceof PimiaApiError &&
      error.status === 422 &&
      /not registered/i.test(error.message)
    ) {
      return { aeatResponse: null, isRegistered: false };
    }
    throw error;
  }
}

/**
 * Relee el estado del registro desde VeriFactu y lo guarda en la factura.
 *
 * No cambia nada en la AEAT: trae lo que ya hay. Sirve cuando el registro está
 * en vuelo (`queued`, `sent`) o cuando se quiere confirmar que un rechazo sigue
 * siéndolo. Exige `invoices:write` porque escribe la fila local.
 */
export async function syncInvoiceVeriFactu(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/verifactu/sync`,
  });
}

/**
 * Vuelve a mandar a la AEAT un registro que falló, y sincroniza el estado
 * después (lo hace el propio controlador).
 *
 * Solo tiene sentido sobre un registro que existe: sin `verifactu_record_id`
 * contesta 422. La ficha lo sondea antes de ofrecerlo.
 */
export async function retryInvoiceVeriFactu(invoiceId: string): Promise<void> {
  await pimiaRequest<unknown>({
    method: "POST",
    path: `/invoices/${encodeURIComponent(invoiceId)}/verifactu/retry`,
  });
}
