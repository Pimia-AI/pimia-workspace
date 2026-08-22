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
| **Enviar por correo** | `POST /estimates/{id}/send` | **Diálogo** | `estimates:write` |
| Duplicar | `POST /estimates/{id}/clone` | Sí | `estimates:write` |
| Convertir en factura | `POST /estimates/{id}/convert-to-invoice` | Sí | `estimates:write` **+ `invoices:write`** |
| Abrir el PDF | `estimate_pdf_url` del recurso | No | ninguno |

**El cuidado es proporcional a lo que cuesta deshacer.** Un estado se cambia sin
preguntar porque se deshace desde el mismo menú. Duplicar y convertir **crean un
documento nuevo** que esta pantalla no puede borrar, así que preguntan. El PDF
solo abre el navegador. Y **enviar sale de la app hacia una persona real**: no
pregunta «¿seguro?» —una pregunta que nadie lee—, abre un diálogo donde se ve
**qué** se manda y **a quién**.

### La acción primaria cambia con el estado

Es el criterio del panel de Pimia: en cada punto del recorrido hay **una sola
cosa** que uno viene a hacer, y esa es la que va en la cabecera. El resto vive
en el `…`.

| Estado | Primaria | Por qué |
|---|---|---|
| Borrador | **Enviar** | Todavía no ha salido. |
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
> solo `missing_scope` en todo el núcleo. Sin rescatarlo del texto,
> `PimiaErrorState` nunca llegaba a ofrecer «Volver a autorizar», que es la
> única salida de un permiso que falta. Se rescata en `classify_error`
> (`src-tauri/src/pimia/api.rs`), reconociendo esa forma exacta y ninguna otra.

### Enviar, y el remitente que no se pide

El diálogo (`PimiaEstimateSendDialog`) enseña **destinatario, asunto y mensaje**,
los tres editables, con el aviso de que el correo sale ya. El destinatario viene
del email del cliente y el mensaje de la plantilla de la empresa.

**El remitente no es un campo, y eso es la mitad de la historia.** `from` es el
remitente real del mensaje y es una propiedad de la instancia, no del envío.
Hasta el 2026-08-09 la API lo exigía a quien llamaba — un dato que **ningún
grant OAuth podía leer**, porque `GET /company/mail/config` cae en el dominio
`settings` y `settings:read` no está en el catálogo del Authorization Server, y
un scope fuera del catálogo **se ignora en silencio**. Con
eso, «enviar» era literalmente imposible desde fuera del panel.

Se arregló en el núcleo: lo pone el servidor
con el remitente configurado de la instancia, y el que mande un cliente
**se ignora** —
respetarlo dejaba mandar correo desde cualquier dirección por el SMTP de la
empresa, con su SPF y su DKIM. Por eso este código **no manda `from`**: añadirlo
no rompería nada, pero sería prometer una elección que no existe.

⚠️ **La plantilla sale de `GET /bootstrap`, no de `/company/settings`**, por lo
mismo: aquello es dominio `settings`, esto es `meta`, que lee cualquier token.
El precio es que `/bootstrap` devuelve el mundo entero, así que se pide **solo
al abrir el diálogo** y se cachea. El cuerpo es **HTML con marcadores**
(`{COMPANY_NAME}`, `{ESTIMATE_NUMBER}`…) que sustituye el servidor al enviar
(`Estimate::getEmailBody`): se enseñan tal cual, como en el panel, porque
resolverlos aquí daría un texto distinto del que el servidor va a componer.

⚠️ El 200 significa **«aceptado para enviar»**, no «entregado»: el correo se
encola (`App\Jobs\SendDocumentMail`). El aviso lo dice así.

«Marcar como enviado» **sigue** en el menú, y no sobra: la mayoría de los
presupuestos salen por WhatsApp o en mano, y registrar eso no es lo mismo que
mandar un correo.

> La vista previa (`GET /estimates/{id}/send/preview`) **devuelve HTML, no
> JSON**. El puente Rust (`parse_success_body`) exige JSON, así que enseñarla
> costaría un camino de texto en Rust y un iframe aislado. Sigue sin hacerse.

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

## La réplica de facturas

