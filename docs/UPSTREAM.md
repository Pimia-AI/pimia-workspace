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

## La estrategia: merge periódico por release

> **Cambio de política (2026-08-09).** La versión original de esta sección
> decretaba fork duro sin merges, con cherry-picks solo de seguridad y
> protocolo. Se decidió el día uno, sin datos. Dos días después los datos
> dijeron otra cosa: upstream había movido 18 commits y una release, pero la
> intersección entre lo que ellos tocaron y lo que nosotros tocamos era de
> **4 ficheros**, todos con resolución mecánica. Mergear es barato si se hace
> a menudo, y usamos un relay alojado por Block, que se actualiza a su
> calendario: quedarse atrás en protocolo no es una opción
> que esté en nuestra mano. La política pasa a ser merge periódico.

- **La unidad de sincronización es el tag de release de upstream**
  (`desktop-vX.Y.Z`), nunca `upstream/main` en un punto arbitrario: los tags
  son los puntos que upstream probó y publicó.
- **Cadencia: cada release, o semanal — lo que llegue antes.** La frecuencia
  es la que mantiene barata la operación: merges pequeños mantienen la
  intersección en un puñado de ficheros; esperar meses la convierte en una
  migración.
- **Las divergencias nuevas se escriben para sobrevivir merges**: módulos
  propios aditivos (`desktop/src/features/pimia/` es el patrón), tocar
  ficheros de upstream lo mínimo, y todo anotado en el registro de abajo,
  que durante cada merge funciona de checklist de lo que hay que defender.
- **La válvula de escape**: si algún día los merges duelen de verdad, la
  salida no es quedarse atrás — es autoalojar el relay (la imagen Docker ya
  la construye `sprout-oss`) y desacoplarse del calendario de Block. Mientras
  el relay sea suyo, se sigue su ritmo.

### El runbook de cada ciclo

```bash
git fetch upstream --tags
git log --oneline HEAD..desktop-vX.Y.Z        # revisar qué entra
git checkout -b sync/desktop-vX.Y.Z origin/main
git merge --signoff desktop-vX.Y.Z
```

Conflictos esperados y su regla fija de resolución:

| Fichero | Regla |
|---|---|
| `desktop/src-tauri/tauri.conf.json` | Nuestra identidad (bundle id, nombre, esquema) gana; el `version` de upstream gana |
| `.github/workflows/ci.yml` | Nuestro recorte de plataformas gana; jobs nuevos de upstream se revisan uno a uno |
| `desktop/package.json` | El `version` de upstream gana; nuestros campos propios se conservan |
| `pnpm-lock.yaml` | No se resuelve a mano: `pnpm install` y commitear el resultado |

Cualquier conflicto **fuera** de esta tabla toca una divergencia del registro:
buscarla abajo, resolver defendiéndola, y si upstream rediseñó la zona,
actualizar la entrada del registro con la nueva forma de la divergencia.

Después del merge: `just ci`, PR contra `main` (con `--repo`, ver registro),
y tras actualizar la app en la máquina de trabajo, el smoke test de agentes
de la sección «El estado fuera del repo». Los merges de sincronización no
necesitan entrada propia en el registro — el merge commit y su PR son el
registro — salvo que hayan obligado a reescribir una divergencia.

## La frontera innegociable: el ERP jamás pasa por el relay

No es una preferencia de diseño, es la regla que hace seguro todo el plan.

Los mensajes de canal de Buzz **no van cifrados extremo a extremo**: el relay
los guarda en claro en su Postgres para poder indexarlos (solo los DM usan
NIP-17). El relay alojado que usamos lo administra Block, no nosotros.

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

## El estado fuera del repo (lo que un clon no reconstruye)

Un clon limpio de este repo compila la app, pero **no produce una flota de
agentes que funcione**: eso depende de estado que vive en la máquina — llavero,
settings de Claude Code, adaptadores npm, ficheros de la instancia. Esta
sección es la receta para reconstruirlo y el mapa de qué actualización puede
romper cada pieza. Todo se verificó en vivo el 2026-08-09, tras una semana de
pagar a plazos lo que aquí está junto.

**Regla de redacción, porque el repo es público:** aquí van mecanismos y
nombres de claves de configuración — jamás valores. Ni tokens, ni claves
privadas, ni pubkeys, ni URLs de la comunidad o del tenant real. Si al ampliar
esta sección hace falta un ejemplo, se inventa (`wss://<comunidad>...`,
`<pubkey-del-agente>`).

### Los tres canales por los que llegan cambios

| Canal | Quién lo controla | Riesgo |
|---|---|---|
| Este repo (git) | Nosotros — fork duro, cherry-picks a mano | Bajo: nada entra solo |
| Adaptadores node-tools (npm) | El escritorio los instala/actualiza en `~/Library/Application Support/Buzz/node-tools/` | **Alto**: casi toda la receta de abajo depende de sus internals |
| Relay alojado | Block, en su calendario | Medio: cubierto por la categoría «protocolo» de los cherry-picks |

La configuración local (llavero, settings, ficheros de instancia) no la toca
ninguna actualización directamente — pero su *significado* depende de los
binarios de los dos primeros canales. Tras cualquier update de adaptadores,
correr el smoke test del final.

### La receta, pieza a pieza

**1. Autenticación de los agentes claude.** El adaptador `claude-agent-acp`
lanza el CLI nativo que empaqueta el Agent SDK, y ese CLI se autentica contra
**la credencial del llavero del sistema que usa el CLI de Claude Code** — la
misma que la del terminal, y distinta del canal de auth de la app de escritorio
de Claude. La consecuencia que importa: es un llavero **compartido por toda la
flota**, así que una credencial caducada o revocada tumba a todos los agentes a
la vez («401 OAuth access token has been revoked» en cada turno, lista de
modelos vacía al crear agente) mientras las sesiones interactivas del terminal
pueden seguir funcionando. Arreglo: volver a autenticar el CLI desde un
terminal —eso reescribe el llavero— y reiniciar los agentes. Probe rápido sin
Buzz: ejecutar el binario del SDK que cuelga del adaptador en `node-tools/` con
`-p 'ok'`.

