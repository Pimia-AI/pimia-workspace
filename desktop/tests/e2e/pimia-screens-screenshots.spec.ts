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

/**
 * La ficha de cliente ahora monta sus documentos en dos pestañas y arranca en
 * «Facturas»; Radix desmonta la que no está activa, así que al abrirla la tabla
 * de presupuestos no está en el DOM todavía. La prueba comprueba lo mismo que
 * antes —que la ficha enseña la lista de presupuestos de este cliente— pero en
 * dos tiempos, y de paso retrata las dos caras: la escondida detrás de la
 * pestaña no saldría en ninguna captura, que es justo la mitad de pantalla que
 * el pase de diseño necesita comparar.
 */
test("el detalle de un cliente", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-customers").click();
  await page.getByTestId("pimia-customer-1").click();
  // La pestaña con la que abre la ficha.
  await expect(page.getByTestId("pimia-invoice-list")).toBeVisible();
  await shoot(page, "cliente-detalle");

  // Y la de al lado, la que esta prueba miraba antes del rediseño. El rótulo
  // lleva pegado el recuento («Presupuestos 3»), así que el nombre accesible no
  // es exacto y hay que anclarlo al principio en vez de pedirlo entero.
  await page.getByRole("tab", { name: /^Presupuestos/ }).click();
  await expect(page.getByTestId("pimia-estimate-list")).toBeVisible();
  await shoot(page, "cliente-detalle-presupuestos");
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

test("la ficha de un presupuesto", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-estimates").click();
  await page.getByTestId("pimia-estimate-open-132").click();
  await expect(page.getByTestId("pimia-estimate-lines")).toBeVisible();
  await shoot(page, "presupuesto-ficha");
});

test("la ficha de un presupuesto en oscuro", async ({ page }) => {
  await boot(page, { theme: "buzz-dark" });
  await page.getByTestId("pimia-nav-estimates").click();
  await page.getByTestId("pimia-estimate-open-132").click();
  await expect(page.getByTestId("pimia-estimate-lines")).toBeVisible();
  await shoot(page, "presupuesto-ficha-oscuro");
});

test("la lista de facturas", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-invoices").click();
  await expect(page.getByTestId("pimia-invoice-list")).toBeVisible();
  // Un borrador no tiene número y no lo finge.
  await expect(page.getByTestId("pimia-invoice-91")).toContainText(
    "Sin numerar",
  );
  await shoot(page, "facturas");
});

test("la lista de facturas en oscuro", async ({ page }) => {
  await boot(page, { theme: "buzz-dark" });
  await page.getByTestId("pimia-nav-invoices").click();
  await expect(page.getByTestId("pimia-invoice-list")).toBeVisible();
  await shoot(page, "facturas-oscuro");
});

test("la ficha de una factura", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-invoices").click();
  await page.getByTestId("pimia-invoice-open-89").click();
  await expect(page.getByTestId("pimia-invoice-lines")).toBeVisible();
  // Cobro parcial: el desglose termina en lo pendiente.
  await expect(page.getByText("Pendiente de cobro")).toBeVisible();
  await shoot(page, "factura-ficha");
});

test("la ficha de una factura borrador", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-invoices").click();
  await page.getByTestId("pimia-invoice-open-91").click();
  // Sin número hasta publicar: el título lo dice en vez de fingirlo.
  await expect(page.getByRole("heading", { name: "Borrador" })).toBeVisible();
  await expect(page.getByText("Se numera al publicar.")).toBeVisible();
  await shoot(page, "factura-borrador");
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
