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

La referencia concreta es su **`invoice-list-2`** (👤 fundador: «la podemos
aprovechar para el listado de facturas»). De arriba abajo, y en este orden:

1. **Cabecera** — título, descripción de una línea, acción primaria a la
   derecha.
2. **Tira de cifras** — cuatro recuentos en una caja dividida, que es lo que
   contesta «¿cómo voy?» antes de leer una sola fila.
3. **Pestañas de estado** — la partición natural del listado, subrayadas.
4. **Fila de filtros** — los filtros a la izquierda y la búsqueda al final
   (cuando no hay filtros, la búsqueda se queda al principio en vez de
   descolgarse sola a la derecha).
5. **Tabla densa** — dentro de un marco `rounded-lg border`: cabeceras
   apagadas de 40 px que **ordenan contra el servidor**, filas de 57 px,
   importes a la derecha en `tabular-nums` con su base debajo, estado como
   insignia semántica y un menú `…` de acciones por fila.
6. **Pie** — el total en pantalla cuando hay dinero, el recuento, cuántas filas
   por página y la navegación.

El detalle es el mismo lenguaje en otra forma: identidad y acciones arriba,
secciones tituladas debajo, metadatos como pares etiqueta-valor.

### Lo que el servidor sabe hacer, y hay que usar

`applyFilters` del modelo `Estimate` (y sus hermanos) acepta **`search`,
`status`, `customer_id`, `from_date`/`to_date` y `orderByField`/`orderBy`**. O
sea: **filtrar por fecha y ordenar son server-side**, y así el orden vale para
las 129 filas del tenant y no para las 25 que se están viendo. Ordenar solo la
página visible es la clase de mentira que hace desconfiar de una tabla entera.

Dos trampas comprobadas contra la API real:

- **`from_date` y `to_date` van juntas o no van**: el servidor solo entra en el
  filtro de rango si tiene las dos, y con una sola la ignora en silencio.
- ⛔ **`meta.<recurso>_total_count` NO respeta los filtros.** El controlador lo
  calcula con un `count()` aparte: con un estado seleccionado sigue diciendo
  129 mientras la lista enseña 48. El total bueno para el pie es el `total`
  **del paginador**; aquel solo vale para «cuántos hay en total». Está aislado
  en `readCompanyCount()` con el aviso puesto.

## Los ladrillos

Viven en `desktop/src/features/pimia/ui/`. Son los primeros del registro que la
réplica de facturas va a heredar; ninguno sabe de dónde salen los datos.

| Componente | Qué hace |
|---|---|
| `PimiaPageHeader` | La cabecera de una pantalla: título (30 px medium), descripción, acción primaria a la derecha y, opcionalmente, migas encima e insignias junto al título. |
| `PimiaStatCards` | La tira de cifras sobre una lista. No calcula nada: se le pasan números que el servidor haya dicho, y una raya cuando no se saben. |
| `PimiaSortableHead` | Cabecera que ordena **contra el servidor**, con su flecha de dirección. |
| `PimiaStatusBadge` | Una insignia de estado con punto de color, por **tono semántico** (`neutral`/`info`/`success`/`warning`/`danger`), no por documento. Trae el mapa de estados de presupuesto (`ESTIMATE_STATUS_META`); facturas añadirá el suyo al lado. |
| `PimiaAmountCell` | La celda de importe: céntimos → euros por `lib/money`, a la derecha y en `tabular-nums`. `PimiaAmount`, en el mismo fichero, es el importe suelto para fichas y totales. |
| `PimiaFilterBar` | La fila de filtros: búsqueda con lupa, filtros extra como hijos y acciones al final. |
| `PimiaStatusTabs` | Las pestañas de estado subrayadas, compuestas sobre el bloque `tabs` de Buzz sin tocar el primitivo. |
| `PimiaPagination` | El pie de una tabla: rango y total (`lib/pagination.describeRange`, con tests), cuántas filas por página y la navegación. |
| `PimiaStates` | Sin conectar, cargando, error y vacío. El esqueleto tiene la forma de la tabla que va a sustituir, y el vacío ofrece la primera acción cuando la hay. |

Además, `lib/dateRanges.ts` traduce el desplegable de fechas a
`from_date`/`to_date` (probado: trimestres, meses de 30 y 31 días y el cambio
de año).

Un primitivo que falte se añade **por la vía estándar de shadcn**
(`pnpm dlx shadcn@latest add <x>`, que aterriza en `@/shared/ui` ya tematizado).
Así entraron `table` (cero dependencias nuevas) y `select`
(`@radix-ui/react-select`, de la misma familia que las que ya había).

## Lo que a propósito NO se hizo

- **Acción primaria en Presupuestos.** Un presupuesto se emite desde la ficha
  de su cliente, así que la cabecera de la lista no tiene qué ofrecer; la
  invitación vive en el estado vacío («Elegir un cliente»).
- **Cifras de dinero en la tira de arriba.** La referencia enseña importes
  («Past-due balance»); la API de Pimia no publica ningún agregado de dinero de
  presupuestos, y sumar una página para llamarlo total es exactamente el bug
  que este pase quitó del panel. Van recuentos hasta que el servidor sume.
- **Detalle de un presupuesto.** No existe desde la Fase 1. Por eso el menú `…`
  solo ofrece acciones que hoy hacen algo: un «ver detalle» en gris sería el
  mismo señuelo que una fila que se resalta y no abre nada.

> **Corregido el 2026-08-08.** Este apartado decía que las cabeceras ordenables
> y el filtro de fechas eran imposibles «porque la API no los acepta». Era
> falso: `applyFilters` los soporta desde siempre. Se comprobó leyendo el
> controlador en `factSaas` y contra el tenant real. Están implementados.

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
