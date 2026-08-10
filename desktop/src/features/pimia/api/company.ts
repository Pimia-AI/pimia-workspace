/**
 * Los ajustes de la empresa que el ERP necesita para componer un correo.
 *
 * ⚠️ **Salen de `GET /bootstrap`, y no de `/company/settings`, por una razón de
 * permisos, no de comodidad.** El guard mapea `company/*` al dominio `settings`
 * y **`settings:read` no existe en el catálogo OAuth** (`config/oauth.php` de
 * factSaas): pedirlo no da error, se ignora en silencio. `bootstrap`, en
 * cambio, es dominio `meta`, que **cualquier token puede leer**.
 *
 * El precio es que `/bootstrap` devuelve mucho más de lo que hace falta (el
 * usuario, sus permisos, los menús, los módulos…). Por eso se pide una vez y se
 * cachea: ver `usePimiaEstimateMailBodyQuery`.
 */

import { pimiaRequest } from "@/features/pimia/api/pimiaClient";

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

async function fetchMailBody(key: string): Promise<string | null> {
  const payload = await pimiaRequest<unknown>({ path: "/bootstrap" });

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const settings = (payload as { current_company_settings?: unknown })
    .current_company_settings;

  if (typeof settings !== "object" || settings === null) {
    return null;
  }

  const body = (settings as Record<string, unknown>)[key];
  if (typeof body !== "string") {
    return null;
  }

  const trimmed = body.trim();
  return trimmed === "" ? null : trimmed;
}
