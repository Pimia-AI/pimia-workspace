/**
 * Arrastrar el rail de una barra, sabiendo de qué lado vive.
 *
 * Divergencia Pimia. El bloque `sidebar` de shadcn está escrito para UNA barra
 * a la izquierda, y el shell monta DOS: el ERP a la izquierda y Buzz a la
 * derecha. Eso rompe dos supuestos de cualquier test que arrastre un rail:
 *
 * 1. `[data-sidebar="rail"]` sin acotar resuelve a **dos** elementos, y
 *    Playwright aborta por modo estricto. Se acota por el `data-testid` de la
 *    barra, de cuyo nodo el rail es descendiente.
 * 2. Un arrastre hacia la derecha ensancha una barra izquierda pero
 *    **estrecha** una derecha. El signo del puntero se deduce del `data-side`
 *    que publica el primitivo, en vez de darlo por supuesto: así quien llama
 *    razona en anchura —lo que quiere comprobar— y esto sigue valiendo si una
 *    barra cambia de lado.
 */
import { expect, type Page } from "@playwright/test";

/** `data-testid` de cada barra del shell. */
export const BUZZ_SIDEBAR_TEST_ID = "app-sidebar";
export const PIMIA_SIDEBAR_TEST_ID = "pimia-sidebar";

/**
 * Arrastra el rail de la barra `testId` para cambiar su anchura en
 * `widthDelta` píxeles: **positivo ensancha**, en los dos lados.
 */
export async function dragSidebarRail(
  page: Page,
  widthDelta: number,
  testId: string = BUZZ_SIDEBAR_TEST_ID,
) {
  const sidebar = page.getByTestId(testId);
  const rail = sidebar.locator('[data-sidebar="rail"]');
  await expect(rail).toBeVisible();
  await expect(rail).toBeEnabled();

  // `data-side` vive en el contenedor del bloque `Sidebar`, encima del panel:
  // el mismo camino que usa `dual-sidebars.spec.ts` para comprobar los lados.
  const side = await sidebar
    .locator("xpath=ancestor-or-self::*[@data-side][1]")
    .getAttribute("data-side");
  const pointerDirection = side === "right" ? -1 : 1;

  const box = await rail.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + widthDelta * pointerDirection, startY, {
    steps: 8,
  });
  await page.mouse.up();
}
