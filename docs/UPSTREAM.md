# Upstream y estrategia de deriva

Este repositorio es un **fork duro** de [`block/buzz`](https://github.com/block/buzz)
(Apache-2.0). No es un espejo ni un rebase continuo: divergimos a propósito y
cada divergencia queda escrita aquí el día que se introduce.

## Punto de partida

| | |
|---|---|
| Upstream | `https://github.com/block/buzz` |
| Licencia | Apache-2.0 (ver `LICENSE`) |
| Commit base | `02f640bc4559c48ac0c2ec595ef34dd2c294b0db` — «feat(desktop): unify add agent flows (#5015)», 2026-08-07 |
| Versión de upstream en ese commit | 0.5.7 |
| Forkeado el | 2026-08-08 |

Upstream no publica fichero `NOTICE`, así que Apache-2.0 §4(d) no obliga a
propagar ninguno. Se conserva `LICENSE` íntegro y se añade `NOTICE` con la
atribución a Block, Inc. — cortesía, no obligación.

## Remotos

```
origin     https://github.com/Pimia-AI/pimia-workspace.git   (lectura y escritura)
upstream   https://github.com/block/buzz.git                 (SOLO lectura)
```

El push a `upstream` está deshabilitado en la configuración del clon
(`git remote set-url --push upstream DISABLED_no_empujar_a_upstream`). Si
clonas de nuevo, repite ese paso.

## La estrategia: fork duro con cherry-picks selectivos

Upstream es un proyecto vivo (25k ★, decenas de commits al día). Seguirlo con
un rebase continuo cuesta más de lo que da. La política es:

- **No hay merge ni rebase periódico de `upstream/main`.** Nuestra `main`
  avanza sola.
- **Se traen cherry-picks selectivos** de dos categorías: arreglos de
  seguridad y cambios del protocolo/relay que nos dejarían incompatibles con
  `communities.buzz.xyz`. Nada más — ni features nuevas ni refactores.
- **Cada divergencia se anota abajo el día que entra.** La lección viene del
  deliverer vendorizado: una divergencia sin documentar se paga entera meses
  después, cuando ya nadie recuerda por qué el código difiere.

Para revisar qué se mueve arriba sin arrastrarlo:

```bash
git fetch upstream
git log --oneline HEAD..upstream/main
```

## La frontera innegociable: el ERP jamás pasa por el relay

No es una preferencia de diseño, es la regla que hace seguro todo el plan.

Los mensajes de canal de Buzz **no van cifrados extremo a extremo**: el relay
los guarda en claro en su Postgres para poder indexarlos (solo los DM usan
NIP-17). El relay que usamos, `communities.buzz.xyz`, lo administra Block, no
nosotros.

Por tanto:

- Los datos del ERP —clientes, facturas, importes, datos fiscales— viajan
  **exclusivamente por la API de Pimia** (SDK + OAuth + scopes), como
  cualquier app de partner. El relay no los ve nunca.
- El relay lleva **solo lo suyo**: chat, presencia, canales, coordinación de
  agentes.
- La UI puede *referirse* a entidades del ERP en el chat (por ejemplo «revisa
  el presupuesto PRE-000123») pero por **referencia opaca**: identificador y
  enlace profundo al panel, nunca volcando el contenido.

En el código esto se traduce en una regla revisable: **ningún módulo bajo
`desktop/src/features/pimia/` importa nada de `desktop/src/shared/api/relay*`.**

## Registro de divergencias

### 2026-08-08 — Identidad de la aplicación (Fase 0)

**Por qué.** El fundador tiene un Buzz de verdad en uso diario en el mismo Mac
(`/Applications/Buzz.app`, identificador `xyz.block.buzz.app`, con su clave
privada Nostr). Dos aplicaciones con la misma identidad comparten directorio de
datos, llavero y updater. El riesgo no es teórico: la instalación en uso podría
quedar corrupta o recibir una actualización al binario equivocado.

| Qué | Antes (upstream) | Ahora |
|---|---|---|
| Identificador de bundle | `xyz.block.buzz.app` | `es.pimia.workspace` |
| Identificador en dev | `xyz.block.buzz.app.dev` | `es.pimia.workspace.dev` |
| Nombre visible | `Buzz` / `Buzz Dev` | `Pimia Workspace` / `Pimia Workspace Dev` |
| Esquema de enlace profundo | `buzz://` | `pimia-workspace://` |
| Servicio de llavero (release) | `buzz-desktop` | `pimia-workspace-desktop` |
| Servicio de llavero (dev) | `buzz-desktop-dev` | `pimia-workspace-desktop-dev` |

Ficheros: `desktop/src-tauri/tauri.conf.json`,
`desktop/src-tauri/tauri.dev.conf.json`,
`desktop/src-tauri/src/app_state_keyring.rs`,
`desktop/src-tauri/src/managed_agents/storage.rs`, `Justfile`,
`scripts/instance-env.sh`, `scripts/reset-desktop-dev-state.sh`,
`scripts/reset-desktop-standalone-state.sh`,
`scripts/test-reset-desktop-standalone-state.sh`,
`scripts/cleanup-instance-agents.sh`.

**Verificado en el primer arranque real** (2026-08-08, con el Buzz del usuario
corriendo a la vez en la misma máquina): la app creó
`~/Library/Application Support/es.pimia.workspace.dev/` con su marcador propio
`identity.pimia-workspace-desktop-dev.main.migrated`; el llavero quedó con dos
entradas separadas (`buzz-desktop` la ajena, `pimia-workspace-desktop-dev.main`
la nuestra); la app **generó una identidad Nostr nueva** en vez de importar
ninguna; y el updater no llegó a cargarse (*«updater unavailable: plugin
updater not found»* — en dev no está activo, así que no puede apuntar a un
binario ajeno).

**Tres cosas que conviene no olvidar de este cambio:**

1. **El llavero era el riesgo de verdad, y el identificador de bundle no lo
   cubría.** El llavero de macOS es por usuario, no por aplicación: un build
   de release del fork con el nombre de servicio de upstream habría abierto la
   misma entrada `buzz-desktop` donde vive la identidad Nostr del fundador —
   con permiso de escritura. Se verificó que esa entrada existe hoy en la
   máquina. Cambiar el identificador de bundle no habría evitado nada.
2. **La migración legacy de upstream queda inerte sola, y eso es lo deseado.**
   `migration.rs::legacy_app_data_dir` y `commands/legacy_storage.rs` mapean el
   directorio actual a su equivalente `xyz.block.sprout.app` para importar datos
   de instalaciones viejas de Buzz. Con un identificador que no empieza por
   `xyz.block.buzz.app`, ambas devuelven `None` y no hacen nada. No se han
   tocado: que no encuentren nada es exactamente el comportamiento correcto, y
   dejarlas iguales que upstream abarata los cherry-picks.
3. **En `tauri dev` el proceso se sigue llamando `buzz-desktop`, y es correcto.**
   Ese es el nombre del binario de Cargo (el crate `buzz-desktop`), no el
   nombre visible de la aplicación. `productName` solo aplica al `.app`
   empaquetado, y `tauri dev` ejecuta el binario suelto — la propia app lo dice
   al arrancar: *«macOS notifications disabled because the process is not
   running from an app bundle»*. Renombrar el crate tocaría rutas, scripts y CI
   por un beneficio cosmético en modo desarrollo; no compensa. Lo que sí
   importa —el directorio de datos y el llavero— ya está separado, y se
   verificó en el primer arranque real.
4. **El esquema `buzz://` sigue vivo dentro del código y no pasa nada.** Los
   enlaces `buzz://message?…` que la app genera y parsea (`messageLink.ts`,
   `markdown.tsx`, `deep-link.ts`) se interceptan dentro del webview, sin pasar
   por el sistema operativo. Lo único que se cambió es qué esquema **registra**
   la app ante macOS, para no competir con el Buzz del fundador por los enlaces
   que sí llegan por el sistema. De propina, el fork ya tiene registrado el
   esquema propio que la Fase 1 necesita para el retorno del OAuth.

### 2026-08-08 — Sección «Pimia» placeholder y deduplicación de `AppView` (Fase 0)

**Por qué.** Demostrar, con código que compila y pasa los checks del propio
repo, que se puede añadir una sección propia sin tocar el core de mensajería.
La receta completa está en [`MAPA-FRONTEND.md`](MAPA-FRONTEND.md).

Ficheros nuevos: `desktop/src/features/pimia/ui/PimiaScreen.tsx`,
`desktop/src/app/routes/pimia.tsx`.
Ficheros tocados: `preview-features.json`, `desktop/src/app/routes.ts`,
`desktop/src/app/AppShell.helpers.ts`,
`desktop/src/app/navigation/useAppNavigation.ts`,
`desktop/src/features/sidebar/ui/AppSidebarPinnedHeader.tsx`,
`desktop/src/features/sidebar/ui/AppSidebar.tsx`.

Con una divergencia de más, que salió del propio guard de upstream:
`AppSidebar.tsx` y `AppSidebarPinnedHeader.tsx` repetían la unión de `AppView`
como literal. Ahora importan el tipo. El motivo es práctico: `AppShell.tsx`
(999 líneas) y `AppSidebar.tsx` (1000) estaban justo en el techo del ratchet de
1000 líneas de `scripts/check-file-sizes.mjs`, y el patrón de upstream —cablear
un `onSelectX` desde `AppShell` hasta el menú— los hace crecer con cada sección
nueva. La sección Pimia navega desde el propio menú con `useAppNavigation()`,
que es el patrón que ya usa `ChannelActivityPopover.tsx`. Resultado: los dos
ficheros del shell **encogieron** (998 y 997) en vez de crecer.

### 2026-08-08 — Dos barras: Pimia a la izquierda, Buzz a la derecha (Fase 1)

**Por qué.** Es la disposición del plan y la primera corrección de rumbo del
fundador: la navegación del ERP ocupa la barra izquierda y la de Buzz —canales,
DM, agentes— se va a la derecha. Montar los módulos del ERP sobre la disposición
equivocada obligaría a rehacerlos.

**La divergencia estructural, y es la que hay que vigilar en cada cherry-pick.**
El bloque `sidebar` de shadcn que Buzz copió al repo está escrito para **una
sola barra**: `SIDEBAR_COOKIE_NAME`, `SIDEBAR_WIDTH_STORAGE_KEY`,
`SIDEBAR_KEYBOARD_SHORTCUT` y las anchuras eran constantes de módulo, y había un
único `<SidebarProvider>` en `AppShell.tsx`. Dos barras con ese código
compartirían estado: se abrirían y redimensionarían juntas.

Ahora el estado va parametrizado por **scope**:

| | |
|---|---|
| Fichero nuevo | `desktop/src/shared/ui/sidebar-provider.tsx` — `SidebarScope`, el contexto, el provider y los helpers de anchura |
| Fichero recortado | `desktop/src/shared/ui/sidebar.tsx` — de 1011 a 774 líneas; reexporta lo de arriba, así que ningún consumidor cambia su import |
| Los dos scopes | `desktop/src/app/sidebarScopes.ts` |

`sidebar.tsx` estaba **en el techo del trinquete de 1000 líneas** y no podía
crecer: sacar el provider a su propio fichero no es una preferencia de estilo,
era la única forma de tocarlo.

`BUZZ_SIDEBAR_SCOPE` **conserva las claves de upstream a propósito**
(`sidebar_state`, `buzz-sidebar-width`, atajo ⌘S): quien ya usaba la app
mantiene anchura y estado tras el cambio de lado, y un cherry-pick que toque
esas constantes sigue casando. `PIMIA_SIDEBAR_SCOPE` estrena las suyas
(`pimia_sidebar_state`, `pimia-workspace-sidebar-width`, atajo ⌘⇧S).

Tres detalles del montaje que conviene no redescubrir:

1. **Los providers se anidan, no se ponen en paralelo.** El de Buzz es el de
   siempre y envuelve el shell entero; el de Pimia es interno y solo envuelve su
   barra, con `className="contents"` para no meter una caja en la fila (las
   variables CSS —`--sidebar-width`— heredan igual a través de
   `display: contents`, que es lo que da a cada barra su anchura).
2. **El botón del chrome sigue siendo el de Buzz.** Se fue al extremo derecho y
   usa los iconos de panel derecho, pero conserva su `aria-label` («Toggle
   Sidebar») porque varios e2e lo buscan por nombre exacto. La barra de Pimia no
   necesita botón ahí: colapsa a iconos (`collapsible="icon"`), nunca se va de
   pantalla, y trae su propio interruptor en la cabecera.
3. **La hairline de 1px del `Sidebar` era solo del caso izquierdo**
   (`group-data-[variant=sidebar]:pr-px`). Ahora va del lado que toca.

Ficheros tocados: `desktop/src/app/AppShell.tsx`,
`desktop/src/app/AppTopChrome.tsx`,
`desktop/src/features/sidebar/ui/AppSidebar.tsx` (nueva prop `side`),
`desktop/src/features/sidebar/ui/AppSidebarPinnedHeader.tsx`,
`desktop/src/app/navigation/useAppNavigation.ts`,
`desktop/tests/e2e/smoke.spec.ts` y
`desktop/tests/e2e/buzz-theme-screenshots.spec.ts` (la barra de Buzz es ahora
`[data-side="right"]`, y hay dos `[data-sidebar="trigger"]` en el árbol).

Y una divergencia de propina que el ratchet volvió a exigir: el menú fijo de la
barra de Buzz **navega solo** con `useAppNavigation()` en vez de recibir
`onSelectAgents`/`onSelectProjects`/`onSelectPulse`/`onSelectWorkflows` cableados
desde `AppShell`. Es la continuación del patrón que ya introdujo la Fase 0.
Resultado: `AppShell.tsx` bajó de 998 a 995 líneas montando **dos** barras, y
`AppSidebar.tsx` de 997 a 989. La entrada «Pimia» sale de esa barra: su sitio es
la izquierda.

### 2026-08-08 — El auth de escritorio y la superficie de la API de Pimia (Fase 1)

**Por qué.** La app necesita hablar con la API de Pimia como cualquier app de
partner: OAuth, scopes y un `TokenSet` que sobreviva a un reinicio sin quedar
al alcance de nadie.

**Superficie nueva, no modificación de upstream**:
`desktop/src-tauri/src/pimia/` (`vault.rs`, `oauth.rs`, `login.rs`, `api.rs`,
`commands.rs`) y `desktop/src/features/pimia/`. Se toca upstream solo para
enchufarlo: `lib.rs` (el módulo, el estado gestionado y seis comandos) y
`deep_link.rs`.

**Las decisiones que hay que poder defender dentro de seis meses:**

1. **Todo el OAuth y todo el HTTP viven en Rust.** El `access_token` no entra
   nunca en JavaScript: el webview manda `pimia_api_request` y recibe datos de
   negocio. De propina esto esquiva el CORS del origen `tauri://`.
2. **Client público con PKCE S256 y registro dinámico (RFC 7591).** El tenant
   expone `registration_endpoint` y admite `token_endpoint_auth_method: none`
   (verificado contra `sdkdemo.taskai.work`), así que la app se da de alta sola
   en cada tenant y no hay ningún secreto cableado en un binario que el usuario
   tiene en su disco.
3. **El retorno del navegador va por loopback, con el esquema propio de
   respaldo.** El plan decía «deep-link de vuelta» y el esquema
   `pimia-workspace://oauth/callback` está implementado y registrado — pero
   **macOS solo enruta esquemas de un `.app` empaquetado**, así que en
   `tauri dev` no llega nunca. El camino por defecto es
   `http://127.0.0.1:53682/oauth/callback` (RFC 8252 §7.3, igual de válido), con
   puertos alternativos 53683/53684. Las dos URIs se registran a la vez en el
   tenant, así que un build empaquetado puede usar cualquiera sin volver a
   registrarse.
4. **El `TokenSet` va al llavero, en el `SecretStore` que ya existía**, bajo la
   clave `pimia.tenants` del mismo blob que la identidad Nostr — el servicio es
   el del fork (`pimia-workspace-desktop[-dev]`), así que no hay una segunda
   entrada ni un segundo aviso del llavero.
5. **El refresh rota, y eso manda sobre el diseño de `api.rs`.** Reusar un
   refresh ya rotado se lee como robo y revoca el grant entero, así que el
   refresco está serializado con un candado de proceso y el conjunto nuevo se
   persiste **antes** de reintentar.
6. **Multi-tenant desde el día 1**: un token vale para un tenant. El vault
   guarda una conexión por tenant y una activa; la caché de TanStack Query
   cuelga de `["pimia", "data", <tenant>]` para que los datos no se mezclen.

**En `deep_link.rs`**: `handle_deep_link_url` rechazaba cualquier esquema que no
fuera `buzz`, así que el `pimia-workspace://` que la Fase 0 registró ante macOS
**estaba muerto**. Ahora se aceptan los dos (los enlaces internos `buzz://` se
siguen interceptando dentro del webview) y hay un arm `oauth` para el callback.
El cableado del listener se mudó de `lib.rs` a `deep_link::install()`: es donde
le toca, y `lib.rs` estaba a ocho líneas del trinquete.

**La frontera, ahora revisable de verdad.** `desktop/scripts/check-pimia-boundary.mjs`
falla si algo bajo `src/features/pimia/` importa de `shared/api/relay*` (o de
`shared/api/tauri.ts`, que a su vez importa del relay). Corre dentro de
`pnpm check`. Una regla que nadie comprueba deja de ser una regla el día que
alguien necesita «solo un dato» del relay.

### 2026-08-08 — Deuda de formato de la Fase 0

`cargo fmt` tenía pendiente una reindentación en
`desktop/src-tauri/src/app_state_keyring.rs` desde la Fase 0. El gotcha 6 de
`CLAUDE.md` explica por qué se coló: el hook de pre-commit que corre
`just desktop-tauri-fmt` falla en worktrees. Aplicada; `cargo fmt --check` del
crate Tauri queda en verde.

### El coste horizontal de la segunda barra, y dónde se paga

Con las dos barras abiertas el contenido paga **548 px de cromo** (248 + 300)
donde upstream pagaba 300. Varias superficies de Buzz —la revisión de diffs, el
dock de subida, la barra de acciones de un mensaje, las listas de Projects—
tienen sus propios umbrales responsive alrededor de los **950 px de contenido**,
y por debajo se degradan.

La mitigación es `PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX` (**1400**, en
`app/sidebarScopes.ts`): por debajo de esa anchura de ventana la barra del ERP
se pliega sola a iconos y devuelve 200 px. En una pantalla de portátil (1512
lógicos) las dos barras se ven abiertas; en una ventana más estrecha la nav del
ERP es una rejilla de iconos. El efecto solo actúa **al cruzar** el umbral: el
usuario puede volver a abrirla a mano.

El número no es arbitrario: se midió corriendo la suite de e2e contra el commit
base y contra este. Con el umbral en 1100, cuatro specs de upstream que pasan en
`7eda23e63` fallaban a 1280 (reacción con emoji personalizado, dock de subida,
dos de revisión de PR). Con 1400 vuelven a pasar todos.

**Lo único que queda tocado por aritmética**: `channels.spec.ts` comprueba que
en una ventana de 820 px la hoja de gestión de canal se queda con el área de
contenido entera, y el umbral era `> 500`. Ahí el cromo son 348 px (la barra del
ERP ya plegada) en vez de 300, así que el máximo posible es 472: pasa a `> 450`.

### 2026-08-08 — El rail y el aviso de relay se van a la derecha (👤 fundador)

**Por qué.** Es el conmutador de comunidades de **Buzz**. Con la barra de Buzz a
la derecha, dejarlo en el extremo izquierdo lo encajaba contra la barra del ERP:
un control de Buzz varado en territorio del ERP. Ahora va **por fuera** de la
barra de Buzz, pegado al borde derecho de la ventana.

Lo que arrastró el cambio, que es lo que conviene saber para un cherry-pick:

- `AppShell.tsx`: `<CommunityRail>` pasa de delante a detrás del
  `SidebarProvider`.
- `AppTopChrome.tsx`: upstream **reducía** el despeje de los semáforos de macOS
  (`pl-[32px]` en vez de `pl-[80px]`) cuando el rail estaba presente, porque el
  rail ya ocupaba el extremo izquierdo. Sin rail ahí, la fila de navegación
  vuelve a despejarlos enteros siempre, y la prop `hasCommunityRail` desaparece.
- `RelayConnectionOverlay.tsx`: **se va a la derecha con la barra**. Enseña la
  tarjeta del pie de la barra de Buzz cuando esa barra está plegada, así que
  dejarlo abajo a la izquierda hacía que saltara de un extremo de la pantalla al
  otro justo al plegarla. Vuelve a apartarse del rail (56 px + 12 de aire), pero
  ahora por la derecha: imagen especular de lo que hacía upstream.
  `sidebar-relay-card.spec.ts` comprueba el lado, así que la decisión queda
  protegida y no solo escrita.
- `CommunityRail.tsx`: la pastilla del activo cuelga del borde **exterior** del
  rail (convención Discord/Slack). Con el rail a la derecha ese borde es el
  derecho: `-left-2.5 rounded-r-full` → `-right-2.5 rounded-l-full`.

El spec `community-rail.spec.ts` tenía un test llamado «clears the macOS traffic
lights» cuya premisa era que el rail vivía bajo los semáforos. Ya no: se
reescribe como «se ancla al borde derecho y despeja el chrome», conservando lo
que sigue valiendo (alineación vertical con la superficie de la app, simetría de
los insets del rail) y añadiendo lo nuevo (el rail va por fuera de la barra de
Buzz, y el chrome vuelve a despejar los semáforos enteros).

### 2026-08-08 — Un login que no se puede quedar colgado (Fase 1)

**Cómo se descubrió.** El primer login OAuth real se quedó con el spinner
puesto para siempre, aunque el navegador ya había vuelto con el código. En el log
de `tauri dev` estaba la causa:

```
[TAURI] Couldn't find callback id 2623219052. This might happen when the app is
reloaded while Rust is running an asynchronous operation.
```

Y encima, 31 líneas de `page reload playwright-report/index.html`.

**Dos fallos, uno de entorno y otro de diseño.**

1. **Vite vigilaba la salida de los e2e.** `server.watch.ignored` solo excluía
   `src-tauri`, así que cada pasada de Playwright reescribía
   `playwright-report/` y Vite **recargaba la página entera** de la app de
   escritorio. Una recarga a media invocación deja huérfano el callback del
   comando Tauri en vuelo. Ahora se ignoran también `playwright-report/`,
   `test-results/` y `dist/`.
2. **El diálogo se fiaba solo de su promesa**, y eso es frágil aunque nadie
   corra tests: basta una recarga del webview o un reinicio a media
   autorización. `PimiaLoginState` lleva ahora una **fase**
   (`idle`/`awaitingBrowser`/`exchanging`) que el frontend consulta con
   `pimia_connect_phase` mientras espera. Si el backend dice `idle` y la promesa
   no ha resuelto, la autorización se quedó huérfana: se dice y se ofrece
   reintentar, en vez de girar para siempre. De propina, la UI ahora distingue
   «esperando en el navegador» de «guardando el acceso».

**Y un tercer arreglo que salió del mismo log**: había decenas de
`keyring write … failed (User canceled the operation)`. Si el aviso del llavero
se deniega justo después de canjear el código, el grant existe en el tenant pero
no se puede guardar — el peor momento posible. Ese error ya no sube crudo: dice
qué pasó y qué hacer («Permitir siempre» y volver a conectar).
