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

## La anatomía de una ficha

El detalle es el mismo lenguaje en otra forma, y `PimiaEstimateScreen` es el
molde que la factura hereda:

1. **Vuelta a la lista** encima del título.
2. **El número ES el título** (en monoespaciada), con el estado a su lado y el
   cliente debajo; la acción contextual a la derecha.
3. **Dos tarjetas de datos** —documento y cliente— en pares etiqueta-valor,
   igual que el panel de Pimia.
4. **Las líneas** en una tabla: concepto y su descripción apagada, cantidad con
   su unidad, precio, **los impuestos de la línea** y el importe a la derecha.
5. **El desglose** en una caja estrecha a la derecha, alineado con la columna
   del dinero. Cada fila solo sale si el servidor la manda con valor.
6. **Notas**, si las hay.

⛔ **Los impuestos van uno a uno, nunca sumados.** Un presupuesto español lleva
a la vez IVA y **retención de IRPF**, que es negativa: el campo `tax` de la API
es el neto, así que enseñarlo tal cual («Impuestos 150,00 €») esconde los 525
de IVA y los −375 de retención. Todo eso vive resuelto y probado en
`lib/taxes.ts`, con las dos trampas que solo aparecen con datos reales:

- **El `name` ya trae el tipo dentro** (`"IVA 21%"`, no `"IVA"`), así que
  añadirle el `percent` escribe «IVA 21% 21%».
- **Los impuestos pueden vivir en las líneas y no en la cabecera.** Con
  `tax_per_item`, la colección `taxes` del documento viene vacía y el desglose
  se **agrega de las líneas** — que es lo que hace el panel. Sin eso se cae al
  neto y la retención desaparece.

Y en la tabla, el nombre y el importe del impuesto van en **columnas
separadas**: en una sola cadena («IVA 21% 525,00 €») el ojo no encuentra dónde
empieza el dinero, que es justo lo que hay que comparar entre líneas.

**La vara es el panel de Pimia**, no la referencia: la misma pantalla en el
workspace tiene que enseñar **como mínimo** lo que ya enseña el panel del mismo
tenant, o el desarrollador que llegue notará que le falta algo. De ahí salieron
la tarjeta de cliente con email y teléfono, el desglose de impuestos y el
agrupado de miles de `formatCents` (👤 fundador, comparando las dos pantallas
lado a lado).

⚠️ **La ficha no recalcula nada.** Los importes se pintan tal como los devuelve
el servidor, la suma incluida: las invariantes fiscales son suyas y una segunda
aritmética aquí solo serviría para discrepar de la factura de verdad.

Las líneas solo vienen en el `show`, y envueltas en un `when(...)`: por eso
`lines` es `null` («no se pidieron») y no `[]` («no tiene»). Son cosas
distintas y la UI las distingue.

## Las acciones de documento

Lo que la ficha y el menú `…` de la fila **hacen**, aparte de enseñar. Viven
juntas en `ui/PimiaEstimateActions.tsx` y las dos superficies ofrecen lo mismo:
si la lista deja marcar como aceptado y la ficha no, uno aprende que hay que
buscar la acción en el sitio correcto en vez de donde está mirando.

| Acción | Endpoint | Confirma | Permiso |
|---|---|---|---|
| Marcar como enviado / aceptado / rechazado | `POST /estimates/{id}/status` | No | `estimates:write` |
| Duplicar | `POST /estimates/{id}/clone` | Sí | `estimates:write` |
| Convertir en factura | `POST /estimates/{id}/convert-to-invoice` | Sí | `estimates:write` **+ `invoices:write`** |
| Abrir el PDF | `estimate_pdf_url` del recurso | No | ninguno |

**El cuidado es proporcional a lo que cuesta deshacer.** Un estado se cambia sin
preguntar porque se deshace desde el mismo menú. Duplicar y convertir **crean un
documento nuevo** que esta pantalla no puede borrar, así que preguntan. El PDF
solo abre el navegador.

### La acción primaria cambia con el estado

Es el criterio del panel de Pimia: en cada punto del recorrido hay **una sola
cosa** que uno viene a hacer, y esa es la que va en la cabecera. El resto vive
en el `…`.

| Estado | Primaria | Por qué |
|---|---|---|
| Borrador | Marcar como enviado | Todavía no ha salido. |
| Enviado / Visto | Marcar como aceptado | Espera la respuesta del cliente. |
| Aceptado | **Convertir en factura** | El final feliz del documento. |
| Rechazado / Caducado | Duplicar | Volver a presupuestar. |

### Las tres transiciones, y las tres que no

`POST /status` acepta los seis estados; solo se ofrecen **enviado, aceptado y
rechazado**, que son los que decide una persona. `VIEWED` lo pone el cliente al
abrir el enlace, `EXPIRED` lo dicta la fecha de vencimiento y volver a `DRAFT`
sería deshacer un envío que ya salió: ofrecerlos sería dejar mentir sobre hechos
que el sistema ya sabe. Y el estado que el documento **ya tiene** tampoco sale
en el menú — marcarlo otra vez no es una acción.