Las pantallas de facturas (`PimiaInvoicesScreen`, `PimiaInvoiceScreen`,
`PimiaInvoiceList`) son el molde de presupuestos aplicado, en el mismo orden:
**primero las vistas, las acciones en su propio pase**. Lo que una factura
tiene y un presupuesto no, y cómo lo enseña la UI:

- ⛔ **Un borrador NO tiene número.** `invoice_number` se asigna al **publicar**
  (`ChangeInvoiceStatusController`), que además registra la factura en
  VeriFactu/AEAT y descuenta stock. La lista dice «Sin numerar» y la ficha
  titula «Borrador» — no se finge un identificador que aún no existe. Marcar
  como enviada un borrador **publica primero** (auto-publish del controlador).
- **Dos ejes de estado, dos insignias.** `status` (borrador → publicada →
  enviada → vista → completada) y `paid_status` (pendiente → parcial → pagada)
  son independientes; en la API se filtran por claves distintas y **se
  combinan** (pestañas para el estado, un `Select` para el cobro). A un
  borrador no se le pinta insignia de cobro: no se le debe nada.
- **`DUE` y `OVERDUE` son filtros virtuales del servidor** (valores de
  `status`): las cifras de «pendientes» y «vencidas» salen de ahí, y el
  vencimiento no se recalcula en el cliente — `overdue` viene del recurso.
- **El desglose termina en «Pendiente de cobro»** (`due_amount`), que es la
  pregunta de una factura. Solo cuando la deuda no es ni cero ni el total:
  en esos dos casos el total y la insignia ya lo dicen.
- **Las rectificativas** (`is_credit_note`) viven en el mismo índice: se
  señalan junto al número, con sus importes en negativo tal como llegan.
- ⚖️ **Sin borrar, y aquí ni entrará para emitidas**: una factura emitida no se
  borra, se rectifica. Si algún día entra, será solo para borradores.

### Las acciones de la factura

Mismo molde que las del presupuesto (`PimiaInvoiceActions`): ficha y fila
ofrecen lo mismo, la primaria cambia con el recorrido (borrador→**Publicar**,
publicada→**Enviar**, con deuda→**Registrar cobro**; pagada del todo, solo el
menú), y el cuidado es proporcional a lo que cuesta deshacer.

| Acción | Endpoint | Confirma | Permiso |
|---|---|---|---|
| **Publicar** | `POST /invoices/{id}/status` (PUBLISHED) | Diálogo ⛔ | `invoices:write` |
| Enviar por correo | `POST /invoices/{id}/send` | Diálogo | `invoices:write` |
| Marcar como enviada | `POST /invoices/{id}/status` (SENT) | Diálogo | `invoices:write` |
| **Registrar cobro** | `POST /payments` | Diálogo | **`payments:write`** |
| **Crear rectificativa** | `POST /invoices/{id}/credit-note` | Sí | `invoices:write` |
| Duplicar | `POST /invoices/{id}/clone` | Sí | `invoices:write` |
| Abrir el PDF | `invoice_pdf_url` | No | ninguno |

- ⛔ **Publicar es lo irreversible de verdad**: número oficial + VeriFactu
  (AEAT). El diálogo lo cuenta, incluido que los errores posteriores se
  corrigen con rectificativa. **Enviar o marcar-enviada un borrador publica
  primero** (auto-publish del controlador) y los dos diálogos lo avisan.
- **Registrar cobro** escribe en el dominio `payments` (decisión 👤 2026-08-10:
  entra con el scope ya en `REQUESTED_SCOPES`). El `payment_number` no se pide
  —lo genera el servidor, sin carrera— y `due_amount`/`paid_status` los
  recalcula él. Importe prellenado con lo pendiente. Grant viejo → «Falta un
  permiso» + reautorizar.

  ⚖️ **El tope del importe es del SERVIDOR, y lo de la pantalla es cortesía.**
  `PaymentRequest` rechaza con un 422 cualquier cobro por encima de la deuda —y
  hace bien: sin ese tope, `subtractInvoicePayment` dejaría `due_amount` en
  negativo—. La pantalla se adelanta para no gastar un viaje, pero **solo puede
  avisar de lo que sabe**: el tope sale de `lib/payments.paymentCeiling`, que
  distingue tres casos —la deuda (el bueno), el total de la factura (un techo
  cierto, cuando no se pudo leer la deuda) y **no saberlo**—. En el tercero la
  pantalla **lo dice** en vez de callarse, que es lo que hacía antes: la
  comparación era `amount > dueCents` y con `null` daba `false`, o sea que el
  tope se apagaba solo justo en la pantalla que promete no dejar cobrar de más.
  Nunca bloquea por no saber: quien decide es el servidor.
