/**
 * La barra izquierda: la navegación del ERP de Pimia.
 *
 * Es la disposición del plan (👤 fundador): el ERP a la izquierda y Buzz
 * —canales, DM, agentes— a la derecha. Cada barra tiene su propio
 * `SidebarProvider` con sus claves; ver `app/sidebarScopes.ts`.
 *
 * Colapsa a iconos en vez de irse fuera de pantalla (`collapsible="icon"`):
 * es la navegación primaria del workspace y no puede quedarse sin una
 * superficie desde la que volver.
 *
 * LA FRONTERA (plan §1, innegociable): nada de este árbol habla con el relay.
 * Los datos del ERP viajan solo por la API de Pimia.
 */

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { FileText, LayoutDashboard, Receipt, Users } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX,
  PIMIA_SIDEBAR_SCOPE,
} from "@/app/sidebarScopes";
import { PimiaSidebarTenantCard } from "@/features/pimia/ui/PimiaSidebarTenantCard";
import { useMediaBreakpoint } from "@/shared/hooks/use-mobile";
import { SidebarProvider } from "@/shared/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/shared/ui/sidebar";
import { SidebarMenuLabel } from "@/shared/ui/sidebar-menu-label";

type PimiaNavEntry = {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  testId: string;
};

const PIMIA_NAV_ENTRIES: PimiaNavEntry[] = [
  {
    icon: LayoutDashboard,
    label: "Panel",
    path: "/pimia",
    testId: "pimia-nav-overview",
  },
  {
    icon: Users,
    label: "Clientes",
    path: "/pimia/clientes",
    testId: "pimia-nav-customers",
  },
  {
    icon: FileText,
    label: "Presupuestos",
    path: "/pimia/presupuestos",
    testId: "pimia-nav-estimates",
  },
  {
    icon: Receipt,
    label: "Facturas",
    path: "/pimia/facturas",
    testId: "pimia-nav-invoices",
  },
];

/** `/pimia/clientes/7` mantiene «Clientes» activo; `/pimia` solo se activa exacto. */
function isEntryActive(pathname: string, path: string) {
  if (path === "/pimia") {
    return pathname === "/pimia";
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * La barra trae su propio `SidebarProvider`: el del shell es el de Buzz, y sin
 * uno propio las dos compartirían estado. `className="contents"` quita la caja
 * del wrapper para que la barra siga siendo un hijo directo de la fila del
 * shell; las variables CSS (`--sidebar-width`) heredan igual.
 */
export function PimiaSidebar() {
  const isNarrowWindow = useMediaBreakpoint(
    PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX,
  );
  const [open, setOpen] = React.useState(() => !isNarrowWindow);

  // Se pliega y se despliega **al cruzar** el umbral, no mientras se está a un
  // lado: así una ventana estrecha no le roba 200 px al contenido, pero el
  // usuario sigue pudiendo abrirla a mano si quiere.
  React.useEffect(() => {
    setOpen(!isNarrowWindow);
  }, [isNarrowWindow]);

  return (
    <SidebarProvider
      className="contents"
      onOpenChange={setOpen}
      open={open}
      scope={PIMIA_SIDEBAR_SCOPE}
    >
      <PimiaSidebarSurface />
    </SidebarProvider>
  );
}

function PimiaSidebarSurface() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { goPimiaPath } = useAppNavigation();

  return (
    <Sidebar
      className="!border-l-0"
      collapsible="icon"
      data-testid="pimia-sidebar"
      side="left"
      variant="sidebar"
    >
      <SidebarHeader className="gap-0 px-2 pb-0 pt-3">
        <div className="flex h-8 items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:px-0">
          <span className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Pimia
          </span>
          {/* `aria-label` propio: el del chrome se llama «Toggle Sidebar» y
              varios e2e lo buscan por nombre exacto. */}
          <SidebarTrigger
            aria-label="Alternar la barra de Pimia"
            className="h-7 w-7 shrink-0 text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            data-testid="pimia-sidebar-trigger"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Ventas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PIMIA_NAV_ENTRIES.map((entry) => {
                const Icon = entry.icon;
                return (
                  <SidebarMenuItem key={entry.path}>
                    <SidebarMenuButton
                      data-testid={entry.testId}
                      isActive={isEntryActive(pathname, entry.path)}
                      onClick={() => void goPimiaPath(entry.path)}
                      tooltip={entry.label}
                      type="button"
                    >
                      <Icon className="h-4 w-4" />
                      <SidebarMenuLabel>{entry.label}</SidebarMenuLabel>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <PimiaSidebarTenantCard />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
