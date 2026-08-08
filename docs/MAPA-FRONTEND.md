# Mapa del frontend de escritorio

Inventario dirigido del frontend de `desktop/`, hecho en la Fase 0 para que la
Fase 1 no tenga que redescubrirlo. Todo lo de aquí está verificado sobre el
commit base (`02f640bc`, upstream 0.5.7) y comprobado con los propios checks
del repo.

Lo que importa en una frase: **el shell es React 19 + TanStack Router sobre
Tauri 2, ya trae shadcn/ui instalado, y añadir una sección propia cuesta seis
ficheros y ninguna línea del core de mensajería.**

## 1. Dónde está cada cosa

| | Ruta |
|---|---|
| Aplicación de escritorio | `desktop/` (workspace de pnpm) |
| Núcleo Rust de la app | `desktop/src-tauri/` |
| Crates compartidas (relay, CLI, agentes) | `crates/` |
| Punto de entrada del frontend | `desktop/src/main.tsx` |
| Composición del shell | `desktop/src/app/` |
| Módulos funcionales (cortes verticales) | `desktop/src/features/` — 29 hoy |
| Código transversal | `desktop/src/shared/` (`ui`, `lib`, `api`, `theme`, `styles`, `hooks`, `context`) |

Tamaño del frontend: **1320 ficheros `.ts`/`.tsx`, ~270.000 líneas.** No es un
proyecto que se lea entero; se navega por `features/`.

El repo impone una **disciplina de 1000 líneas por fichero**
(`desktop/scripts/check-file-sizes.mjs`), con trinquete: un fichero que ya está
por encima no puede crecer más. Esto condiciona cómo se añaden secciones — ver
§5.

## 2. El router

**TanStack Router 1.168**, con rutas declaradas a mano (no por convención de
directorio):

- `desktop/src/app/routes.ts` — el manifiesto. Una línea por ruta, con
  `@tanstack/virtual-file-routes`.
- `desktop/src/app/routes/*.tsx` — una pantalla por ruta, cada una exportando
  `Route = createFileRoute("/loquesea")({ … })`.
- `desktop/src/app/routeTree.gen.ts` — **generado**, no se edita a mano. Lo
  regenera el plugin de Vite (`tanstackRouter` en `vite.config.ts`) en cada
  arranque o build. Si TypeScript se queja de que tu ruta no existe en
  `FileRoutesByPath`, es que no has corrido Vite todavía.
- `desktop/src/app/router.tsx` — la instancia del router.

Rutas de hoy: `/` (bandeja), `/agents`, `/pulse`, `/reminders` (redirige a `/`),
`/settings`, `/workflows[/$id]`, `/projects[/$id]`, `/messages/new`,
`/channels/$channelId[/posts/$postId]`, y `/pimia` (la nuestra).

La navegación no se hace con `<Link>` suelto sino por
`desktop/src/app/navigation/useAppNavigation.ts`, que expone un `goX()` por
destino y centraliza el historial (atrás/adelante, transiciones de vista).

## 3. La nav izquierda

Vive en `desktop/src/features/sidebar/`, montada sobre el bloque `sidebar` de
shadcn (`@/shared/ui/sidebar`: `Sidebar`, `SidebarContent`, `SidebarMenu`,
`SidebarMenuItem`, `SidebarRail`, `useSidebar`).

Dos piezas que conviene distinguir:

- **`ui/AppSidebar.tsx`** — la barra entera: secciones de canales, DMs,
  arrastrar y soltar, diálogos, tarjeta de perfil, estado del relay. Es el
  fichero grande (997 líneas) y **no hace falta tocarlo** para añadir una
  sección.
- **`ui/AppSidebarPinnedHeader.tsx`** → `AppSidebarPrimaryMenu` — el menú fijo
  de arriba: Bandeja, Pimia, Pulse, Projects, Agents, Workflows. **Aquí es
  donde se añade una entrada nueva.**

Cada entrada es un `SidebarMenuItem` con `SidebarMenuButton`, un icono de
`lucide-react` y un `SidebarMenuLabel`, envuelto en `<FeatureGate>`.