- Sin PDF hasta publicar: sin hash, el documento no existe hacia fuera.
- Borrar no está, y aquí ni entrará para emitidas: **su lugar lo ocupa la
  rectificativa**.

Los impuestos y las líneas tienen la misma forma de cable que en presupuestos:
`api/invoices.ts` reutiliza los normalizadores de `api/estimates.ts` — las
trampas del IVA + IRPF viven en un solo sitio.

### ⚖️ La rectificativa, que es lo que sustituye a borrar

Una factura emitida no se borra: se corrige emitiendo otra que la anula. Por eso
«Crear rectificativa» ocupa en el menú el sitio donde en presupuestos habría un
«Eliminar», y por eso se ofrece exactamente donde el servidor la acepta —**una
emitida que no sea ya una rectificativa**—, que son dos de las tres puertas de
`CreditNoteController`.

Lo que crea el servidor (`Invoice::createCreditNote`), y que el diálogo cuenta
sin adornar: una **factura nueva** de la serie `R-` con su **número oficial ya
asignado** —no pasa por «borrador»—, las mismas líneas e impuestos **en
negativo**, `SENT` + `PAID` con deuda cero, enlazada a la original
(`rectified_invoice_id`, tipo AEAT `R1`). La original **no se toca**. Al crearla
la ficha aterriza en ella, como al duplicar.

> ⛔ **La tercera puerta no se puede saber desde fuera.** Solo puede haber una
> rectificativa por factura, y el recurso no dice si ya existe. Así que se
> ofrece y se enseña lo que conteste: el 422 trae dentro el número de la que
> existe («Ya existe una factura rectificativa para esta factura
> (FAC-R-000004)»), que es más útil que cualquier texto propio. Ojo al detalle
> del cable: ese controlador responde con la clave `error`, no `message` — el
> puente Rust rescata las dos, así que llega igual.

⚖️ **Sin cuota, a propósito**: la ruta va sin `enforce.plan` porque emitir una
rectificativa es una obligación legal, no una funcionalidad de pago. Cuenta para
el contador del mes (es una fila de `invoices`) pero nunca se bloquea.

> ⚠️ **Y una cosa que el ERP hoy NO hace: la rectificativa no se registra en
> VeriFactu.** `createCreditNote` la inserta directamente como `SENT`, y el
> único sitio que registra en la AEAT es la transición a `PUBLISHED`
> (`ChangeInvoiceStatusController::registerInVeriFactu`). Nace, por tanto, sin
> `aeat_status` — y la ficha no le pinta bloque VeriFactu, que es lo honesto:
> enseñar uno vacío sería fingir un alta que no ocurrió. El arreglo es del lado
> del ERP, no de aquí.

## VeriFactu en la ficha

El estado del registro en la AEAT es un **tercer eje**, ni el del documento ni
el del cobro, y vive en `aeat_status` con su prueba (`aeat_csv`, `hash`,
`qr_data`) — los cuatro ya vienen en `InvoiceResource`, así que la ficha no pide
nada extra para enseñarlo.

- **La insignia va en la cabecera**, junto a las otras dos, y es la única: el
  bloque de abajo no la repite. Etiquetas y tonos son **los del panel**
  (`helpers/invoice-status.js`), para que la misma factura no se vea «Rechazada»
  en rojo en un sitio y en ámbar en el otro.
- **Dónde va el bloque lo decide la urgencia** (`isAeatUrgent`): un rechazo o un
  error suben justo bajo la cabecera, porque son lo más importante de la página;
  lo que salió bien baja con las notas, porque es prueba documental. Es el
  criterio del panel, que reserva su bloque tintado para el fallo.
