/**
 * Las pantallas del ERP, retratadas.
 *
 * Existe para que el pase de diseño sea revisable: mismas rutas, mismos datos y
 * mismos temas antes y después, así que las capturas se comparan de verdad en
 * vez de a ojo. Los datos vienen del mock del ERP (`helpers/pimia`), no de un
 * tenant vivo: una captura no puede depender de que alguien tenga el llavero
 * abierto.
 */

import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";
import { installPimiaMock, type PimiaMockOptions } from "../helpers/pimia";

const SHOTS = "test-results/pimia";
const THEME_STORAGE_KEY = "buzz-theme";

/** El tema se siembra antes del bridge: `ThemeProvider` lo lee al montar. */
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

async function shoot(page: Page, name: string) {
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("el panel del ERP", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-overview").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await shoot(page, "panel");
});

test("el panel del ERP en oscuro", async ({ page }) => {
  await boot(page, { theme: "buzz-dark" });
  await page.getByTestId("pimia-nav-overview").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await shoot(page, "panel-oscuro");
});

test("la lista de clientes", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-customers").click();
  await expect(page.getByTestId("pimia-customer-1")).toBeVisible();
  await shoot(page, "clientes");
});

test("el detalle de un cliente", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-customers").click();
  await page.getByTestId("pimia-customer-1").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await shoot(page, "cliente-detalle");
});

test("la lista de presupuestos", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await shoot(page, "presupuestos");
});

test("la lista de presupuestos en oscuro", async ({ page }) => {
  await boot(page, { theme: "buzz-dark" });
  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await shoot(page, "presupuestos-oscuro");
});

test("los presupuestos sin nada que enseñar", async ({ page }) => {
  await boot(page, { empty: true });
  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page.getByTestId("pimia-empty")).toBeVisible();
  await shoot(page, "presupuestos-vacio");
});

test("el ERP sin tenant conectado", async ({ page }) => {
  await boot(page, { disconnected: true });
  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page.getByTestId("pimia-not-connected")).toBeVisible();
  await shoot(page, "sin-conectar");
});
