/**
 * Lo que el ERP necesita del sistema operativo. Hoy, una sola cosa: abrir una
 * URL fuera de la app.
 *
 * Vive en `api/` y no en `ui/` por la misma razón que `pimiaClient.ts`: **el
 * puente Tauri está confinado aquí**. Las vistas siguen siendo funciones puras
 * de sus props, se pueden montar en un test sin `window.__TAURI_INTERNALS__` y
 * la frontera se puede demostrar leyendo una sola carpeta.
 */

import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Abre una URL en el navegador del sistema.
 *
 * Fuera de la app a propósito: un PDF del ERP dentro del webview quedaría en
 * una ventana sin barra de direcciones, sin imprimir y sin guardar — que es lo
 * único que se hace con el PDF de un presupuesto.
 *
 * Solo `https:` y `http:`. La URL viene del servidor (`estimate_pdf_url`), y
 * una respuesta comprometida que devolviera `file:` o `javascript:` no debería
 * poder usar esta puerta para que el SO abra lo que sea.
 */
export async function openExternalUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Pimia devolvió una dirección que no se entiende: ${url}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `No se abre una dirección ${parsed.protocol.replace(":", "")}: solo http y https.`,
    );
  }

  await openUrl(parsed.toString());
}
