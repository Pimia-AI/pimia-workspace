/**
 * Las dos barras y su estado independiente.
 *
 * Es la disposición del plan (Fase 1): la navegación del ERP a la izquierda y
 * la de Buzz —canales, DM, agentes— a la derecha. El riesgo que este spec
 * cubre es el que la Fase 0 dejó señalado: el bloque `sidebar` de shadcn está
 * escrito para UNA barra, con las claves de cookie, `localStorage` y atajo como
 * constantes de módulo. Si alguien revierte la parametrización por `scope`, las
 * dos barras vuelven a compartir estado y estas pruebas se caen.
 */
import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import {
  BUZZ_SIDEBAR_TEST_ID,
  dragSidebarRail,
  PIMIA_SIDEBAR_TEST_ID,
} from "../helpers/sidebar";

const PIMIA_SIDEBAR = '[data-testid="pimia-sidebar"]';
const BUZZ_SIDEBAR = '[data-testid="app-sidebar"]';

test("cada barra vive en su lado", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");

  const pimia = page.locator(PIMIA_SIDEBAR);
  const buzz = page.locator(BUZZ_SIDEBAR);
  await expect(pimia).toBeVisible();
  await expect(buzz).toBeVisible();

  // `data-side` vive en el contenedor del bloque `Sidebar`, encima del panel.
  await expect(
    pimia.locator("xpath=ancestor::*[@data-side][1]"),
  ).toHaveAttribute("data-side", "left");
  await expect(
    buzz.locator("xpath=ancestor::*[@data-side][1]"),
  ).toHaveAttribute("data-side", "right");

  const pimiaBox = await pimia.boundingBox();
  const buzzBox = await buzz.boundingBox();
  expect(pimiaBox).not.toBeNull();
  expect(buzzBox).not.toBeNull();
  expect(pimiaBox?.x ?? 0).toBeLessThan(buzzBox?.x ?? 0);
});

test("plegar una barra no toca la otra", async ({ page }) => {
  // La ventana por defecto de los e2e (1280) está por debajo de
  // PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX, así que la barra del ERP arrancaría
  // plegada. Este test prueba su comportamiento desplegada.
  await page.setViewportSize({ height: 900, width: 1600 });
  await installMockBridge(page);
  await page.goto("/");

  const pimiaRoot = page.locator('[data-side="left"][data-state]');
  const buzzRoot = page.locator('[data-side="right"][data-state]');
  await expect(pimiaRoot).toHaveAttribute("data-state", "expanded");
  await expect(buzzRoot).toHaveAttribute("data-state", "expanded");

  // El botón del chrome es el de Buzz: se fue a la derecha con la barra.
  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .click();
  await expect(buzzRoot).toHaveAttribute("data-state", "collapsed");
  await expect(pimiaRoot).toHaveAttribute(
    "data-state",
    "expanded",
    // El fallo que este spec existe para atrapar.
  );

  // Y al revés: la barra del ERP trae su propio interruptor.
  await page.getByTestId("pimia-sidebar-trigger").click();
  await expect(pimiaRoot).toHaveAttribute("data-state", "collapsed");
  await expect(buzzRoot).toHaveAttribute("data-state", "collapsed");

  await page
    .getByRole("button", { name: "Toggle Sidebar", exact: true })
    .click();
  await expect(buzzRoot).toHaveAttribute("data-state", "expanded");
  await expect(pimiaRoot).toHaveAttribute("data-state", "collapsed");
});

test("cada barra recuerda su propia anchura", async ({ page }) => {
  // La ventana por defecto de los e2e (1280) está por debajo de
  // PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX, así que la barra del ERP arrancaría
  // plegada. Este test prueba su comportamiento desplegada.
  await page.setViewportSize({ height: 900, width: 1600 });
  await page.addInitScript(() => {
    window.localStorage.setItem("buzz-sidebar-width", "360");
    window.localStorage.setItem("pimia-workspace-sidebar-width", "220");
  });
  await installMockBridge(page);
  await page.goto("/");

  const pimia = page.locator(PIMIA_SIDEBAR);
  const buzz = page.locator(BUZZ_SIDEBAR);
  await expect(pimia).toBeVisible();
  await expect(buzz).toBeVisible();

  // Anchuras distintas leídas de claves distintas de localStorage: con una sola
  // `--sidebar-width` compartida, las dos medirían lo mismo.
  expect(Math.round((await pimia.boundingBox())?.width ?? 0)).toBe(220);
  expect(Math.round((await buzz.boundingBox())?.width ?? 0)).toBe(360);
});

