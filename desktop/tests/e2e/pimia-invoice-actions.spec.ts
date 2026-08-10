/**
 * Las acciones de documento de una factura. Como el spec de presupuestos:
 * abre menús, confirma diálogos y cambia estado contra el mock — separado del
 * de capturas de pantallas, que no toca nada.
 *
 * Lo central que se comprueba: que PUBLICAR asigna el número (la ficha relee y
 * el título pasa de «Borrador» a `FAC-…`), que enviar un borrador avisa de que
 * publica primero, y que un cobro parcial y uno total mueven `paid_status`.
 */

import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";
import { installPimiaMock, type PimiaMockOptions } from "../helpers/pimia";

const SHOTS = "test-results/pimia-facturas-acciones";

async function boot(page: Page, options: PimiaMockOptions = {}) {
  await page.setViewportSize({ height: 1000, width: 1600 });
  await page.addInitScript(() => {
    window.localStorage.setItem("buzz-theme", "buzz");
  });
  await installPimiaMock(page, options);
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pimia-sidebar")).toBeVisible();
}

async function openInvoice(page: Page, id: string) {
  await page.getByTestId("pimia-nav-invoices").click();
  await expect(page.getByTestId("pimia-invoice-list")).toBeVisible();
  await page.getByTestId(`pimia-invoice-open-${id}`).click();
  await expect(page.getByTestId("pimia-invoice-primary-action")).toBeVisible();
}

async function shoot(page: Page, name: string) {
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("publicar pregunta contando lo irreversible, y asigna el número", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "91");

  await expect(page.getByTestId("pimia-invoice-primary-action")).toHaveText(
    /Publicar/,
  );
  await page.getByTestId("pimia-invoice-primary-action").click();

  const dialog = page.getByTestId("pimia-invoice-confirm");
  await expect(dialog).toContainText("VeriFactu");
  await expect(dialog).toContainText("rectificativa");
  await shoot(page, "confirmar-publicar");

  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  // El número lo puso el servidor y la ficha releyó: ya no es «Borrador».
  await expect(page.getByRole("heading", { name: /FAC-\d+/ })).toBeVisible();
  await shoot(page, "publicada");
});

test("enviar un borrador avisa de que publica primero", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "82");
  await page.getByTestId("pimia-invoice-actions-82").click();
  await page
    .getByRole("menuitem", { name: "Publicar y enviar por correo" })
    .click();

  const dialog = page.getByTestId("pimia-invoice-send-dialog");
  await expect(dialog).toContainText("publica primero");
  await expect(dialog).toContainText("VeriFactu");
  await shoot(page, "enviar-borrador");

  await page.getByTestId("pimia-invoice-send-confirm").click();
  await expect(page.getByText("enviada a", { exact: false })).toBeVisible();
  // Publicada y enviada en el mismo gesto: la insignia ya no dice borrador.
  await expect(page.getByText("Enviada", { exact: true })).toBeVisible();
});

test("un cobro parcial deja la deuda a la vista", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "90");

  await expect(page.getByTestId("pimia-invoice-primary-action")).toHaveText(
    /Registrar cobro/,
  );
  await page.getByTestId("pimia-invoice-primary-action").click();

  const dialog = page.getByTestId("pimia-invoice-payment-dialog");
  await expect(dialog).toBeVisible();
  // El importe llega prellenado con lo pendiente.
  await expect(page.locator("#pimia-payment-amount")).toHaveValue("17426,40");
  await shoot(page, "cobro-dialogo");

  await page.locator("#pimia-payment-amount").fill("5000");
  await page.getByTestId("pimia-invoice-payment-confirm").click();
  await expect(page.getByText("Cobro registrado")).toBeVisible();
  await expect(page.getByText("Cobro parcial")).toBeVisible();
  await shoot(page, "cobro-parcial");
});

test("cobrar más de lo pendiente no deja guardar", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "83");
  await page.getByTestId("pimia-invoice-primary-action").click();

  await page.locator("#pimia-payment-amount").fill("999999");
  await expect(
    page.getByTestId("pimia-invoice-payment-confirm"),
  ).toBeDisabled();
  await expect(page.getByText("Es más de lo pendiente")).toBeVisible();
});

test("el cobro total completa la factura", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "83");
  await page.getByTestId("pimia-invoice-primary-action").click();
  // Prellenado con lo pendiente: cobrar tal cual salda la factura.
  await page.getByTestId("pimia-invoice-payment-confirm").click();

  await expect(page.getByText("Cobro registrado")).toBeVisible();
  await expect(page.getByText("Completada", { exact: true })).toBeVisible();
  await expect(page.getByText("Pagada", { exact: true })).toBeVisible();
  await shoot(page, "cobrada");
});

test("un grant sin payments:write lo dice y ofrece reautorizar", async ({
  page,
}) => {
  await boot(page, { staleGrant: true });
  await openInvoice(page, "90");
  await page.getByTestId("pimia-invoice-primary-action").click();

  const dialog = page.getByTestId("pimia-invoice-confirm");
  await expect(dialog).toContainText("payments:write");
  await expect(
    page.getByRole("button", { name: "Volver a autorizar" }),
  ).toBeVisible();
  await shoot(page, "falta-permiso-cobro");
});

test("marcar como enviada un borrador también avisa de la publicación", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "82");
  await page.getByTestId("pimia-invoice-actions-82").click();
  await page.getByRole("menuitem", { name: "Marcar como enviada" }).click();

  const dialog = page.getByTestId("pimia-invoice-confirm");
  await expect(dialog).toContainText("publica");
  await expect(dialog).toContainText("No manda ningún correo");
  await page
    .getByRole("button", { name: "Marcar como enviada", exact: true })
    .click();
  await expect(page.getByText("Marcada como enviada")).toBeVisible();
});

test("duplicar crea un borrador sin número y lleva a él", async ({ page }) => {
  await boot(page);
  await page.getByTestId("pimia-nav-invoices").click();
  await expect(page.getByTestId("pimia-invoice-list")).toBeVisible();
  await page.getByTestId("pimia-invoice-open-88").click();
  // Pagada del todo: no hay primaria, todo vive en el menú.
  await expect(page.getByTestId("pimia-invoice-primary-action")).toHaveCount(0);
  await page.getByTestId("pimia-invoice-actions-88").click();
  await page.getByRole("menuitem", { name: "Duplicar" }).click();
  await expect(page.getByTestId("pimia-invoice-confirm")).toContainText(
    "sin número",
  );
  await page.getByRole("button", { name: "Duplicar", exact: true }).click();

  await expect(page.getByText("Duplicada en un borrador nuevo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Borrador" })).toBeVisible();
  // Y en el borrador la primaria vuelve a ser publicar.
  await expect(page.getByTestId("pimia-invoice-primary-action")).toHaveText(
    /Publicar/,
  );
});
