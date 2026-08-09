/**
 * Las acciones de documento de un presupuesto, retratadas.
 *
 * Spec aparte de `pimia-screens-screenshots` a propósito: aquel retrata
 * **pantallas** y no toca nada, y este abre menús, confirma diálogos y **cambia
 * estado contra el mock**. Mezclarlos haría que un cambio de estado se colara
 * en la captura de la lista de la pantalla anterior.
 *
 * Lo que se comprueba, además de que la captura salga: que cada acción llega al
 * mock con el método y el cuerpo que espera el servidor, y que la UI relee
 * después —porque `POST /status` contesta `{success: true}` y no el documento.
 */

import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";
import { installPimiaMock, type PimiaMockOptions } from "../helpers/pimia";

const SHOTS = "test-results/pimia-acciones";
const THEME_STORAGE_KEY = "buzz-theme";

async function boot(
  page: Page,
  options: { theme?: "buzz" | "buzz-dark" } & PimiaMockOptions = {},
) {
  await page.setViewportSize({ height: 1000, width: 1600 });
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: options.theme ?? "buzz" },
  );
  await installPimiaMock(page, options);
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pimia-sidebar")).toBeVisible();
}

/** Abre la ficha de un presupuesto desde la lista. */
async function openEstimate(page: Page, id: string) {
  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await page.getByTestId(`pimia-estimate-open-${id}`).click();
  await expect(page.getByTestId("pimia-estimate-primary-action")).toBeVisible();
}

async function shoot(page: Page, name: string) {
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("la acción primaria de un aceptado es convertir en factura", async ({
  page,
}) => {
  await boot(page);
  await openEstimate(page, "130");

  await expect(page.getByTestId("pimia-estimate-primary-action")).toHaveText(
    /Convertir en factura/,
  );
  await shoot(page, "ficha-aceptado");
});

test("la de un borrador es marcarlo como enviado", async ({ page }) => {
  await boot(page);
  await openEstimate(page, "133");

  await expect(page.getByTestId("pimia-estimate-primary-action")).toHaveText(
    /Marcar como enviado/,
  );
  await shoot(page, "ficha-borrador");
});

test("el menú de la ficha ofrece todas las acciones", async ({ page }) => {
  await boot(page);
  await openEstimate(page, "130");
  await page.getByTestId("pimia-estimate-actions-130").click();

  // El estado que ya tiene no se ofrece: marcarlo otra vez no es una acción.
  await expect(
    page.getByRole("menuitem", { name: "Marcar como aceptado" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Marcar como enviado" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Abrir el PDF" }),
  ).toBeVisible();
  await shoot(page, "ficha-menu");
});

test("el menú de la ficha en oscuro", async ({ page }) => {
  await boot(page, { theme: "buzz-dark" });
  await openEstimate(page, "130");
  await page.getByTestId("pimia-estimate-actions-130").click();
  await expect(
    page.getByRole("menuitem", { name: "Abrir el PDF" }),
  ).toBeVisible();
  await shoot(page, "ficha-menu-oscuro");
});

test("el menú de la fila ofrece lo mismo, más la navegación", async ({
  page,
}) => {
  await boot(page);
  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await page.getByTestId("pimia-estimate-actions-131").click();

  await expect(
    page.getByRole("menuitem", { name: "Ver el presupuesto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Convertir en factura" }),
  ).toBeVisible();
  await shoot(page, "fila-menu");
});

test("marcar como aceptado cambia el estado y la ficha lo relee", async ({
  page,
}) => {
  await boot(page);
  await openEstimate(page, "132");

  await expect(page.getByTestId("pimia-estimate-primary-action")).toHaveText(
    /Marcar como aceptado/,
  );
  await page.getByTestId("pimia-estimate-primary-action").click();

  // `POST /status` devuelve `{success: true}` y nada más: si la pantalla no
  // invalidara su caché, la insignia seguiría diciendo «Enviado» para siempre.
  await expect(page.getByText("Aceptado", { exact: true })).toBeVisible();
  await expect(page.getByTestId("pimia-estimate-primary-action")).toHaveText(
    /Convertir en factura/,
  );
  await shoot(page, "estado-cambiado");
});

test("convertir en factura pregunta antes, y dice que no gasta número", async ({
  page,
}) => {
  await boot(page);
  await openEstimate(page, "130");
  await page.getByTestId("pimia-estimate-primary-action").click();

  const dialog = page.getByTestId("pimia-estimate-confirm");
  await expect(dialog).toContainText("borrador y sin numerar");
  await shoot(page, "confirmar-convertir");

  await page.getByRole("button", { name: "Convertir en factura" }).click();
  await expect(page.getByText("Factura borrador creada")).toBeVisible();
  await shoot(page, "convertida");
});

test("duplicar pregunta antes y lleva al duplicado", async ({ page }) => {
  await boot(page);
  await openEstimate(page, "128");

  await expect(page.getByTestId("pimia-estimate-primary-action")).toHaveText(
    /Duplicar/,
  );
  await page.getByTestId("pimia-estimate-primary-action").click();

  const dialog = page.getByTestId("pimia-estimate-confirm");
  await expect(dialog).toContainText("borrador con las mismas líneas");
  await shoot(page, "confirmar-duplicar");

  await page.getByRole("button", { name: "Duplicar", exact: true }).click();
  // El duplicado es otro documento: la ficha tiene que ser la suya, no la del
  // original que se acaba de copiar.
  await expect(page.getByTestId("pimia-estimate-primary-action")).toHaveText(
    /Marcar como enviado/,
  );
  await shoot(page, "duplicado");
});

test("un grant sin el permiso lo dice y ofrece volver a autorizar", async ({
  page,
}) => {
  await boot(page, { staleGrant: true });
  await openEstimate(page, "130");
  await page.getByTestId("pimia-estimate-primary-action").click();

  const dialog = page.getByTestId("pimia-estimate-confirm");
  await expect(dialog).toContainText("invoices:write");
  await expect(
    page.getByRole("button", { name: "Volver a autorizar" }),
  ).toBeVisible();
  await shoot(page, "falta-permiso");
});
