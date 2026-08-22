/**
 * Estado de una barra lateral, parametrizado por «scope».
 *
 * ⚠️ DIVERGENCIA ESTRUCTURAL CON UPSTREAM (Fase 1) — ver `docs/UPSTREAM.md`.
 *
 * El bloque `sidebar` de shadcn que Buzz copió al repo está escrito para UNA
 * sola barra: la clave de la cookie, la de `localStorage`, el atajo de teclado
 * y la variable CSS de anchura son constantes de módulo. Pimia Workspace monta
 * dos barras a la vez —la navegación del ERP a la izquierda y la de Buzz
 * (canales, DM, agentes) a la derecha— y cada una necesita su propio estado; si
 * no, se abren y se redimensionan juntas.
 *
 * La solución es un `SidebarScope` que el provider recibe por prop. Los valores
 * por defecto (`DEFAULT_SIDEBAR_SCOPE`) son exactamente los de upstream, así
 * que una barra sola se comporta igual que antes del fork.
 *
 * Este fichero existe además por una razón práctica: `sidebar.tsx` está en el
 * techo del trinquete de 1000 líneas de `scripts/check-file-sizes.mjs` y no
 * puede crecer. Sacar aquí el provider lo encoge.
 */

import * as React from "react";

import { useIsMobile } from "@/shared/hooks/use-mobile";
import { cn } from "@/shared/lib/cn";
import { hasPrimaryShortcutModifier } from "@/shared/lib/platform";
import { TooltipProvider } from "@/shared/ui/tooltip";

export const SIDEBAR_WIDTH_MOBILE = "288px";
export const SIDEBAR_WIDTH_ICON = "48px";

const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH_DEFAULT_HAPTIC_THRESHOLD = 2;
const SIDEBAR_WIDTH_DEFAULT_SNAP_DISTANCE = 8;
const SIDEBAR_WIDTH_DEFAULT_MAGNET_DISTANCE = 28;

/** Anchuras de una barra: el detente al que imanta y sus topes. */
export type SidebarWidthBounds = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

/**
 * Atajo de teclado de la barra, sobre el modificador principal de la
 * plataforma (⌘ en macOS, Ctrl en el resto). `shiftKey` se compara siempre:
 * exigirlo o prohibirlo es lo que permite que dos barras convivan sin pisarse.
 */
export type SidebarKeyboardShortcut = {
  key: string;
  shiftKey?: boolean;
};

/** Todo lo que distingue una barra de otra. */
export type SidebarScope = SidebarWidthBounds & {
  /** Identificador legible; viaja al DOM en `data-sidebar-scope`. */
  id: string;
  cookieName: string;
  widthStorageKey: string;
  /** `null` = esta barra no responde a ningún atajo. */
  keyboardShortcut: SidebarKeyboardShortcut | null;
};

/** El scope de upstream: barra única, con sus claves originales. */
export const DEFAULT_SIDEBAR_SCOPE: SidebarScope = {
  id: "default",
  cookieName: "sidebar_state",
  widthStorageKey: "buzz-sidebar-width",
  keyboardShortcut: { key: "s", shiftKey: false },
  defaultWidth: 300,
  minWidth: 220,
  maxWidth: 420,
};

export function clampSidebarWidth(width: number, bounds: SidebarWidthBounds) {
  return Math.min(
    bounds.maxWidth,
    Math.max(bounds.minWidth, Math.round(width)),
  );
}

export function isSidebarWidthNearDefault(
  width: number,
  bounds: SidebarWidthBounds,
) {
  return (
    Math.abs(width - bounds.defaultWidth) <=
    SIDEBAR_WIDTH_DEFAULT_HAPTIC_THRESHOLD
  );
}

export function magnetizeSidebarWidth(
  width: number,
  bounds: SidebarWidthBounds,
) {
  const offset = width - bounds.defaultWidth;
  const distance = Math.abs(offset);

  if (distance <= SIDEBAR_WIDTH_DEFAULT_SNAP_DISTANCE) {
    return bounds.defaultWidth;
  }

  if (distance >= SIDEBAR_WIDTH_DEFAULT_MAGNET_DISTANCE) {
    return clampSidebarWidth(width, bounds);
  }

  // Ease out of the detent so the default width feels sticky without blocking
  // resize.
  const progress =
    (distance - SIDEBAR_WIDTH_DEFAULT_SNAP_DISTANCE) /
    (SIDEBAR_WIDTH_DEFAULT_MAGNET_DISTANCE -
      SIDEBAR_WIDTH_DEFAULT_SNAP_DISTANCE);
  const easedDistance =
    SIDEBAR_WIDTH_DEFAULT_MAGNET_DISTANCE * progress * progress;

  return clampSidebarWidth(
    bounds.defaultWidth + Math.sign(offset) * easedDistance,
    bounds,
  );
}

