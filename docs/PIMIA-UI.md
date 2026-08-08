# El lenguaje visual del ERP en el workspace

Cómo se ven las pantallas de Pimia dentro del fork, qué piezas hay para
componerlas y por qué son esas. Escrito en el pase de diseño del 2026-08-08,
sobre las vistas de la Fase 1 y antes de replicar más módulos.

## Las tres reglas

1. **La referencia son los PATRONES de `shadcnblocks-admin.vercel.app`, jamás su
   código.** Su licencia prohíbe redistribuir sus componentes; los patrones de
   diseño se imitan libremente. Su *Orders List* es la especificación de
   nuestras listas, y sus fichas de detalle la del detalle.
2. **La estética es la de Buzz, con SUS variables.** `bg-background`,
   `text-muted-foreground`, `border-border`… Cero colores propios: ni `#hex` ni
   `oklch()` bajo `features/pimia/`, y hay un grep en la definición de hecho que
   lo comprueba. Los tokens OKLCH del panel Vue **no viven aquí**.
3. **Vistas y hooks de datos puros.** El puente Tauri está confinado en
   `features/pimia/api/` y `usePimiaAuth`; nada bajo `ui/` importa de `tauri*`
   ni de `relay*`. Lo vigila `scripts/check-pimia-boundary.mjs` dentro de
   `pnpm check`.

## La anatomía de una lista

De arriba abajo, y en este orden:

1. **Cabecera** — título, descripción de una línea, acción primaria a la
   derecha.
2. **Pestañas de estado** — la partición natural del listado, subrayadas.
3. **Fila de filtros** — búsqueda (rebotada, contra la API) y el resto de
   filtros.
4. **Tabla densa** — dentro de un marco `rounded-lg border`: cabeceras
   apagadas de 40 px, filas de 49 px, importes a la derecha en `tabular-nums`,
   estado como insignia semántica.
5. **Pie** — el total en pantalla cuando hay dinero, y el recuento con la
   navegación de páginas.

El detalle es el mismo lenguaje en otra forma: identidad y acciones arriba,
secciones tituladas debajo, metadatos como pares etiqueta-valor.

## Los ladrillos

Viven en `desktop/src/features/pimia/ui/`. Son los primeros del registro que la
réplica de facturas va a heredar; ninguno sabe de dónde salen los datos.

| Componente | Qué hace |
|---|---|
| `PimiaPageHeader` | La cabecera de una pantalla: título (30 px medium), descripción, acción primaria a la derecha y, opcionalmente, migas encima e insignias junto al título. |
| `PimiaStatusBadge` | Una insignia de estado con punto de color, por **tono semántico** (`neutral`/`info`/`success`/`warning`/`danger`), no por documento. Trae el mapa de estados de presupuesto (`ESTIMATE_STATUS_META`); facturas añadirá el suyo al lado. |
| `PimiaAmountCell` | La celda de importe: céntimos → euros por `lib/money`, a la derecha y en `tabular-nums`. `PimiaAmount`, en el mismo fichero, es el importe suelto para fichas y totales. |
| `PimiaFilterBar` | La fila de filtros: búsqueda con lupa, filtros extra como hijos y acciones al final. |
| `PimiaStatusTabs` | Las pestañas de estado subrayadas, compuestas sobre el bloque `tabs` de Buzz sin tocar el primitivo. |
| `PimiaPagination` | El pie de una tabla: rango y total (`lib/pagination.describeRange`, con tests) y la navegación entre páginas. |
| `PimiaStates` | Sin conectar, cargando, error y vacío. El esqueleto tiene la forma de la tabla que va a sustituir, y el vacío ofrece la primera acción cuando la hay. |

Un primitivo que falte se añade **por la vía estándar de shadcn**
(`pnpm dlx shadcn@latest add <x>`, que aterriza en `@/shared/ui` ya tematizado).
Así entró `table`: un fichero, cero dependencias nuevas.

## Lo que a propósito NO se hizo

- **Cabeceras ordenables.** La referencia las tiene; la API de Pimia no acepta
  criterio de orden y ordenar solo la página visible mentiría sobre el
  conjunto. Cuando el servidor ordene, la cabecera ya tiene sitio.
- **Selects de fecha en la fila de filtros.** Mismo motivo: `GET /estimates`
  admite `page`, `limit`, `search`, `customer_id` y `status`, y nada más.
- **Acción primaria en Presupuestos.** Un presupuesto se emite desde la ficha
  de su cliente, así que la cabecera de la lista no tiene qué ofrecer; la
  invitación vive en el estado vacío («Elegir un cliente»).

## Cómo se mira

`desktop/tests/e2e/pimia-screens-screenshots.spec.ts` retrata las cinco
pantallas en claro y oscuro con datos del mock del ERP
(`tests/helpers/pimia.ts`), sin depender de que nadie tenga el llavero abierto:

```bash
pnpm -C desktop build:e2e
PLAYWRIGHT_BROWSERS_PATH=/Volumes/data512/.toolchains/ms-playwright \
  pnpm -C desktop exec playwright test tests/e2e/pimia-screens-screenshots.spec.ts --project=smoke
```

Las capturas salen en `desktop/test-results/pimia/`. Las del antes y el después
de este pase están en `docs/assets/screenshots/pimia-*`.