**2. Permisos de ejecución.** Desde el sync de `desktop-v0.5.8` (registro:
«Tomado el revert de upstream #5323»), el arnés **auto-aprueba** las
peticiones de permiso de los agentes y los claude corren en
`bypassPermissions`: no hay frontera de comandos, y las tarjetas «Permission
requested» del panel terminan en Approved solas. La contención real es quién
puede activar a cada agente (`respond_to`) y el punto 4 (MCPs). Las reglas
allow de `~/.claude/settings.json` (`Bash(buzz)`, `Bash(buzz:*)`,
`Bash(printf:*)`) quedaron de la era del auto-rechazo — hoy no son
load-bearing; se conservan por si la política de upstream vuelve a girar.
Historia completa y qué vigilar: la entrada del registro.

**3. Sandbox de los agentes codex.** El adaptador `codex-acp` trae tres modos
cerrados (`read-only`, `agent`, `agent-full-access`) y pasa la política de
sandbox **por turno**, así que el `CODEX_CONFIG` global que inyecta
`buzz-acp` (`codex_network_env`) es letra muerta. Un agente codex que deba
usar el CLI necesita, en su ficha (Edit agent → variables de entorno) o en
`managed-agents.json`:

```
INITIAL_AGENT_MODE=agent-full-access
```

Condición innegociable: ese modo es **sin sandbox y sin preguntas** — el
agente ejecuta con los permisos del usuario de macOS. Solo con
`respond_to: allowlist` corto.

**Y no, la auto-aprobación del arnés no lo sustituye** — probado en vivo el
2026-08-10, contra la predicción que ocupaba este párrafo. La teoría era que
con el arnés aprobando (punto 2) bastaba el modo `agent`: el CLI falla por
red, codex pide escalar, la escalación se aprueba sola. En la práctica **codex
no pidió escalar**: cero `request_permission` en el log del arnés. El sandbox
de macOS no emite una señal distinguible de «bloqueado» — la resolución DNS
falla igual que una red caída, el CLI devuelve su error de red normal, y codex
lo reporta como fallo en vez de pedir permiso. La víspera sí había escalado
con el mismo montaje: **que escale depende del modelo, no del mecanismo**, así
que no se puede construir sobre ello. Las únicas vías con red fiable siguen
siendo `agent-full-access` (sin sandbox) o un modo intermedio propio
(«workspace-write + red», descartado: PR #9, cerrado sin mergear). Un agente
codex sin ninguna de las dos es un agente mudo.

**4. MCPs: los agentes heredan el scope usuario.** Todo servidor MCP en el
scope usuario de Claude Code (`~/.claude.json`) entra en **cada** agente
claude. La regla operativa: **scope usuario vacío**; el MCP del ERP y los de
infraestructura viven solo en scope `local` de los proyectos que los usan (el
cwd de los agentes es el nido `~/.buzz`, no esos proyectos, así que no los
ven). Darle un MCP a la flota es una decisión explícita: un `.mcp.json` en el
nido — y aplica a todos los agentes claude a la vez.

**5. Ficheros de la instancia.** En el `Application Support` de cada
instancia dev, bajo `agents/`: `managed-agents.json` (por agente:
`respond_to`/allowlist, `env_vars` — aquí viven el `INITIAL_AGENT_MODE` y los
allowlists), `global-agent-config.json` (runtime preferido y env global; la
capa de env es global < persona < agente). Se pueden editar con la app en
marcha —el spawn relee de disco—, pero el agente debe reiniciarse para que
aplique. **Jamás se suben al repo**: en modo sin llavero el store lleva nsecs
en claro.

**6. Workflows (cuando se monten).** Los mensajes que publica un workflow los
firma **la clave del relay**, no la del owner: para que un agente reaccione a
un workflow que lo menciona, el pubkey del relay (está en su NIP-11) tiene que
estar en el allowlist del agente.

### Smoke test tras cualquier actualización (~2 minutos)

1. DM a un agente claude → responde en el DM (una tarjeta de permiso en el
   panel, si aparece, debe terminar en Approved, no en Denied).
2. DM a un agente codex → ídem.
3. Crear un agente nuevo → el desplegable de modelos se puebla y no aparece
   ningún 401.

Si algo falla, los logs por agente están en
`<Application Support de la instancia>/agents/logs/`, y los probes de la
receta aíslan la pieza en un minuto: auth (binario del SDK con `-p`),
permisos (buscar `reject_once` / `permission denied` en el log — si aparecen,
el binario del arnés es anterior al sync de 0.5.8), sandbox de codex
(`ps eww` sobre el arnés: debe llevar `INITIAL_AGENT_MODE`; un codex que
reporta fallos de DNS o de red es un codex sin él).

**El arnés no lo recompila `tauri dev`.** `buzz-acp` vive en el target del
workspace raíz (`target/debug/buzz-acp`), no en el de la app; lanzar la app de
dev tras un merge deja el arnés **viejo** corriendo y el smoke test mide la
era equivocada. Tras cualquier sync que toque `crates/buzz-acp`:

```bash
cargo build -p buzz-acp     # desde el checkout principal
```

Para saber qué era lleva el binario sin leer código:
`strings -a target/debug/buzz-acp | grep -c 'auto-approving permission'`
(1 = aprueba, 0 = rechaza).

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
   (verificado contra un tenant de sandbox), así que la app se da de alta sola
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

### 2026-08-08 — Nada que toque el llavero puede correr en el hilo principal

Un comando `#[tauri::command] fn` (síncrono) corre en el **hilo principal**.
`pimia_auth_status` lo era y leía el llavero, y el frontend lo pide al montar:
la app se quedaba congelada al arrancar —«la aplicación no responde» en el Dock—
porque macOS bloquea esa lectura mientras enseña su aviso modal.

Los comandos que tocan el llavero son ahora `async` y hacen el trabajo en
`tauri::async_runtime::spawn_blocking`. Regla para lo que venga: **si toca el
llavero, fuera del hilo principal**.

### 2026-08-08 — `scripts/post-screenshots.sh`: apuntaba a upstream

**El fallo importante**: el script tenía `REPO="block/buzz"` **cableado**, así que
en el fork habría empujado la rama de capturas y comentado el PR **en upstream** —
justo lo que la doctrina prohíbe. Ahora deriva el repo de `origin` (el único
remoto con escritura) y **se niega a correr** si `origin` apunta a `block/buzz`.

De paso, un guard de versión: el script usa `mapfile` y `declare -A`, ambos de
bash 4+, y macOS trae bash 3.2. Fallaba a mitad de camino —después de haber
creado blobs sueltos— con errores que no decían la causa. Ahora avisa de entrada
y dice el remedio (`brew install bash`).

Consecuencia práctica: **en este Mac las capturas de PR no se pueden publicar**
hasta instalar un bash moderno.

### 2026-08-08 — El login real, cerrado (Fase 1)

El único punto abierto de la definición de hecho de la Fase 1 queda verificado
contra un tenant vivo. No hubo que tocar código: los tres arreglos del mismo día
—el `watch.ignored` de Vite, la fase del diálogo y el llavero fuera del hilo
principal— eran lo que faltaba.

**Lo que se ejercitó**, contra un tenant real (host omitido: el repo es público
y nombrarlo revela una relación comercial sin aportar nada al relato):

| | |
|---|---|
| Registro dinámico de client (RFC 7591) | `mcp_68ee25ee-17cc-4a77-bd61-94e36de2e5c9`, sin secreto |
| Retorno | loopback `http://127.0.0.1:53682/oauth/callback`, PKCE S256 |
| Scopes concedidos | `customers:read estimates:read estimates:write items:read` |
| `TokenSet` | access + **refresh**, caducidad a 24 h |
| Corte vertical | Clientes → detalle → **PRE-000133 creado** (borrador, 100,00 €) |

**La prueba que cierra la definición de hecho es el reinicio**, y conviene decir
cómo se comprueba sin fiarse de la UI: matar el proceso, relanzarlo y mirar el
`mdat` de la entrada del llavero. Si el vault se **lee** y no se reescribe, el
`mdat` **no cambia** — y no cambió. El pie de la barra vuelve a mostrar el host
y la lista trae los presupuestos del tenant. Cero `keyring … User canceled` y
cero `Couldn't find callback id` en los tres arranques de la sesión.

```bash
security find-generic-password -s "$BUZZ_DEV_KEYRING_SERVICE" | grep '"mdat"'
```

**Por qué los tres intentos anteriores no dejaron nada, y no era el OAuth**: sus
servicios de llavero (`…-dev.main`, `…-dev.claude-hungry-hypatia-3e6b8e`) no
tienen siquiera la clave `pimia.tenants`, y el servicio base la tiene vacía
(`{"tenants": []}`). Nunca llegó a persistirse una conexión. La causa está en la
entrada siguiente.

### 2026-08-08 — `scripts/instance-env.sh` toma el checkout principal por un worktree

**El síntoma que lo delató**: arrancando desde el checkout principal del repo
—no desde un worktree— la app se presenta como «Pimia Workspace
Dev (fase1-cierre-login)», con icono etiquetado y un servicio de llavero
`pimia-workspace-desktop-dev.claude-fase1-cierre-login`.

La detección compara `--git-dir` con `--git-common-dir` y su propio comentario
dice «in the main working tree these are identical». **No lo son si el CWD es un
subdirectorio**, que es exactamente como se usa el script (se hace `cd desktop`
antes de sourcearlo). Git devuelve entonces uno absoluto y el otro relativo:

```
desde pimia-workspace/           .git                        .git             ← iguales
desde pimia-workspace/desktop/   /Volumes/…/.git             ../.git          ← distintos
```

Consecuencia: **cada rama del checkout principal estrena servicio de llavero**, o
sea identidad Nostr nueva y vault de Pimia vacío. Eso explica los tres servicios
huérfanos que dejó la sesión anterior, y explica por qué el login «no se
conservaba» entre intentos: no es que no se guardara, es que el intento
siguiente miraba en otro cajón.

El arreglo es pedirle a git las dos rutas en el mismo formato — correcto desde
cualquier directorio:

```bash
GIT_DIR=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)
GIT_COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
```

`--path-format` pide git 2.31+. Si no está, las dos variables salen vacías, el
bloque de worktree no entra y **dos instancias en paralelo colisionarían** en el
directorio de datos y en `tauri-plugin-single-instance`; por eso el caso avisa
por `stderr` en vez de degradar en silencio.

**Comprobado en los dos lados** —lo que fallaba era justo que solo se había
mirado uno—: desde `pimia-workspace/desktop` no etiqueta nada
(`es.pimia.workspace.dev`, «Pimia Workspace Dev»), y desde
`.claude/worktrees/<x>/desktop` sigue etiquetando
(`es.pimia.workspace.dev.claude-<x>`, «Pimia Workspace Dev (<x>)»).

**El peaje, pagado una vez.** Con el arreglo, el checkout principal vuelve al
servicio `pimia-workspace-desktop-dev.main` —el que fija el comando de arranque
documentado con `${BUZZ_INSTANCE_SLUG:-main}`—, que tiene identidad pero **no**
`pimia.tenants`. O sea: la identidad Nostr se conserva y no hay que rehacer el
onboarding de Buzz, pero **hay que reconectar Pimia una vez**. A cambio, la
conexión deja de evaporarse en cada cambio de rama, que era el problema.

> **Actualización (misma fecha, entrada de más abajo).** Ese peaje ya no se
> paga: `.main` es ahora el servicio canónico *declarado* y el vault de tenants
> se migra al arrancar en vez de pedir que se reconecte. Ver
> «`just dev` se quedaba con el llavero del worktree anterior».

### 2026-08-08 — El pase de diseño del ERP (patrones de la referencia)

Trabajo casi todo dentro de `desktop/src/features/pimia/`, que es nuestro y no
existe upstream. Lo que **sí** toca terreno compartido, y por qué:

- **`desktop/src/shared/ui/table.tsx` — fichero NUEVO.** Faltaba el primitivo
  `table` y las listas densas de la referencia no se pueden hacer sin él.
  Entró por la vía estándar (`pnpm dlx shadcn@latest add table`): un fichero,
  MIT, tematizado por las variables que ya hay, **cero dependencias nuevas**
  (el bloque `table` de shadcn es HTML puro, sin Radix). No hay conflicto
  posible con upstream mientras upstream no añada uno propio; si lo añade,
  gana el suyo y nuestras tablas se recompilan contra él.
- **`desktop/playwright.config.ts`** — una línea más en el `testMatch` del
  proyecto `smoke` para el spec de capturas del ERP. Misma clase de
  divergencia que la que ya metió `dual-sidebars.spec.ts`; se resuelve sola en
  cualquier merge razonable.

Y una decisión que evita una divergencia mayor: la insignia de estado
**no modifica `shared/ui/badge.tsx`**. La variante `destructive` de Buzz es
sólida —pensada para un botón de borrar— y al lado de las demás gritaba en una
tabla; en vez de tocar el primitivo, `PimiaStatusBadge` la atenúa con la misma
variable (`bg-destructive/15 text-destructive`). Un fichero menos que
reconciliar cada vez que upstream toque su sistema de insignias.

El lenguaje visual y los componentes compuestos están documentados en
[`docs/PIMIA-UI.md`](PIMIA-UI.md).

### 2026-08-08 — `gh pr create` abre el PR contra **upstream** si no se le dice el repo

Misma familia que el caso de `post-screenshots.sh`, y con la misma raíz: el
clon conserva el remoto `upstream` apuntando a `block/buzz`, y `gh` toma el
repo padre como base por defecto. El síntoma no dice nada de eso:

```
GraphQL: Head sha can't be blank, Base sha can't be blank,
No commits between main and claude/<rama>, Head ref must be a branch
```

Es literal: en `block/buzz` esa rama no existe. Mientras tanto
`gh api repos/Pimia-AI/pimia-workspace/compare/main...claude/<rama>` responde
`ahead: 4`, o sea que la rama está bien empujada y el error engaña.

**El remedio es pasar el repo siempre**, que además deja el comando copiable:

```bash
gh pr create --repo Pimia-AI/pimia-workspace --base main --head claude/<rama> …
```

(La alternativa, `gh repo set-default Pimia-AI/pimia-workspace`, arregla la
máquina pero no el comando que quede escrito en un handoff.)

### 2026-08-08 — La lista del ERP al patrón `invoice-list-2` (👤 fundador)

Segunda vuelta del pase de diseño, con la referencia concreta que fijó el
fundador. Terreno compartido tocado, además de lo de la entrada anterior:

- **`desktop/src/shared/ui/select.tsx` — fichero NUEVO**, por la vía estándar
  de shadcn. Trae `@radix-ui/react-select` a `desktop/package.json`, de la
  misma familia que los Radix que el fork ya usaba. Hacía falta para la fila de
  filtros (rango de fechas, orden) y para el «N por página» del pie.

Y un hecho sobre la API que conviene no volver a descubrir: **el índice de
Pimia sí sabe ordenar y filtrar por fecha** (`orderByField`/`orderBy`,
`from_date`/`to_date` en `applyFilters`), pero **`meta.<recurso>_total_count`
ignora los filtros** — es un `count()` aparte del controlador. El total honesto
para un pie de lista es el del paginador. Detalle y aviso en
[`docs/PIMIA-UI.md`](PIMIA-UI.md) y en `readCompanyCount()`.

### 2026-08-08 — ⚠️ `routeTree.gen.ts` y el `tauri dev` zombi

Añadir una ruta (`/pimia/presupuestos/$estimateId`) destapó dos trampas del
generador de TanStack Router que cuestan media hora si no se conocen:

1. **`vite build` NO regenera el árbol de rutas.** El plugin lo genera en modo
   **dev**. Con `pnpm build:e2e` (que es `tsc && vite build`) el typecheck falla
   con `'/pimia/…' is not assignable to keyof FileRoutesByPath` y el build
   posterior no lo arregla. La receta: levantar el dev un momento y matarlo.

   ```bash
   npx vite --port 41227 --strictPort &   # regenera src/app/routeTree.gen.ts
   ```

2. **Un `tauri dev` viejo revierte el árbol.** `virtualRouteConfig`
   (`src/app/routes.ts`) se lee **una vez, al arrancar**: un dev server que
   siga vivo de antes de tocar `routes.ts` reescribe `routeTree.gen.ts` con su
   configuración antigua en cada pasada del watcher, borrando la ruta recién
   generada. Se vio literalmente: el fichero volvía a su tamaño exacto anterior
   segundos después de generarlo bien. **Antes de añadir rutas, comprobar que
   no queda ninguno**: `pgrep -fl "vite|buzz-desktop"`.

### 2026-08-08 — `just dev` se quedaba con el llavero del worktree anterior

**El síntoma**: pulsar «arrancar» en un agente daba *«agent 2e2654ad… has no
private key available — the OS keyring may be unreachable. Refusing to start
without an identity»*. El llavero estaba perfecto: la clave existía y se leía sin
problema. Lo que no cuadraba era **en qué cajón** se la buscaba.

**La causa**: la identidad de instancia se decidía en dos sitios distintos.

| Qué | Quién lo fijaba | Resultado |
|---|---|---|
| Identificador de bundle | `scripts/instance-env.sh`, desde el worktree de git | sólido |
| Servicio de llavero | **solo** la receta `desktop-standalone` | heredable |

`just dev`, `staging` y `production` no fijaban `BUZZ_DEV_KEYRING_SERVICE` **ni lo
limpiaban**, así que un valor exportado por un lanzamiento anterior sobrevivía en
la shell. El proceso que lo destapó llevaba
`BUZZ_DEV_KEYRING_SERVICE=pimia-workspace-desktop-dev.claude-fase1-cierre-login`
con `identifier=es.pimia.workspace.dev`: **ficha de agentes de la instancia
principal, llavero del worktree fase1**. `hydrate_keys` pedía
`agent:2e2654ad…` al cajón equivocado, el llavero contestaba «no existe», y
`spawn_key_refusal` se negaba a arrancar sin identidad — correctamente, porque
lanzar con `BUZZ_PRIVATE_KEY` vacío es lanzar sin identidad.

Quedaba a la vista en el propio directorio de datos, con los dos marcadores de
migración conviviendo:

```
~/Library/Application Support/es.pimia.workspace.dev/
  identity.pimia-workspace-desktop-dev.main.migrated                    (08:41)
  identity.pimia-workspace-desktop-dev.claude-fase1-cierre-login.migrated (18:12)
```

**El arreglo, en una frase**: el servicio de llavero se deriva del identificador
ya calculado, en `instance-env.sh`, y se exporta **siempre**.

```bash
unset BUZZ_INSTANCE_SLUG BUZZ_WORKTREE_LABEL BUZZ_DEV_KEYRING_SERVICE   # nada se hereda
INSTANCE_SCOPE="${INSTANCE_IDENTIFIER#es.pimia.workspace.dev}"          # "" o ".<slug>"
INSTANCE_SCOPE="${INSTANCE_SCOPE#.}"                                    # "" o "<slug>"
export BUZZ_DEV_KEYRING_SERVICE="pimia-workspace-desktop-dev.${INSTANCE_SCOPE:-main}"
```

Detalles que importan:

- **`.main` es el canónico declarado**, también dentro de la app: el defecto de
  `dev_keyring_service(None)` deja de ser el servicio pelado. Un arranque que no
  pase por las recetas (`cargo run`, un `tauri dev` a mano) cae en el mismo cajón
  que el checkout principal en vez de estrenar uno.
- **El fallo de generación del icono ya no parte la instancia.** El
  identificador se etiqueta dentro del `if swift …`; el llavero lo sigue, así que
  si el icono falla se cae a la instancia principal *entera* en vez de mezclar el
  directorio de datos de una con el llavero de otra.
- **`BUZZ_SHARE_IDENTITY=1` leía donde no había nada.** Buscaba la identidad del
  checkout principal en el servicio pelado, que no tiene `identity`; está en
  `.main`. De ahí el aviso «no identity found in keyring service».
- **`reset-desktop-dev-state.sh` reseteaba a medias.** Borraba los directorios de
  datos de *todas* las instancias de dev pero solo el llavero pelado: identidad y
  claves de agentes de `.main` y de cada worktree sobrevivían al «borrado». Ahora
  enumera el linaje `pimia-workspace-desktop-dev.*` y los borra todos.
- **El aviso mentía y mandaba a diagnosticar al revés.** `hydrate_keys` sí
  distingue ausencia de caída (loguea «has no key in JSON or keyring»), pero
  `spawn_key_refusal` funde los dos casos en «the OS keyring may be
  unreachable». El texto se deja como está —el fail-closed es correcto— pero
  conviene saber que «unreachable» puede querer decir «en otro cajón».

**La migración, para no pagar el peaje.** Al declarar `.main` canónico, lo que
quedó en el cajón pelado dejaría de verse. `migrate_unscoped_dev_keyring()` lo
levanta al arrancar: una sola vez (marca `_unscoped_dev_migration_v1` dentro del
blob canónico), sin pisar nada existente —`identity` y `agent:<pubkey>` vivos
mandan siempre, porque sobreescribirlos resucitaría una clave rotada— y sin
mover el original, así que un binario anterior sigue encontrando lo suyo. Si la
lectura del cajón heredado falla, **no** se escribe la marca: se reintenta en el
arranque siguiente en vez de dar por migrado lo que no se leyó.

**Verificación**: `scripts/test-instance-env-keyring-scope.sh` comprueba el
invariante —identificador y llavero describen la misma instancia— desde el
checkout principal y desde un worktree, con y sin valores filtrados en el
entorno. Se ejecuta a mano, como su vecino
`test-reset-desktop-standalone-state.sh`.

**Una trampa de `security(1)`, de regalo.** Escribir el blob del llavero por
stdin lo **trunca a 128 bytes** sin avisar: es el buffer del prompt interactivo.
Un blob con identidad y tres nsecs pasa de eso, así que la entrada quedó cortada
a la mitad de un valor. El único camino fiel es `-w <valor>` por argumento.
Cualquier script que toque el blob debe releer y comparar byte a byte después de
escribir, con copia previa: `security` reemplaza la entrada **entera**, así que
una escritura a medias se lleva identidad y claves de agentes por delante.

### 2026-08-08 — macOS y Windows salen de los PRs (coste de Actions) — **REVERTIDO el mismo día**

> **Esta divergencia ya no está en el código.** Se revirtió unas horas después,
> al pasar el repo a público: los repos públicos tienen minutos ilimitados en
> runners estándar, así que la restricción dejaba de ahorrar y solo costaba
> cobertura. Se conserva el relato porque el dato que la motivó —el
> multiplicador por sistema operativo— es el que no es obvio, y porque volverá
> a aplicar si el repo vuelve a privado. El desenlace está al final.


**El disparador**: la CI del PR #4 no arrancó. La anotación de GitHub —*«recent
account payments have failed or your spending limit needs to be increased»*— no
dice lo importante, que es **por qué** se agotó la cuota.

`Pimia-AI` está en plan `free` y este repo es **privado**, así que los minutos de
Actions se miden. Y no se cuentan 1:1: se cobran con **multiplicador por sistema
operativo**, que es el dato que convierte «2000 minutos al mes» en algo mucho
más pequeño.

| Runner | Multiplicador | Con 2000 incluidos |
|---|---|---|
| Linux | 1× | 2000 min |
| Windows | 2× | 1000 min |
| **macOS** | **10×** | **200 min** |

Un build de Tauri para macOS no baja de 15–20 minutos: **150–200 minutos
cobrados por ejecución**. Es decir, un solo PR con el build de escritorio se
podía llevar el mes entero. En repos públicos los runners estándar son gratis e
ilimitados; por eso `block/buzz` no paga esto y nosotros sí. Misma CI, distinta
visibilidad.

**La divergencia**: en `ci.yml`, los dos únicos jobs que no son de Linux pasan a
correr **solo en `push` a `main`/`release`** y se saltan en los pull requests.

```yaml
  windows-rust:        # antes: push || rust || desktop-rust
  desktop-build-macos: # antes: push || desktop || desktop-rust || rust
    if: github.event_name == 'push'
```

Se cambió la condición del job, **no el disparador del workflow**: así el check
se sigue creando y se reporta como `skipped`, que las protecciones de rama
tratan como aprobado. Quitar el trigger lo dejaría `pending` para siempre. (Hoy
da igual —el plan Free no ofrece protección de rama en privados— pero el día que
se contrate, esto ya está bien hecho.)

**Qué NO se toca, y por qué no hacía falta:**

- Los **cuatro canarios** (`macos-intel-canary`, `signed-macos-canary`,
  `windows-canary`, `linux-canary`) y `desktop-release-cache-proof` ya eran
  `workflow_dispatch`: nunca corrían solos.
- **`release.yml`** solo va por tags `desktop-v[0-9]*`. Los builds firmados de
  release siguen exactamente igual — ahí es donde vive el «y tags».
- **`docker.yml`** usa `${{ matrix.runner }}`, y toda su matriz es Linux
  (`ubuntu-24.04` / `ubuntu-24.04-arm`).
- **`desktop-release-candidate.yml`** corre en PRs, pero en `ubuntu-latest`.
- Los **14 jobs de Linux** conservan sus filtros por ruta intactos.

**Qué cobertura pierde un PR, dicho sin adornos.** Poca de Rust y algo de
plataforma:

- `Desktop Core` (ubuntu) ya corre `desktop-tauri-clippy`, `desktop-tauri-check`,
  `desktop-tauri-test` y `desktop-tauri-test-compiled-flags`, así que la crate de
  Tauri **no** se queda sin clippy ni sin tests.
- Lo que se mueve al *merge* es la compilación **específica de plataforma**: el
  código bajo `#[cfg(target_os = "macos")]` (Keychain y `security-framework`,
  notificaciones, rutas de WebKit) y bajo `#[cfg(windows)]` (`windows-sys`, el
  backend de `keyring` en Windows). Un PR que toque `secret_store.rs` ya no ve
  ese compilado hasta que entra en `main`.

Si eso molesta en un PR concreto, la salida sin coste fijo es una escotilla —
`workflow_dispatch` o una etiqueta tipo `ci:full` en la condición del job— para
pedirlos a demanda. No se ha puesto todavía: primero conviene ver cuánto duele.

**El desenlace, el mismo día.** El repo pasó a **público**, y con eso los
runners estándar dejan de medirse: minutos ilimitados en Linux, Windows y macOS.
La restricción perdió su única razón de ser y se revirtió — `ci.yml` vuelve a
las condiciones de upstream, sin divergencia que mantener:

```yaml
  windows-rust:        if: push || rust || desktop-rust
  desktop-build-macos: if: push || desktop || desktop-rust || rust
```

Con ello los PRs recuperan gratis lo que se había movido al merge: la
compilación de `#[cfg(target_os = "macos")]` y `#[cfg(windows)]`. Que es justo
lo que hace falta en este repo, donde el llavero tiene una rama por plataforma.

**Lo que queda aprendido, y no depende de la visibilidad:** en un repo privado
los 2000 minutos del plan Free no son 2000 — son 2000 de Linux, 1000 de Windows
o **200 de macOS**. Si algún día se vuelve a privado, el recorte está en el
historial de esta rama listo para reaplicar; y la escotilla a demanda
(`workflow_dispatch` o etiqueta `ci:full`) sigue siendo la forma correcta de no
perder la cobertura de plataforma al hacerlo.

### 2026-08-09 — Windows sale del ciclo de CI (macOS es el único objetivo)

👤 «de momento nos olvidamos de windows, primero construimos para mac que es lo
que tenemos ahora mismo».

El job `windows-rust` de `ci.yml` queda tras una variable de repositorio. **No se
borra**: compila el workspace y la crate de Tauri con MSVC, y el día que haya
build de Windows hace falta tal cual.

```yaml
if: >-
  vars.CI_WINDOWS == 'true' && (github.event_name == 'push' || …)
```

Se reactiva sin tocar código:

```bash
gh variable set CI_WINDOWS --repo Pimia-AI/pimia-workspace --body true
```

**Qué se pierde**: la compilación MSVC, o sea el código bajo `#[cfg(windows)]` y
los backends de `windows-sys`/`keyring` para Windows. Nadie más lo cubre — ni
`Rust Lint` ni `Desktop Core`, que son de Linux.

**Qué NO se gana, medido para que no se busque donde no está**: tiempo de reloj.

| Job | Duración (frío) |
|---|---|
| `Desktop Core` | ≥16 min |
| `Desktop Smoke E2E` (×4 shards) | 12-15 min |
| **`Windows Rust`** | **7m 47s** |
| `Desktop E2E Integration` | 7 min |
| `Desktop Build (macOS)` | 5 min |
| `Rust Lint` | 3 min |

Los jobs corren en paralelo, así que la espera la fija `Desktop Core`, no
Windows; y en un repo público los minutos son gratis. Lo que se gana es
**quietud**: se acaba el rojo intermitente de `sherpa-onnx-sys`, que se descarga
un binario precompilado al compilar y falla cuando el servidor corta la conexión
(`os error 10054`).

**Dónde está el tiempo de verdad**, por si se busca ahí: en la caché de Rust, que
no existe. `ci.yml` la guarda con `save-if: github.event_name != 'pull_request'`
—o sea, solo un push a `main`— y `main` acumula siete runs, todos fallidos antes
de compilar nada por el bloqueo de facturación. Cada job de PR compila ~900
dependencias desde cero. El primer merge a `main` que llegue al final puebla la
caché y esos 4-16 minutos por job caen a menos de uno.

### 2026-08-09 — Tomado el revert de upstream #5323: el arnés vuelve a auto-aprobar permisos

**Qué trae.** El primer merge de sincronización (`desktop-v0.5.8`) incluía,
además de los bumps de versión, el revert de block/buzz#4609: el arnés
`buzz-acp` deja de **rechazar** toda `session/request_permission` desatendida
y vuelve a **auto-aprobarla** con `allow_once`, con el modo de permisos por
defecto en `bypassPermissions` (antes `dont-ask`).

**La decisión y su porqué.** El primer instinto fue defender el rechazo como
divergencia (nuestras reglas allow ya habían devuelto la funcionalidad por la
vía estrecha). Decisión final del fundador: **seguir el camino de upstream
completo** — cero divergencia de código en `buzz-acp`, y también se descartó
el modo de sandbox propio para codex (PR #9, cerrado sin mergear). El
razonamiento: `buzz-acp` es zona caliente (un fix mergeado y revertido en
días), y mantener ahí postura propia + un lanzador propio del adaptador es
deuda de mantenimiento permanente para un fork cuyo producto es Pimia, no la
seguridad del arnés.

**Lo que esto significa y dónde queda la contención.** Desde este merge no
existe frontera de *comandos* para los agentes gestionados: el arnés aprueba
lo que el agente pida (claude además corre en `bypassPermissions`). La
contención pasa a ser: **quién puede activar a cada agente** (`respond_to` /
allowlists — mantenerlos cortos), **qué MCPs heredan** (scope usuario vacío,
ver «El estado fuera del repo») y **qué alcanza la máquina** donde corren.

**Un efecto lateral que se predijo y no se cumplió** (verificado el
2026-08-10, el día siguiente): se dio por hecho que los agentes codex
funcionarían ya en su modo `agent` por defecto, porque la escalación de red se
auto-aprobaría, y que `INITIAL_AGENT_MODE` dejaba de hacer falta. Falso: con
el arnés nuevo y sin esa variable, el agente codex de prueba **no pidió
escalar** (cero `request_permission` en su log) — se limitó a reportar el
fallo de DNS. El sandbox no emite señal distinguible de «bloqueado», así que
codex ve un error de red corriente. `INITIAL_AGENT_MODE=agent-full-access`
sigue siendo obligatorio para agentes codex; detalle en la receta, punto 3.
Los agentes claude sí quedaron como se esperaba: turno completado, sin
bloqueos de permiso.

**Qué vigilar en cada merge.** Upstream sigue iterando sobre permisos del
arnés. Si aterriza un modelo *con política configurable* (no todo-o-nada),
evaluar adoptarlo para recuperar frontera de comandos vía configuración.

### 2026-08-11 — Lo que publica a la infraestructura de Block sale del ciclo

**El disparador.** El job «Publish rolling release» de `sprig.yml` llevaba en
rojo **ocho de ocho merges a main** (PR #17 a #24, desde el 2026-08-10). Ningún
cambio nuestro lo rompió: viene así del fork.

Al tirar del hilo aparecieron **tres** workflows en rojo permanente, no uno, y
con una sola causa: publican a destinos que son de **Block**, y el fork no los
posee.

| Workflow | Qué intenta | Cómo falla |
|---|---|---|
| `sprig.yml` (job `publish`) | `gh release edit sprig-latest` | `release not found` |
| `docker.yml` (relay + push gateway) | push a `ghcr.io/block/buzz` y `…/buzz-push-gateway` | `denied: permission_denied: The requested installation does not exist` |
| `sprig-image.yml` | push a `ghcr.io/block/buzz-sprig` | ídem |

`sprig.yml` y `docker.yml` no llevan filtro de rutas en su disparador de
`push`, así que se caían en **todos** los merges; `sprig-image.yml`, en los que
tocaran `crates/**`.

**Y no era solo en main: los PRs también.** Esto se descubrió al abrir el PR de
esta misma divergencia, contra la predicción de que los builds de pull request
—que van con `push=false`— estaban a salvo. No lo estaban, y el motivo no se ve
en el `push`: es el **`cache-to`**. `docker.yml` y `sprig-image.yml` habilitan
la caché de registro cuando el PR sale de una rama del propio repo, y la
escriben en `${IMAGE_NAME}-buildcache:<arch>` — el GHCR de Block otra vez. De
ahí `error writing layer blob: denied: permission_denied`. Los runs de PR de
`docker.yml` llevaban en rojo desde el 2026-08-08, cuatro checks por PR.

La lección, que vale más allá de este caso: **`push: false` no significa «este
build no escribe en el registro»**. La caché es una escritura más, y va por su
propia condición.

**Por qué no se arregla, sino que se apaga.** La salida evidente para el primero
—hacer el paso idempotente (`gh release create … || gh release edit …`) o crear
`sprig-latest` a mano— pone el job en verde **fabricando** lo que le falta: una
release con binarios de Linux que aquí no consume nadie.

Sprig es el multicall estático de Linux (`buzz-acp` + `buzz-agent` +
`buzz-dev-mcp`) para agentes **en contenedor**. En este fork:

- Ningún script ni doc descarga el tarball. Cero consumidores.
- El backend de Kubernetes usa la **imagen**, no el tarball, y su
  `DEFAULT_IMAGE` está clavada en compilación al digest publicado por Block
  (`crates/buzz-backend-kubernetes/src/config.rs`).
- Nuestros agentes corren **en local, en el Mac** (ver «El estado fuera del
  repo»), contra el relay alojado de Block. No hay flota de Linux.

Lo mismo vale para las dos imágenes: usamos el relay de Block, no uno propio.

Y crear la release a mano tiene un defecto de más: es estado invisible fuera del
repo —justo lo que la sección «El estado fuera del repo» existe para catalogar,
porque un clon no lo reconstruye—. Un re-fork volvería a rojo sin rastro del
porqué.

**El mecanismo: variable de repositorio, no borrar el fichero.** Mismo idioma
que la divergencia de `windows-rust` en `ci.yml`. Un `if:` de una línea es la
superficie mínima frente a un merge de upstream; **borrar los workflows daría
conflicto delete/modify cada vez que upstream los toque**, y un
`gh workflow disable` es estado de API que no queda escrito en ninguna parte.

| Variable | Apaga |
|---|---|
| `CI_SPRIG_RELEASE` | el job `publish` de `sprig.yml` |
| `CI_RELAY_IMAGE` | los cuatro jobs de `docker.yml` (relay y push gateway) |
| `CI_SPRIG_IMAGE` | los jobs de `sprig-image.yml` |

**Qué se conserva encendido, a propósito:** el job `build` de `sprig.yml`. Es
verde y compila los crates de agente contra **musl estático**, cobertura que
`ci.yml` (glibc) no da. Ahí lo único que se apaga es la publicación.

Los dos workflows de imagen, en cambio, se apagan **enteros, PRs incluidos**.
El primer intento los gateó con
`vars.X == 'true' || github.event_name == 'pull_request'` para no perder la
validación de los `Dockerfile` antes de mergear; el propio PR demostró que esa
cobertura no existía —ver arriba, el `cache-to`—, así que la excepción solo
habría conservado seis checks en rojo por PR.

**Qué se pierde mientras esté apagado**: la publicación, y la compilación de
las dos imágenes. Nadie las construía en verde ni las consumía, así que no se
pierde ninguna señal que estuviera funcionando. El día que se enciendan, la
validación de los `Dockerfile` vuelve con ellas.

**Cómo se reactiva.** Encender la variable sola no basta para las imágenes: hay
que apuntarlas antes a un namespace propio, con las escotillas que upstream ya
dejó puestas (`GHCR_IMAGE`, `GHCR_SPRIG_IMAGE`).

```bash
gh variable set GHCR_IMAGE  --repo Pimia-AI/pimia-workspace --body ghcr.io/pimia-ai/buzz
gh variable set CI_RELAY_IMAGE --repo Pimia-AI/pimia-workspace --body true
```

Ese es exactamente el día que se ejerza la **válvula de escape** de la sección
«La estrategia»: autoalojar el relay y dejar de seguir el calendario de Block.
`CI_SPRIG_RELEASE` y `CI_SPRIG_IMAGE`, el día que haya agentes en Linux.

**Qué vigilar en cada merge.** Los tres `if:` viven en ficheros de upstream y
son la única divergencia en ellos: si un merge trae cambios en la cabecera de
esos jobs, conservar el gate. Y si algún día upstream mete el
`create || edit` idempotente en `sprig.yml` —es un fallo legítimo suyo, no
nuestro—, tomarlo sin problema: el gate lo sigue apagando aquí.

### 2026-08-22 — Sync a `desktop-v0.5.18`: la barra lateral de upstream se rehizo

Merge de sincronización de nueve releases de golpe (0.5.9 → 0.5.18, **174
commits**). El ciclo no se había corrido desde el 08-11, y esto es exactamente
lo que la sección «La estrategia» avisa que pasa: no fueron 4 ficheros en
conflicto sino **19**, y tres de ellos obligaron a reescribir la forma de una
divergencia. Se anota aquí, y no solo en el PR, por eso.

**Lo que upstream rediseñó y cómo quedó la divergencia:**

| Divergencia | Antes | Después del merge |
|---|---|---|
| **Dos barras** (`AppShell.tsx`) | `PimiaSidebar` a la izquierda, `AppSidebar` a la derecha con `side="right"` | igual, pero dentro de la estructura nueva de upstream: `AppWorkflowEditorOverlayProvider` envuelve todo y `AppShellChannelSurface` va dentro de `TerminalContextOverrideProvider`. La barra de Buzz se movió a *después* de la superficie otra vez |
| **Props de `AppSidebar`** | tipo en línea en `AppSidebar.tsx`, con `selectedView: AppView` importado para no repetir la unión | upstream extrajo el tipo a `AppSidebar.types.ts`. Las dos divergencias (`selectedView: AppView` y `side?: "left" \| "right"`) se mudaron ahí |
| **El menú navega solo** (`AppSidebarPrimaryMenu`) | `useAppNavigation()` en vez de `onSelectX` del shell | se conserva. Upstream pasó a cablear `onSelectAgents/Projects/Pulse/Workflows` desde `AppShell`; aquí siguen resolviéndose dentro. Sí entra `projectsOverviewActive`, que es dato y no callback |
| **Disparador de la barra a la derecha** (`AppTopChrome`) | iconos `PanelRightClose/Open`, disparador al final de la fila | se conserva. Upstream introdujo `DrawerPanelIcon`, que asume barra a la izquierda: no se usa aquí. El `div` portal `#app-top-chrome-content` de upstream entra, y el disparador va detrás |
| **Despeje de los semáforos** (`AppTopChrome`) | `pl-[80px]` siempre | igual. Upstream lo condiciona a `hasCommunityRail` porque su rail está a la izquierda; el nuestro está a la derecha, así que `AppTopChrome` **no recibe** esa prop |
| **Provider de barra por «scope»** (`sidebar-provider.tsx`) | extraído de `sidebar.tsx` para poder montar dos barras | se conserva. Se trajo de upstream la constante `MOBILE_ACTION_HIT_AREA`, que vivía en el bloque que aquí no existe |
| **`dragSidebarRail`** | en `tests/helpers/sidebar.ts`, parametrizado por lado | se conserva; la copia local que upstream volvió a meter en `sidebar.spec.ts` se descarta, y su test nuevo entra |
| **`deep_link.rs` y `lib.rs`** | `install()` + el brazo `oauth` de Pimia | upstream renombró `install` → `install_deep_link_handlers` y le añadió el arranque en frío de Windows/Linux. **`install()` era código de upstream, no nuestro**: se toma el suyo. El brazo `oauth` y los siete comandos `pimia_*` siguen |

**Los de regla fija**, sin sorpresas: `tauri.conf.json` (identidad nuestra,
versión suya), `package.json` (versión suya; nuestro `check` con
`check:file-sizes` y `check:pimia-boundary`), `Cargo.toml`/`Cargo.lock`
(versión), `pnpm-lock.yaml` (regenerado), `CHANGELOG.md` y
`.release/desktop-candidate.json` (bookkeeping suyo), `ci.yml` (auto-mergeado;
el recorte de plataformas intacto), `AGENTS.md` (las dos secciones conviven).

**`deny.toml`: la divergencia desaparece.** Ignorábamos `RUSTSEC-2026-0243`
(`nostr-relay-pool` sin mantenimiento) porque `mesh-llm` fijaba `nostr-sdk
0.44.1`. Upstream ya va en **0.45.1** y la crate no está en el lock: la entrada
sobraba y se toma el `deny.toml` de upstream tal cual.

**Y es lo que cura el job Security**, que llevaba rojo en `main` desde el
2026-08-19 por dos vulnerabilidades que solo se arreglan actualizando:
`RUSTSEC-2026-0258` (`h2` 0.4.14 → **0.4.16**, DATA frames vacíos sin límite) y
`RUSTSEC-2026-0257` (`webbrowser` 1.2.1 → **1.2.4**, inyección de argumentos por
`BROWSER` en Unix). Ninguna era de Pimia: eran deriva por no sincronizar.

**La lección, que ya estaba escrita y no se siguió:** la cadencia es «cada
release, o semanal». Nueve releases de retraso convirtieron un merge mecánico en
uno que obliga a reescribir divergencias. La próxima vez, antes.

### 2026-08-22 — CI por rutas: un patrón negado hacía correr el escritorio en PRs de solo documentación

**El síntoma.** El PR [#31](https://github.com/Pimia-AI/pimia-workspace/pull/31)
cambiaba **un fichero, `docs/DECISIONES.md`**, y arrancó el paquete entero de
escritorio: Desktop Core, build de macOS, 4 shards de smoke y 2 de integración.
~25 minutos de Actions por una línea de markdown.

**La causa, en el log de `Detect Changed Paths`:**

```
Filter desktop = true
Matching files:
docs/DECISIONES.md [modified]
```

El filtro `desktop` de upstream lleva `- '!desktop/src-tauri/**'`. Y
`dorny/paths-filter` corre con `predicate-quantifier: some` por defecto: un
filtro casa si **alguno** de sus patrones casa. Un patrón negado casa con todo
lo que esté **fuera** de lo negado — así que `docs/DECISIONES.md` casaba, y el
filtro salía `true`. Los filtros `web` y `mobile` no llevan negación y sí se
quedaban en `false`: la asimetría es la que delata que esto es un fallo de
upstream, no una intención.

**El arreglo: quitar esa línea.** Es la divergencia más pequeña que resuelve el
problema; `predicate-quantifier: every` no vale, porque los demás filtros son
listas de alternativas y las rompería.

**No cambia nada de lo que sí debe correr.** La negación nunca excluyó nada:
`desktop/src-tauri/x.rs` casa con `desktop/**` igualmente. Medido con picomatch
4.0.4, que es el que usa la acción:

| Fichero cambiado | `desktop` antes | `desktop` después |
|---|---|---|
| `docs/DECISIONES.md` | true | **false** |
| `desktop/src/app/App.tsx` | true | true |
| `desktop/src-tauri/src/lib.rs` | true | true |
| `crates/buzz-relay/src/main.rs` | true | **false** |

El último tampoco cambia qué se ejecuta: **ningún job se cierra sobre `desktop`
a solas** — todos van con `desktop || desktop-rust || rust`, y ahí `rust` ya es
`true`.

**Qué vigilar en cada merge.** La divergencia es **una línea que no está**, y
eso es justo lo que un merge vuelve a meter sin conflicto: si upstream toca el
bloque `filters:`, git reintroducirá `- '!desktop/src-tauri/**'` en silencio.
Comprobación de un vistazo tras cada sync:

```bash
grep -n "src-tauri" .github/workflows/ci.yml   # no debe salir dentro de `desktop:`
```

Y si algún día upstream arregla esto por su cuenta —el fallo es suyo—, tomarlo
y borrar esta entrada.
