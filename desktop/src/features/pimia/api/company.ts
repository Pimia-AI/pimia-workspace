/**
 * Los datos de empresa que el ERP necesita para componer un correo y para
 * poner el membrete en la cabecera de una factura.
 *
 * ⚠️ **Todo sale de `GET /bootstrap`, y no de `/company/settings`, por una
 * razón de permisos, no de comodidad.** El guard mapea `company/*` al dominio
 * `settings` y **`settings:read` no existe en el catálogo OAuth**
 * (`config/oauth.php` de factSaas): pedirlo no da error, se ignora en
 * silencio. `bootstrap`, en cambio, es dominio `meta`, que **cualquier token
 * puede leer**.
 *
 * El precio es que `/bootstrap` devuelve mucho más de lo que hace falta (el
 * usuario, sus permisos, los menús, los módulos…). Por eso se pide una vez y se
 * cachea: ver `usePimiaEstimateMailBodyQuery`.
 *
 * Dentro de esa respuesta hay **dos sacos distintos**, y conviene no
 * confundirlos:
 *
 * - **`current_company`** es un `CompanyResource` tipado en el contrato
 *   (`api.d.ts:5495` → `api.d.ts:2985`), con `name`, `trade_name`, `vat_id`,
 *   `tax_id`, `logo` y la relación `address`. De aquí sale el membrete.
 * - **`current_company_settings`** es el saco de ajustes: el contrato lo tipa
 *   `string[]` (`api.d.ts:5496`), lo cual es mentira del generador —es un mapa
 *   clave→valor— y **ninguna de sus claves aparece en `api.d.ts`**. De aquí
 *   salen las plantillas de correo, y lo que se saque de ahí es sondeo, no
 *   contrato.
 *
 * 🕳️ El membrete se apoya en el primero **a propósito**. El encargo apuntaba a
 * `current_company_settings`, pero sus claves no están publicadas y no se han
 * podido verificar contra el tenant vivo desde aquí; poner nombres de clave
 * adivinados habría dado una función que devuelve `null` siempre sin que nadie
 * se entere. `current_company` viaja en la **misma respuesta**, así que la
 * razón de permisos que abre este fichero se cumple igual y no hay ni una
 * petición de más. Si algún día se comprueba que los fiscales también viven en
 * los ajustes, se añaden ahí como respaldo, no en su lugar.
 */

import { pimiaRequest } from "@/features/pimia/api/pimiaClient";

/**
 * Cadena del servidor → texto de verdad o `null`.
 *
 * Gemelo del de `api/customers.ts`, y aquí es **la pieza que sostiene la
 * decisión del membrete**: Laravel serializa una columna sin rellenar como
 * cadena vacía, no como `null`, y `""` es un valor que pasa cualquier `if`.
 * Sin este colador el membrete pintaría el renglón de la dirección con su
 * icono y nada detrás, que en un papel se lee peor que no pintarlo.
 */
function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * La plantilla de correo con la que la empresa manda sus presupuestos.
 *
 * Es **HTML** y lleva marcadores (`{COMPANY_NAME}`, `{ESTIMATE_NUMBER}`…) que
 * sustituye el servidor al enviar (`Estimate::getEmailBody`), no nosotros: los
 * que no reconoce los borra. Se enseña tal cual, igual que hace el panel.
 *
 * `null` si el tenant no la tiene puesta — entonces el diálogo empieza en
 * blanco en vez de inventarse un texto que la empresa no ha escrito.
 */
export async function fetchEstimateMailBody(): Promise<string | null> {
  return fetchMailBody("estimate_mail_body");
}

/** La de facturas, del mismo sitio y por la misma razón de permisos. */
export async function fetchInvoiceMailBody(): Promise<string | null> {
  return fetchMailBody("invoice_mail_body");
}

async function fetchBootstrap(): Promise<Record<string, unknown> | null> {
  const payload = await pimiaRequest<unknown>({ path: "/bootstrap" });

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  return payload as Record<string, unknown>;
}

async function fetchMailBody(key: string): Promise<string | null> {
  const payload = await fetchBootstrap();
  const settings = payload?.current_company_settings;

  if (typeof settings !== "object" || settings === null) {
    return null;
  }

  return text((settings as Record<string, unknown>)[key]);
}

/**
 * La dirección postal de la empresa, tal como la sirve `AddressResource`
 * (`api.d.ts:2846`).
 *
 * Cada campo es `string | null` y **nunca cadena vacía**: quien pinta el
 * membrete decide renglón a renglón qué existe, y la única forma de podar sin
 * dejar huecos es que «no hay» y «hay algo» se distingan de un vistazo.
 *
 * ⛔ **No hay `email` en `AddressResource` ni en `CompanyResource`.** El correo
 * de la empresa emisora **no existe en el contrato**, en ninguna de las dos
 * rutas que publican datos de empresa. No se pinta, no se deja hueco y **no se
 * saca de `current_user.email`** (`api.d.ts:4800`): ese es el correo de quien
 * ha entrado en la aplicación, no el de la sociedad que emite la factura, y
 * poner uno por el otro es inventarse la identidad fiscal del usuario en su
 * propio documento. Queda anotado aquí para que el siguiente no vuelva a
 * buscarlo.
 */