export function hasReachedSidebarDefaultWidth(
  previousWidth: number,
  nextWidth: number,
  bounds: SidebarWidthBounds,
) {
  return (
    isSidebarWidthNearDefault(nextWidth, bounds) ||
    (previousWidth < bounds.defaultWidth && nextWidth > bounds.defaultWidth) ||
    (previousWidth > bounds.defaultWidth && nextWidth < bounds.defaultWidth)
  );
}

function readSidebarWidth(scope: SidebarScope) {
  if (typeof window === "undefined") {
    return scope.defaultWidth;
  }

  const storedWidth = Number.parseInt(
    window.localStorage.getItem(scope.widthStorageKey) ?? "",
    10,
  );

  return Number.isFinite(storedWidth)
    ? clampSidebarWidth(storedWidth, scope)
    : scope.defaultWidth;
}

function matchesSidebarShortcut(
  event: KeyboardEvent,
  shortcut: SidebarKeyboardShortcut,
) {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    event.shiftKey === (shortcut.shiftKey ?? false) &&
    hasPrimaryShortcutModifier(event)
  );
}

export type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  isRailDisabled: boolean;
  isResizing: boolean;
  setIsResizing: (isResizing: boolean) => void;
  scope: SidebarScope;
  sidebarWidth: number;
  setSidebarWidth: (width: number | ((width: number) => number)) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

export function useOptionalSidebar() {
  return React.useContext(SidebarContext);
}

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    disableRail?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Claves y anchuras propias. Sin él, las de upstream. */
    scope?: SidebarScope;
  }
>(
  (
    {
      defaultOpen = true,
      disableRail = false,
      open: openProp,
      onOpenChange: setOpenProp,
      scope = DEFAULT_SIDEBAR_SCOPE,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile();
    const [openMobile, setOpenMobile] = React.useState(false);
    const [isResizing, setIsResizing] = React.useState(false);
    const [sidebarWidth, setSidebarWidthState] = React.useState(() =>
      readSidebarWidth(scope),
    );

    const [_open, _setOpen] = React.useState(defaultOpen);
    const open = openProp ?? _open;
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value;
        if (setOpenProp) {
          setOpenProp(openState);
        } else {
          _setOpen(openState);
        }

        // biome-ignore lint/suspicious/noDocumentCookie: shadcn persists the sidebar open state with a cookie.
        document.cookie = `${scope.cookieName}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      },
      [scope.cookieName, setOpenProp, open],
    );

    const setSidebarWidth = React.useCallback(
      (value: number | ((width: number) => number)) => {
        setSidebarWidthState((currentWidth) => {
          const nextWidth = clampSidebarWidth(
            typeof value === "function" ? value(currentWidth) : value,
            scope,
          );

          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              scope.widthStorageKey,
              String(nextWidth),
            );
          }

          return nextWidth;
        });
      },
      [scope],
    );

    const toggleSidebar = React.useCallback(() => {
      return isMobile
        ? setOpenMobile((open) => !open)
        : setOpen((open) => !open);
    }, [isMobile, setOpen]);

    React.useEffect(() => {
      const shortcut = scope.keyboardShortcut;
      if (!shortcut) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (matchesSidebarShortcut(event, shortcut)) {
          event.preventDefault();
          toggleSidebar();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [scope.keyboardShortcut, toggleSidebar]);

    // We add a state so that we can do data-state="expanded" or "collapsed".
    // This makes it easier to style the sidebar with Tailwind classes.
    const state = open ? "expanded" : "collapsed";

    const contextValue = React.useMemo<SidebarContextProps>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        isRailDisabled: disableRail,
        isResizing,
        setIsResizing,
        scope,
        sidebarWidth,
        setSidebarWidth,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [
        state,
        open,
        setOpen,
        isMobile,
        disableRail,
        isResizing,
        scope,
        sidebarWidth,
        setSidebarWidth,
        openMobile,
        toggleSidebar,
      ],
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider>
          <div
            style={
              {
                "--sidebar-width": `${sidebarWidth}px`,
                "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                ...style,
              } as React.CSSProperties
            }
            className={cn(
              "group/sidebar-wrapper flex h-full min-h-0 w-full has-[[data-variant=inset]]:bg-sidebar",
              className,
            )}
            data-sidebar-scope={scope.id}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    );
  },
);
SidebarProvider.displayName = "SidebarProvider";