test("la barra del ERP colapsa a iconos, no fuera de pantalla", async ({
  page,
}) => {
  // La ventana por defecto de los e2e (1280) está por debajo de
  // PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX, así que la barra del ERP arrancaría
  // plegada. Este test prueba su comportamiento desplegada.
  await page.setViewportSize({ height: 900, width: 1600 });
  await installMockBridge(page);
  await page.goto("/");

  const pimia = page.locator(PIMIA_SIDEBAR);
  await expect(pimia).toBeVisible();

  await page.getByTestId("pimia-sidebar-trigger").click();
  await expect(page.locator('[data-side="left"][data-state]')).toHaveAttribute(
    "data-state",
    "collapsed",
  );

  // Sigue ocupando la rejilla de iconos: es la nav primaria y no puede quedarse
  // sin una superficie desde la que volver a abrirla. Se sondea porque el
  // plegado va con transición CSS (200 ms) y medir al vuelo la coge a medias.
  await expect
    .poll(async () => Math.round((await pimia.boundingBox())?.width ?? 0))
    .toBe(48);
  await expect(page.getByTestId("pimia-sidebar-trigger")).toBeVisible();
});

test("la nav del ERP lleva a sus módulos", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");

  await page.getByTestId("pimia-nav-customers").click();
  await expect(page).toHaveURL(/\/pimia\/clientes$/);

  await page.getByTestId("pimia-nav-estimates").click();
  await expect(page).toHaveURL(/\/pimia\/presupuestos$/);

  await page.getByTestId("pimia-nav-overview").click();
  await expect(page).toHaveURL(/\/pimia$/);
});

test("en una ventana estrecha el ERP se pliega solo", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1600 });
  await installMockBridge(page);
  await page.goto("/");

  const pimia = page.locator(PIMIA_SIDEBAR);
  await expect(pimia).toBeVisible();
  await expect
    .poll(async () => Math.round((await pimia.boundingBox())?.width ?? 0))
    .toBeGreaterThan(48);

  // Con dos barras abiertas el contenido paga 548 px de cromo. Por debajo de
  // PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX la nav del ERP devuelve 200 px al
  // contenido en vez de ahogar el hilo de mensajes o la hoja de gestión.
  await page.setViewportSize({ height: 720, width: 820 });
  await expect
    .poll(async () => Math.round((await pimia.boundingBox())?.width ?? 0))
    .toBe(48);

  // Y los recupera al volver a haber sitio.
  await page.setViewportSize({ height: 900, width: 1600 });
  await expect
    .poll(async () => Math.round((await pimia.boundingBox())?.width ?? 0))
    .toBeGreaterThan(48);
});

/**
 * El rail ensancha hacia fuera en las dos barras.
 *
 * Con una sola barra a la izquierda, «arrastrar a la derecha» y «ensanchar» eran
 * lo mismo, y los tests podían confundirlos sin coste. Con Buzz a la derecha ya
 * no: el mismo gesto la estrecha. El spec de la barra de Buzz se cayó por
 * exactamente esto —esperaba 364 y recibía 236, o sea 300 menos el arrastre en
 * vez de más—, así que la dirección se cubre aquí, en el proyecto que corre sin
 * relay ni base de datos.
 */
test("el rail ensancha cada barra hacia fuera, no hacia dentro", async ({
  page,
}) => {
  // 1600 como el test de anchuras: por debajo del breakpoint compacto la barra
  // del ERP arranca plegada y su rail va deshabilitado.
  await page.setViewportSize({ height: 900, width: 1600 });
  await installMockBridge(page);
  await page.goto("/");

  const width = async (selector: string) =>
    Math.round((await page.locator(selector).boundingBox())?.width ?? 0);

  const buzzBefore = await width(BUZZ_SIDEBAR);
  await dragSidebarRail(page, 64, BUZZ_SIDEBAR_TEST_ID);
  await expect.poll(() => width(BUZZ_SIDEBAR)).toBe(buzzBefore + 64);

  // La del ERP vive a la izquierda: el puntero va al revés y el resultado, igual.
  const pimiaBefore = await width(PIMIA_SIDEBAR);
  await dragSidebarRail(page, 48, PIMIA_SIDEBAR_TEST_ID);
  await expect.poll(() => width(PIMIA_SIDEBAR)).toBe(pimiaBefore + 48);
});
