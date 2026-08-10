/**
 * Rectificativas y VeriFactu sobre la ficha de una factura.
 *
 * Spec aparte del de acciones por la misma razón que aquel se separó del de
 * capturas: aquí se crean documentos nuevos y se mueve el estado AEAT contra el
 * mock, y mezclarlo colaría esos cambios en las comprobaciones del otro.
 *
 * Lo central que se comprueba, y que solo se ve moviéndose:
 *
 * - Que la rectificativa **se crea de verdad** (serie R-, importes en negativo)
 *   y la ficha aterriza en ella; y que el 422 de «ya existe» se enseña con el
 *   número que trae dentro, que es el dato útil.
 * - Que **sin registro no se ofrece reintentar**: `error` con y sin registro
 *   son el mismo `aeat_status` y la ficha los separa sondeando el detalle.
 * - Que tras `sync`/`retry` —que NO devuelven la factura— la ficha relee y la
 *   insignia cambia.
 */

import { expect, test, type Page } from "@playwright/test";

import { waitForAnimations } from "../helpers/animations";
import { installMockBridge } from "../helpers/bridge";
import { installPimiaMock } from "../helpers/pimia";

const SHOTS = "test-results/pimia-verifactu";

async function boot(page: Page) {
  await page.setViewportSize({ height: 1000, width: 1600 });
  await page.addInitScript(() => {
    window.localStorage.setItem("buzz-theme", "buzz");
  });
  await installPimiaMock(page);
  await installMockBridge(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pimia-sidebar")).toBeVisible();
}

async function openInvoice(page: Page, id: string) {
  await page.getByTestId("pimia-nav-invoices").click();
  await expect(page.getByTestId("pimia-invoice-list")).toBeVisible();
  await page.getByTestId(`pimia-invoice-open-${id}`).click();
  await expect(page.getByTestId(`pimia-invoice-actions-${id}`)).toBeVisible();
}

async function shoot(page: Page, name: string) {
  await waitForAnimations(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("la rectificativa se crea en negativo y la ficha aterriza en ella", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "90");

  await page.getByTestId("pimia-invoice-actions-90").click();
  await page.getByRole("menuitem", { name: "Crear rectificativa" }).click();

  const dialog = page.getByTestId("pimia-invoice-confirm");
  await expect(dialog).toContainText("factura nueva");
  await expect(dialog).toContainText("en negativo");
  // Lo que más importa del aviso: la original no desaparece.
  await expect(dialog).toContainText("no se toca");
  await shoot(page, "confirmar-rectificativa");

  await page
    .getByRole("button", { name: "Crear rectificativa", exact: true })
    .click();

  // Número oficial ya asignado —la rectificativa no pasa por «borrador»— y la
  // ficha es la suya.
  await expect(page.getByRole("heading", { name: /FAC-R-\d+/ })).toBeVisible();
  await expect(page.getByText("Factura rectificativa")).toBeVisible();
  // Los importes llegan en negativo del servidor y se pintan tal cual.
  await expect(page.getByText("-17.426,40", { exact: false })).toBeVisible();
  await shoot(page, "rectificativa-creada");
});

test("una factura que ya tiene rectificativa lo dice con su número", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "85");

  await page.getByTestId("pimia-invoice-actions-85").click();
  await page.getByRole("menuitem", { name: "Crear rectificativa" }).click();
  await page
    .getByRole("button", { name: "Crear rectificativa", exact: true })
    .click();

  // El 422 del servidor trae dentro el número de la que existe: eso es lo que
  // se enseña, no un texto propio más pobre.
  await expect(page.getByText("FAC-R-000004", { exact: false })).toBeVisible();
  await shoot(page, "rectificativa-ya-existe");
});

