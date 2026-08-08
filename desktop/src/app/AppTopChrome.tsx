import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { isMacPlatform } from "@/shared/lib/platform";
import { useIsFullscreen } from "@/shared/lib/useIsFullscreen";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { topChromeBackdrop } from "@/shared/layout/chromeLayout";
import { useOptionalSidebar } from "@/shared/ui/sidebar";

type AppTopChromeProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
};

// Fixed px on purpose (button box + glyph): these controls sit beside the
// native macOS traffic lights, which ignore the app's Cmd +/- text zoom, so
// the row must not grow or shrink with the rem scale. Deliberate exception
// to the rem-first rule.
const TOP_CHROME_ICON_BUTTON_CLASS =
  "h-[28px] w-[28px] rounded-[4px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-[16px]";
const HISTORY_ICON_BUTTON_CLASS =
  "h-[28px] w-[24px] rounded-[4px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-[16px]";

function preventTopChromeWheel(event: WheelEvent) {
  event.preventDefault();
}

/**
 * Alterna la barra de Buzz. Divergencia Pimia: esa barra vive ahora a la
 * derecha, así que el botón se fue al extremo derecho del chrome y usa los
 * iconos de panel derecho. El `aria-label` no cambia — es el mismo control y
 * los e2e lo buscan por ese nombre. La barra izquierda (el ERP) no necesita
 * botón aquí: colapsa a iconos y trae el suyo en su cabecera.
 */
function TopChromeSidebarTrigger() {
  const sidebar = useOptionalSidebar();

  return (
    <Button
      aria-label="Toggle Sidebar"
      className={TOP_CHROME_ICON_BUTTON_CLASS}
      data-sidebar="trigger"
      disabled={!sidebar}
      onClick={() => {
        sidebar?.toggleSidebar();
      }}
      size="icon"
      type="button"
      variant="ghost"
    >
      {sidebar?.open ? <PanelRightClose /> : <PanelRightOpen />}
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

export function AppTopChrome({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: AppTopChromeProps) {
  const topChromeRef = React.useRef<HTMLDivElement>(null);
  const isFullscreen = useIsFullscreen();
  // On macOS the traffic-light buttons overlay the chrome (see
  // `trafficLightPosition` in `tauri.conf.json`), so the nav row clears their
  // x-position. In fullscreen those buttons hide.
  //
  // Divergencia Pimia: upstream reducía este despeje cuando el rail de
  // comunidades estaba presente, porque el rail ocupaba el extremo izquierdo.
  // El rail se fue a la derecha con la barra de Buzz, así que la fila siempre
  // tiene que despejar los semáforos enteros.
  //
  // Fixed px on purpose: the native traffic lights do not scale with the app's
  // Cmd +/- text zoom (rem), so rem-based clearance shrinks under them when
  // zoomed out. This is a deliberate exception to the rem-first rule.
  const macChrome = isMacPlatform() && !isFullscreen;
  const navRowPaddingClass = macChrome ? "pl-[80px]" : "pl-3";
  const navRowAlignmentClass = macChrome ? "translate-y-[3px]" : null;

  React.useEffect(() => {
    const topChrome = topChromeRef.current;
    if (!topChrome) {
      return;
    }

    const options = { capture: true, passive: false };
    topChrome.addEventListener("wheel", preventTopChromeWheel, options);
    return () => {
      topChrome.removeEventListener("wheel", preventTopChromeWheel, options);
    };
  }, []);

  return (
    <div
      ref={topChromeRef}
      className={cn(
        "relative z-45 flex shrink-0 cursor-default select-none items-center bg-sidebar pr-3 text-sidebar-foreground",
        topChromeBackdrop.height,
        navRowPaddingClass,
      )}
      data-tauri-drag-region
      data-testid="app-top-chrome"
    >
      <div className={cn("flex items-center gap-0.5", navRowAlignmentClass)}>
        <Button
          aria-label="Go back"
          className={HISTORY_ICON_BUTTON_CLASS}
          data-testid="global-back"
          disabled={!canGoBack}
          onClick={onGoBack}
          size="icon"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
        <Button
          aria-label="Go forward"
          className={HISTORY_ICON_BUTTON_CLASS}
          data-testid="global-forward"
          disabled={!canGoForward}
          onClick={onGoForward}
          size="icon"
          variant="ghost"
        >
          <ChevronRight />
        </Button>
      </div>
      <div
        className={cn(
          "ml-auto flex items-center gap-0.5",
          navRowAlignmentClass,
        )}
      >
        <TopChromeSidebarTrigger />
      </div>
    </div>
  );
}