## 4. Estado, datos y la frontera

**No hay Redux, ni Zustand, ni Jotai.** El reparto es:

- **Estado de servidor**: TanStack Query 5.90
  (`shared/api/queryClient.ts`). Es donde vive prácticamente todo.
- **Estado de UI compartido**: Context de React —
  `app/AppShellContext.tsx`, `shared/context/{AgentSession,ChannelNavigation,ProfilePanel}Context.tsx`.
- **Estado de ruta**: la URL, vía TanStack Router (`validateSearch` por ruta).

En `desktop/src/shared/api/` conviven **dos canales de datos**, separados por
convención de nombre de fichero:

| Prefijo | Qué es | Cómo habla |
|---|---|---|
| `tauri*.ts` | El núcleo Rust de la app | `invoke()` sobre los **312 comandos** `#[tauri::command]` de `src-tauri/src/`. Permisos en `src-tauri/capabilities/default.json` |
| `relay*.ts` | El relay Nostr | WebSocket a `wss://<comunidad>.communities.buzz.xyz`. Reconexión, reintentos, límites y presencia, todo aquí |

**Y aquí es donde se apoya la frontera del plan.** Pimia es un tercer canal:
HTTP contra la API de Pimia (SDK + OAuth), y nada más. La regla revisable, ya
escrita en `docs/UPSTREAM.md`, es que **ningún módulo bajo `features/pimia/`
importa de `shared/api/relay*`**. El relay guarda los mensajes de canal en
claro en un Postgres que no administramos: los datos del ERP no pueden pasar
por ahí.

## 4-bis. La disposición objetivo: Pimia a la izquierda, Buzz a la derecha

⚠️ **Lo que hay hoy NO es la disposición del plan.** El placeholder de la Fase 0
es *una entrada más* dentro de la barra de Buzz. El objetivo (§ del plan, y
👤 fundador 2026-08-08) es otro: **la navegación del ERP ocupa la barra
izquierda y la de Buzz —canales, DM, agentes— se va a la derecha.** Eso es
reorganizar el shell, no añadir un enlace, y es trabajo de la Fase 1.

Lo verificado sobre cuánto cuesta:

- **A favor**: el `Sidebar` de shadcn ya acepta `side="left" | "right"`
  (`shared/ui/sidebar.tsx:286`). Mover `AppSidebar` a la derecha es un prop.
- **En contra, y es el trabajo de verdad**: `SidebarProvider` está escrito para
  **una sola barra**. Hay exactamente un `<SidebarProvider>` en toda la app
  (`AppShell.tsx:790`) y las claves de estado son constantes de módulo, no
  parámetros: `SIDEBAR_COOKIE_NAME = "sidebar_state"`,
  `SIDEBAR_WIDTH_STORAGE_KEY = "buzz-sidebar-width"`,
  `SIDEBAR_KEYBOARD_SHORTCUT = "s"`, y la anchura viaja por un único
  `--sidebar-width`. Dos barras con este código compartirían estado: se
  abrirían y redimensionarían juntas.
- **El panel derecho que ya existe no sirve para esto.**
  `shared/layout/AuxiliaryPanel*` es contextual —hilos de mensajes, perfiles,
  gestión de canales—, se abre y se cierra sobre el contenido. No es una barra
  de navegación permanente.

Camino recomendado para la Fase 1: parametrizar `sidebar.tsx` (que es código
copiado en el repo, no una dependencia) para que cada `SidebarProvider` reciba
sus propias claves de cookie, `localStorage`, atajo y variable CSS; luego
montar dos providers en `AppShell`, con `AppSidebar` en `side="right"` y la
nav del ERP en la izquierda. Es acotado y de una sola vez, pero **es una
divergencia estructural con upstream** y hay que anotarla en `UPSTREAM.md`
cuando se haga: `sidebar.tsx` es de los ficheros que upstream toca.

## 5. La receta: añadir una sección sin tocar el core de mensajería