- **El motivo del rechazo no está en la factura**: sale de
  `GET /invoices/{id}/verifactu/detail`, que consulta la API de VeriFactu. Se
  pide **solo en los estados de fallo** —es una llamada de red hacia fuera— y
  su `aeat_response` puede llegar como objeto o como cadena; se aplana a texto.

### ⛔ Sin registro no hay nada que reintentar

La regla que gobierna qué botones salen. `detail`, `sync` y `retry` contestan
**422 «Invoice not registered in VeriFactu»** cuando la factura no tiene
`verifactu_record_id`, y eso pasa en más casos de los que parece:

| `aeat_status` | ¿Hay registro? | Qué se ofrece |
|---|---|---|
| `accepted` (+ `_with_warnings`) | Sí | Nada: solo la prueba (CSV, huella, QR) |
| `queued`, `sent` | Sí | **Sincronizar** — está en vuelo y el estado local puede ser viejo |
| `rejected` | Sí | **Reintentar** + Sincronizar, con la respuesta de la AEAT |
| `error` | **Depende** | Se sondea antes de ofrecer nada |
| `pending` | No | Nada: el ERP lo reintenta solo, y se dice |
| `sandbox_only` | No | Nada: el plan no llega a producción |
| `not_applicable` / vacío | — | El bloque no aparece |

**`error` es ambiguo del servidor y hay que sondearlo.** Lo escriben dos sitios
distintos: la AEAT rechazando un registro que existe, y el job
`RetryVeriFactuRegistration` al agotar sus reintentos **sin llegar a crearlo**.
La fila queda idéntica en los dos casos. Lo único que los distingue es el 422 de
`/verifactu/detail`, así que la ficha lo pide y, mientras no conteste, no promete
un botón que iría a fallar. Con registro ofrece reintentar; sin él explica que
el alta no ocurrió y no ofrece nada, porque no hay nada que hacer desde aquí.

⚠️ **Si el sondeo se cae** (red, o la API de VeriFactu apagada), se asume que
**sí** hay registro y se ofrecen las acciones. Ante la duda, esconder el
reintento deja al usuario sin la única salida de un rechazo; como mucho, el 422
se lo cuenta un aviso. Es la misma elección del panel, que trata el detalle
como *best-effort* y deja el bloque de fallo en pie pase lo que pase.

### Una diferencia deliberada con el panel

El panel Vue solo enseña los botones **en los estados de fallo**, así que una
factura atascada en «En cola» no tiene desde dónde refrescarse. Aquí
**«Sincronizar» sale también en vuelo** (`queued`, `sent`): releer el estado no
cambia nada en la AEAT —solo trae lo que ya hay— y es justo cuando el dato local
puede estar viejo. Reintentar, en cambio, sigue siendo solo del fallo: reenviar
un registro aceptado no es una acción, es un error.

Y VeriFactu **no está en el menú `…`**, que es la única vez que la ficha y la
fila no ofrecen lo mismo. La razón: sus acciones dependen de un estado que solo
se ve en la ficha —y de un sondeo que solo allí se hace—, así que ofrecerlas
desde una fila sería pedir a ciegas.

## Los ladrillos

Viven en `desktop/src/features/pimia/ui/`. Son los primeros del registro que la
réplica de facturas va a heredar; ninguno sabe de dónde salen los datos.

| Componente | Qué hace |
|---|---|
| `PimiaPageHeader` | La cabecera de una pantalla: título (30 px medium), descripción, acción primaria a la derecha y, opcionalmente, migas encima e insignias junto al título. |
| `PimiaStatCards` | La tira de cifras sobre una lista. No calcula nada: se le pasan números que el servidor haya dicho, y una raya cuando no se saben. |
| `PimiaSortableHead` | Cabecera que ordena **contra el servidor**, con su flecha de dirección. |
| `PimiaStatusBadge` | Una insignia de estado con punto de color, por **tono semántico** (`neutral`/`info`/`success`/`warning`/`danger`), no por documento. Trae los tres mapas —presupuesto, factura y AEAT (`INVOICE_AEAT_META`)— y `PimiaVeriFactuBadge`, que es la insignia del tercer eje. |
| `PimiaInvoiceVeriFactu` | El bloque VeriFactu de la ficha: el motivo del rechazo, la prueba del alta aceptada y los botones que el estado permita. Es quien aplica la regla de «sin registro no hay nada que reintentar». |
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
- **Borrar.** Por una razón concreta, no por falta de tiempo: ver *Las
  acciones de documento* arriba. Todo lo demás —estado, enviar, duplicar, PDF y
  convertir en factura— ya está.

