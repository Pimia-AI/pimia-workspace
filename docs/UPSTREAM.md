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