Verificada: la sección «Pimia» de este repo se hizo exactamente así, y el
`pnpm check` completo (Biome + trinquete de tamaño + guards) pasa en verde.

Sirve para **añadir una sección a la barra existente**. Es la receta que la
Fase 1 usará para cada módulo del ERP una vez montada la disposición de dos
barras de §4-bis; no sustituye a ese trabajo.

**Seis ficheros. Ninguno del core de mensajería.**

1. **Declarar la feature** — `preview-features.json` (raíz del repo):

   ```json
   { "id": "pimia", "name": "Pimia",
     "description": "Panel del ERP de Pimia dentro del workspace",
     "defaultEnabled": true, "platforms": ["desktop"] }
   ```

   El manifiesto lista **solo** lo que necesita gate; lo que no está se
   renderiza siempre (falla en abierto). `defaultEnabled` decide si aparece sin
   que el usuario la active a mano.

2. **La pantalla** — `desktop/src/features/<seccion>/ui/<Seccion>Screen.tsx`.
   Un componente normal. Si es pesada, cárgala con `React.lazy` y envuélvela en
   `<React.Suspense>` (mira `routes/pulse.tsx` como referencia).

3. **La ruta** — `desktop/src/app/routes/<seccion>.tsx`:

   ```tsx
   export const Route = createFileRoute("/pimia")({ component: PimiaRouteComponent });
   ```

   Con `usePreviewFeatureWarning("<id>")` dentro del componente si la feature
   está en preview.

4. **Registrar la ruta** — una línea en `desktop/src/app/routes.ts`:
   `route("/pimia", "pimia.tsx")`. El árbol se regenera al arrancar Vite.

5. **La vista en el shell** — `desktop/src/app/AppShell.helpers.ts`: añade el
   literal a `AppView` y el caso a `deriveShellRoute()`, que traduce
   `location.pathname` en la vista activa. Sin esto, la nav marcaría Bandeja
   como activa mientras estás en tu sección.

6. **La entrada de menú** — `desktop/src/features/sidebar/ui/AppSidebarPinnedHeader.tsx`:

   ```tsx
   <FeatureGate feature="pimia">
     <SidebarMenuItem>
       <SidebarMenuButton
         data-testid="open-pimia-view"
         isActive={selectedView === "pimia"}
         onClick={() => void goPimia()}
         tooltip="Pimia"
         type="button"
       >
         <Receipt className="h-4 w-4" />
         <SidebarMenuLabel>Pimia</SidebarMenuLabel>
       </SidebarMenuButton>
     </SidebarMenuItem>
   </FeatureGate>
   ```

   Más `goPimia` en `app/navigation/useAppNavigation.ts` (copia de `goPulse`,
   son ocho líneas).

### El detalle que ahorra un dolor de cabeza

Upstream cablea cada sección pasando un `onSelectX` desde `AppShell.tsx` →
`AppSidebar.tsx` → `AppSidebarPrimaryMenu`. **No lo copies.** Esos dos ficheros
estaban en 999 y 1000 líneas, justo en el techo del trinquete de 1000: dos
secciones más por esa vía y el `pnpm check` se cae.

La sección Pimia llama a `useAppNavigation()` desde el propio menú. Es el
patrón que ya usa `features/sidebar/ui/ChannelActivityPopover.tsx`, así que no
inventa nada — y 31 ficheros de `features/` ya importan de `@/app/`, con lo que
la dirección de la dependencia tampoco es una novedad. Resultado medido: con la
sección añadida, `AppShell.tsx` bajó a 998 y `AppSidebar.tsx` a 997.

## 6. Temas y estilos (lo que la Fase 2 necesita saber)

**shadcn/ui ya está instalado.** No hay que introducirlo: hay que tematizarlo.

`desktop/components.json`:

```json
{ "style": "new-york", "rsc": false, "tsx": true,
  "tailwind": { "config": "tailwind.config.js",
                "css": "src/shared/styles/globals.css",
                "baseColor": "zinc", "cssVariables": true },
  "aliases": { "components": "@/shared/ui", "utils": "@/shared/lib/cn" } }
```