### ⛔ Convertir obliga a reautorizar

`config/api_guard.php` (`cross_domain_writes`) trata `convert-to-invoice` como
una escritura en **dos** dominios, porque crea una factura de verdad. Por eso
`REQUESTED_SCOPES` (`src-tauri/src/pimia/oauth.rs`) pide ahora también
`invoices:write` — y **añadir un scope no toca los grants ya concedidos**: quien
conectó antes sigue con los suyos hasta que vuelva a autorizar. La ficha lo
comprueba contra `tenant.scopes` antes de prometer nada, y si el servidor
contesta 403 de todas formas, el diálogo lo explica y ofrece «Volver a
autorizar».

> ⚠️ **La API no manda `missing_scope`.** El guard deniega con
> `{"message": "Token lacks the invoices:write scope"}` y nada más — no hay un
> solo `missing_scope` en todo `app/` de factSaas. Sin rescatarlo del texto,
> `PimiaErrorState` nunca llegaba a ofrecer «Volver a autorizar», que es la
> única salida de un permiso que falta. Se rescata en `classify_error`
> (`src-tauri/src/pimia/api.rs`), reconociendo esa forma exacta y ninguna otra.

### ⛔ Enviar no está, y no es un olvido

`POST /estimates/{id}/send` valida `subject`, `body`, `from` y `to` como
**obligatorios**, y `from` es el remitente de verdad del correo
(`SendEstimateMail::build` lo pasa a `->from(...)`). El remitente configurado
del tenant se lee con `GET /company/mail/config`, que el guard mapea al dominio
`settings` — y **`settings:read` no está en el catálogo OAuth**
(`config/oauth.php`). Peor: un scope fuera del catálogo **no da error, se ignora
en silencio** (`ScopeRegistry::parse`), así que pedirlo no arregla nada.

Inventarse el remitente mandaría el correo desde una dirección que el SMTP del
tenant quizá no autoriza: el envío se encola, muere en el worker y el usuario ve
un «enviado» que no fue. **El arreglo está del lado del ERP**, y es pequeño:
hacer `from` opcional en `SendEstimatesRequest` y que lo rellene
`TenantMailSettings::from()`. El remitente es del tenant; no tiene por qué
ponerlo un cliente de la API.

Mientras tanto, «marcar como enviado» cubre el caso real de mandarlo por fuera
(WhatsApp, en mano), que es como salen la mayoría.

> La vista previa (`GET /estimates/{id}/send/preview`) **devuelve HTML, no
> JSON**. El puente Rust (`parse_success_body`) exige JSON, así que enseñarla
> costaría además un camino de texto en Rust y un iframe aislado.

### ⚖️ Borrar no está, y facturas NO lo hereda

Un presupuesto **sí** se puede borrar; una **factura emitida NO** —es ilegal, y
lo que corresponde es una rectificativa—. Esta pantalla es el molde que la
factura hereda, así que el borrar se deja fuera a propósito: meter una acción
que la réplica tiene que quitar es sembrar justo el error que la regla evita.
Cuando entre, entra **solo para borradores**, que es la forma que facturas sí
puede copiar.

Y de paso, la ruta que el brief daba por buena no existe: `DELETE
/estimates/{id}` está **excluida** (`->except(['destroy'])` en
`routes/invoiceshelf_api.php`, con el comentario «el controlador no la
implementa → 500»). El borrado real es `POST /estimates/delete` con `{ids: []}`.

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
| `PimiaEstimateActions` | Las acciones de documento: la primaria que cambia con el estado y el menú `…`, con sus confirmaciones. Es el único de la lista que **no** es puro —usa los hooks de mutación—, y el molde del que saldrá el de facturas. |

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
- **Enviar y borrar.** Los dos por razones concretas, no por falta de tiempo:
  ver *Las acciones de documento* arriba. El resto —estado, duplicar, PDF y
  convertir en factura— ya está.

> **Corregido el 2026-08-08 (segunda vez).** Este apartado decía que las
> acciones de documento se quedaban fuera enteras. Entraron cuatro de las seis
> en el pase de acciones; las dos que faltan tienen su motivo escrito.

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

Las **acciones** tienen su propio spec, `pimia-estimate-actions.spec.ts`, y su
propia carpeta (`test-results/pimia-acciones/`). Separados a propósito: aquel
retrata pantallas y no toca nada, y este abre menús, confirma diálogos y
**cambia estado contra el mock** —mezclarlos colaría un cambio de estado en la
captura de la pantalla anterior—. Además de retratar, comprueba lo que solo se
ve moviéndose: que tras un `POST /status` —que contesta `{success: true}` y no
el documento— la ficha **relee** y la insignia cambia.

⚠️ El mock (`tests/helpers/pimia.ts`) copia **la forma real** también en esto:
`clone` devuelve el recurso nuevo, `convert-to-invoice` devuelve una factura con
`invoice_number: null`, y el 403 de un permiso que falta llega **sin**
`missing_scope`, como el de verdad. `installPimiaMock(page, {staleGrant: true})`
reproduce un grant anterior a `invoices:write`.