test("ni un borrador ni una rectificativa ofrecen rectificar", async ({
  page,
}) => {
  await boot(page);

  await openInvoice(page, "91");
  await page.getByTestId("pimia-invoice-actions-91").click();
  await expect(
    page.getByRole("menuitem", { name: "Crear rectificativa" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openInvoice(page, "84");
  await page.getByTestId("pimia-invoice-actions-84").click();
  await expect(
    page.getByRole("menuitem", { name: "Crear rectificativa" }),
  ).toHaveCount(0);
});

test("una factura aceptada enseña la prueba de la AEAT", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "89");

  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "Aceptada",
  );

  const block = page.getByTestId("pimia-invoice-verifactu");
  await expect(block).toContainText("CSV89QK7MF2R8TP");
  await expect(block).toContainText("Huella");
  await expect(page.getByTestId("pimia-verifactu-qr")).toBeVisible();
  // Aceptada: no hay nada que reintentar ni que refrescar.
  await expect(page.getByTestId("pimia-verifactu-retry")).toHaveCount(0);
  await shoot(page, "aceptada");
});

test("un rechazo enseña el motivo de la AEAT y se reintenta", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "87");

  const block = page.getByTestId("pimia-invoice-verifactu");
  await expect(block).toContainText("La AEAT rechazó");
  // El motivo NO está en la fila de la factura: sale del detalle remoto.
  await expect(block).toContainText("no está identificado en el censo");
  await shoot(page, "rechazada");

  await page.getByTestId("pimia-verifactu-retry").click();
  await expect(page.getByText("Registro reenviado a la AEAT")).toBeVisible();
  // El retry no devuelve la factura: la ficha ha releído para saber esto.
  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "Aceptada",
  );
  await shoot(page, "rechazada-reintentada");
});

test("un error SIN registro no ofrece reintentar, y lo explica", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "85");

  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "Error",
  );
  const block = page.getByTestId("pimia-invoice-verifactu");
  // Mismo `aeat_status` que un rechazo; lo que los separa es el 422 del
  // detalle, y de ahí sale este texto.
  await expect(block).toContainText("no llegó a registrarse");
  await expect(page.getByTestId("pimia-verifactu-retry")).toHaveCount(0);
  await expect(page.getByTestId("pimia-verifactu-sync")).toHaveCount(0);
  await shoot(page, "error-sin-registro");
});

test("un registro en cola solo ofrece sincronizar", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "86");

  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "En cola",
  );
  const block = page.getByTestId("pimia-invoice-verifactu");
  await expect(block).toContainText("registro está en curso");
  await expect(page.getByTestId("pimia-verifactu-retry")).toHaveCount(0);
  await shoot(page, "en-cola");

  await page.getByTestId("pimia-verifactu-sync").click();
  await expect(
    page.getByText("Estado actualizado desde VeriFactu"),
  ).toBeVisible();
  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "Aceptada",
  );
});

test("el alta pendiente dice que la reintenta el ERP, sin botones", async ({
  page,
}) => {
  await boot(page);
  await openInvoice(page, "88");

  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "Pendiente",
  );
  const block = page.getByTestId("pimia-invoice-verifactu");
  await expect(block).toContainText("reintentando por su cuenta");
  // Sin registro, sync y retry contestarían 422: no se ofrecen.
  await expect(page.getByTestId("pimia-verifactu-retry")).toHaveCount(0);
  await expect(page.getByTestId("pimia-verifactu-sync")).toHaveCount(0);
  await shoot(page, "alta-pendiente");
});

test("publicar un borrador estrena su estado en la AEAT", async ({ page }) => {
  await boot(page);
  await openInvoice(page, "91");

  // Un borrador no tiene nada que registrar todavía.
  await expect(page.getByTestId("pimia-invoice-verifactu")).toHaveCount(0);

  await page.getByTestId("pimia-invoice-primary-action").click();
  await page.getByRole("button", { name: "Publicar", exact: true }).click();

  await expect(page.getByRole("heading", { name: /FAC-\d+/ })).toBeVisible();
  await expect(page.getByTestId("pimia-invoice-verifactu")).toBeVisible();
  await expect(page.getByTestId("pimia-verifactu-badge")).toContainText(
    "Aceptada",
  );
  await shoot(page, "publicada-con-verifactu");
});