> **Corregido dos veces, y las dos por lo mismo: «imposible» era «todavía no
> investigado».** Primero este apartado decía que las acciones de documento se
> quedaban fuera enteras; entraron cuatro en el pase de acciones. Después decía
> que **enviar** era imposible por un scope que no existe — y lo era, hasta que
> se arregló donde estaba el problema, que era el núcleo (desplegado el
> 2026-08-09). Solo queda fuera borrar, por la nota legal.

> **Corregido el 2026-08-08.** Este apartado decía que las cabeceras ordenables
> y el filtro de fechas eran imposibles «porque la API no los acepta». Era
> falso: `applyFilters` los soporta desde siempre. Se comprobó leyendo el
> controlador en el núcleo y contra un tenant real. Están implementados.

## Cómo se mira

`desktop/tests/e2e/pimia-screens-screenshots.spec.ts` retrata las cinco
pantallas en claro y oscuro con datos del mock del ERP
(`tests/helpers/pimia.ts`), sin depender de que nadie tenga el llavero abierto:

```bash
pnpm -C desktop build:e2e
PLAYWRIGHT_BROWSERS_PATH="$TOOLCHAINS/ms-playwright" \
  pnpm -C desktop exec playwright test tests/e2e/pimia-screens-screenshots.spec.ts --project=smoke
```

`$TOOLCHAINS` es el directorio del toolchain local; la variable solo hace falta
si los navegadores de Playwright no están donde `pnpm` los busca por defecto.

Las capturas salen en `desktop/test-results/pimia/`. Las de este pase están en
`docs/assets/screenshots/pimia-*`.

> Falta ahí la tanda de «antes» del panel, clientes y presupuestos: se tomó
> contra un tenant real, antes de que el mock fijase un host de
> documentación, y en un repo público el subdominio de un cliente sobra. Se
> borraron en el barrido del 2026-08-22. Si hacen falta otra vez, se
> regeneran con el spec, que ya solo pinta datos del mock.

Las **acciones** tienen su propio spec, `pimia-estimate-actions.spec.ts`, y su
propia carpeta (`test-results/pimia-acciones/`). Separados a propósito: aquel
retrata pantallas y no toca nada, y este abre menús, confirma diálogos y
**cambia estado contra el mock** —mezclarlos colaría un cambio de estado en la
captura de la pantalla anterior—. Además de retratar, comprueba lo que solo se
ve moviéndose: que tras un `POST /status` —que contesta `{success: true}` y no
el documento— la ficha **relee** y la insignia cambia.

**Rectificativas y VeriFactu** tienen el suyo,
`pimia-invoice-verifactu.spec.ts` (`test-results/pimia-verifactu/`), separado
por lo mismo: crea documentos nuevos y mueve el estado AEAT. Cubre los cinco
estados que cambian lo que se ofrece, y el caso que solo se ve moviéndose: que
tras `sync`/`retry` —que **no** devuelven la factura— la ficha relee y la
insignia cambia.

⚠️ El mock (`tests/helpers/pimia.ts`) copia **la forma real** también en esto:
`clone` devuelve el recurso nuevo, `convert-to-invoice` devuelve una factura con
`invoice_number: null`, y el 403 de un permiso que falta llega **sin**
`missing_scope`, como el de verdad. `installPimiaMock(page, {staleGrant: true})`
reproduce un grant anterior a `invoices:write`.

Y en lo de este pase, la forma real es sobre todo **la frontera del registro**:
el mock devuelve 422 «Invoice not registered in VeriFactu» exactamente en los
estados que no tienen `verifactu_record_id`, publicar estrena el `aeat_status`
(porque es la transición que registra), y la rectificativa nace **sin** estado
AEAT. Un mock que rellenara ese hueco dejaría pasar una UI que promete un alta
que el ERP no hace.