export type PimiaCompanyAddress = {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
};

/**
 * La identidad fiscal de la empresa: lo que va en la cabecera del papel.
 *
 * ⚠️ **El caso normal HOY es «casi todo vacío», no un membrete lleno.**
 * Comprobado contra el tenant real `reformas-vera` (2026-08-18,
 * `get_company_info`): viene la **razón social** —`Reformas Vera`— y nada más;
 * teléfono, dirección, país y logo salen vacíos. Quien pinte el membrete tiene
 * que verlo bonito con **un solo campo relleno**, y ese —no el lleno— es el
 * estado que hay que mirar en pantalla antes de dar el bloque por hecho.
 *
 * Por eso cada campo es `string | null` por separado en vez de un objeto
 * «relleno o no»: la decisión de 👤 es que el membrete **enseña solo lo que
 * hay**, sin pintar los ausentes ni dejarles hueco, y esa poda solo se puede
 * hacer campo a campo.
 *
 * ⛔ Y por eso mismo aquí no hay ni un valor por defecto: un membrete es la
 * identidad fiscal de quien emite la factura. Un dato que no llegó **no se
 * pinta**; lo que jamás puede pasar es que se pinte uno inventado.
 */
export type PimiaCompanyProfile = {
  /** Razón social (`name`). Lo único que trae hoy el tenant de pruebas. */
  name: string | null;
  /** Nombre comercial (`trade_name`), si la empresa lo tiene puesto aparte. */
  tradeName: string | null;
  /**
   * NIF/CIF. Sale de `vat_id` (`api.d.ts:2989`, **anulable declarado**) y, si
   * ese viene vacío, de `tax_id` (`api.d.ts:2990`). Son los dos identificadores
   * fiscales que publica el recurso; no hay ningún campo llamado `nif` ni
   * `cif` en todo el contrato.
   */
  taxId: string | null;
  /**
   * El logotipo (`logo`, `api.d.ts:2991`).
   *
   * 🕳️ **Sin verificar**: el tenant de pruebas no tiene logo (`Has Logo: No`),
   * así que **no se ha podido comprobar si `logo` es una URL absoluta o una
   * ruta relativa**. El recurso publica además `logo_path` (2992), que por el
   * nombre es una ruta de almacenamiento y no sirve para un `src`. Hasta que
   * alguien lo mire contra un tenant con logo, esto **no se cuelga de un
   * `<img>`**: una imagen rota en la cabecera de una factura es peor que no
   * poner logotipo.
   */
  logo: string | null;
  /**
   * La dirección postal, que es una **relación opcional** (`address?`,
   * `api.d.ts:2996`): `null` cuando el servidor no la cargó o la empresa no la
   * tiene. Ojo, que no es lo mismo que un objeto con los seis campos a `null`
   * —eso es «la relación vino y está vacía»—, pero para pintar el membrete las
   * dos cosas se podan igual.
   */
  address: PimiaCompanyAddress | null;
};

function normalizeCompanyAddress(raw: unknown): PimiaCompanyAddress | null {
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

/**
 * Los datos fiscales de la empresa activa, para el membrete de la factura.
 *
 * Sale de `current_company` de `/bootstrap` (ver el docblock de cabecera: es
 * cuestión de permisos, `settings:read` no existe). Devuelve `null` solo cuando
 * la respuesta no trae empresa ninguna — que ya es un caso raro, porque
 * `bootstrap` sin `current_company` significa que el grant no está atado a
 * ningún tenant.
 *
 * 📌 **Cómo se cachea**: aquí no se cachea nada, igual que en el resto de esta
 * capa. La caché es de react-query, en `hooks/usePimiaResources.ts`, y este
 * dato pide exactamente el mismo trato que las plantillas de correo —una
 * `useQuery` colgada de `dataKey(tenant?.id, …)` con `staleTime` largo (10 min),
 * como `usePimiaEstimateMailBodyQuery`—: los datos fiscales de una empresa no
 * cambian mientras alguien mira una factura.
 *
 * 🕳️ Pendiente, y **no es de este carril**: hoy hay ya dos consultas que piden
 * `/bootstrap` entero para sacar una cadena cada una (las dos plantillas de
 * correo), y esta sería la tercera. Lo correcto sería una sola consulta
 * `["pimia","data",<tenant>,"bootstrap"]` de la que las tres cuelguen por
 * `select`. Se anota aquí para que quien toque los hooks lo vea; abrir una
 * cuarta ruta al mismo sitio no arregla nada.
 */
export async function fetchCompanyProfile(): Promise<PimiaCompanyProfile | null> {
  const payload = await fetchBootstrap();
  const company = payload?.current_company;

  if (typeof company !== "object" || company === null) {
    return null;
  }

  const raw = company as Record<string, unknown>;

  return {
    name: text(raw.name),
    tradeName: text(raw.trade_name),
    // `vat_id` primero porque es el campo que el panel enseña como NIF; el
    // `??` cae en `tax_id` cuando aquel viene vacío, y si los dos lo están,
    // `null` — que es lo que hace que el renglón «NIF:» no se pinte.
    taxId: text(raw.vat_id) ?? text(raw.tax_id),
    logo: text(raw.logo),
    address: normalizeCompanyAddress(raw.address),
  };
}