O sea: `pnpm dlx shadcn@latest add <componente>` funciona tal cual y aterriza
en `src/shared/ui/`.

- **Tailwind v4** (`@import "tailwindcss"` + `@config`), no v3.
- **Punto de entrada**: `src/shared/styles/globals.css`, que importa 17 hojas
  de `globals/`.
- **El tema vive en `src/shared/styles/globals/theme.css`** (852 líneas). Ese
  es el fichero que la Fase 2 tiene que reemplazar.
- Radix UI, `class-variance-authority`, `tailwind-merge`, `lucide-react`.
  Tipografía: Inter Variable + JetBrains Mono.
- Dos variantes propias en `globals.css`: `dark` va por la clase `.dark` en el
  raíz (no por preferencia del sistema), y `hover` está redefinida para
  esquivar un fallo de WebView2 en Windows.
- Hay además un sistema de **temas por comunidad** en `src/shared/theme/`
  (`ThemeProvider.tsx`, `theme-loader.ts`, `communityThemeSync.ts`): el tema se
  sincroniza con la comunidad del relay. Conviene mirarlo antes de imponer un
  tema fijo de Pimia — puede que la vía sea publicar el tema de Pimia como tema
  de comunidad en vez de tocar el CSS base.

**Decisión de dirección (👤 fundador, 2026-08-08): el tema de Buzz se queda.**
La estética del workspace es la sobriedad de Buzz, no la de
`@pimia/design-tokens`. Los tokens OKLCH del panel Vue **no se portan aquí**:
la llegada de React + shadcn es justamente la ocasión de adoptar un lenguaje
visual más sobrio.

Consecuencia práctica, y es una buena noticia: la Fase 2 deja de ser una
migración de tokens. No hay conversión OKLCH → HSL, no se reescriben las 852
líneas de `theme.css`, no hace falta un paquete de tema. Lo que queda es
mucho menor: la marca donde toque (nombre, iconos) y, si acaso, un acento
propio dentro del sistema de variables que ya existe. Cualquier cosa que se
escriba nueva debe usar las variables de `theme.css` tal cual
(`bg-background`, `text-muted-foreground`, `border-border`…) en vez de traer
colores propios — que es lo que hace el placeholder de `features/pimia/`.

## 7. ¿Hay sistema de plugins? No, y probablemente no hace falta

No existe mecanismo de extensiones de terceros: nada se carga en tiempo de
ejecución, todo se compila dentro. Lo que sí hay, y cubre buena parte de la
necesidad, es el **registro de features**:

- `preview-features.json` — el registro, con `id`, `name`, `description`,
  `defaultEnabled`, `platforms`.
- `desktop/src/shared/features/` — `FeatureGate.tsx`, `useFeatureEnabled.ts`,
  `resolveEnabled.ts`, `store.ts` (preferencia del usuario), `manifest.ts`.

Para la Fase 3 esto importa: el plan preveía **construir** un registro de
módulos con etiquetas, rutas e iconos. Medio registro ya existe. Lo que le
falta para que un vertical sea «configuración + módulos propios» es asociar
cada feature a su ruta y su entrada de nav, hoy repartidas entre `routes.ts` y
`AppSidebarPinnedHeader.tsx`. Es una extensión del registro que ya hay, no un
sistema nuevo.

## 8. Cómo arrancarlo

```bash
source /Volumes/data512/.toolchains/env.sh   # toolchain fuera del disco de arranque
just desktop-standalone
```

`desktop-standalone` es la receta correcta para trabajar contra el relay
hospedado: *«No relay, database, Docker, migrations, or .env are needed»*. No
levanta Docker — que en este Mac está parado a propósito. Compila los sidecars,
los copia a `desktop/src-tauri/binaries/`, arranca Vite y lanza `tauri dev` con
el identificador de dev (`es.pimia.workspace.dev`).

No uses `just fresh=1 desktop-standalone` salvo que quieras de verdad borrar el
estado local: esa vía llama a `scripts/reset-desktop-standalone-state.sh`.
