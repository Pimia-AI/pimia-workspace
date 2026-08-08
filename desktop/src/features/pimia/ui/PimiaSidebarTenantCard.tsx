/**
 * El pie de la barra del ERP: a qué tenant se está conectado y cómo cambiarlo.
 *
 * Un token vale para un solo tenant, así que «el tenant activo» no es un
 * detalle de configuración: es lo que decide qué datos se ven. Por eso vive a
 * la vista y no escondido en ajustes.
 */

import * as React from "react";
import { Building2, Plug, Unplug } from "lucide-react";

import { PimiaConnectDialog } from "@/features/pimia/ui/PimiaConnectDialog";
import {
  useActivePimiaTenant,
  useDisconnectPimiaTenant,
  usePimiaAuthQuery,
  useSetActivePimiaTenant,
} from "@/features/pimia/hooks/usePimiaAuth";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useSidebar } from "@/shared/ui/sidebar";

export function PimiaSidebarTenantCard() {
  const [isConnectOpen, setIsConnectOpen] = React.useState(false);
  const { state } = useSidebar();
  const { data: status } = usePimiaAuthQuery();
  const activeTenant = useActivePimiaTenant();
  const setActive = useSetActivePimiaTenant();
  const disconnect = useDisconnectPimiaTenant();
  const isCollapsed = state === "collapsed";

  if (!activeTenant) {
    return (
      <>
        <Button
          className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          data-testid="pimia-connect-tenant"
          onClick={() => setIsConnectOpen(true)}
          size="sm"
          title="Conectar Pimia"
          variant="outline"
        >
          <Plug className="h-4 w-4 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            Conectar Pimia
          </span>
        </Button>
        <PimiaConnectDialog
          onOpenChange={setIsConnectOpen}
          open={isConnectOpen}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-auto w-full justify-start gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            data-testid="pimia-tenant-card"
            title={activeTenant.label}
            variant="ghost"
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col items-start group-data-[collapsible=icon]:hidden">
              <span className="w-full truncate text-sm font-medium">
                {activeTenant.label}
              </span>
              <span className="w-full truncate text-2xs text-muted-foreground">
                {activeTenant.scopes.length} permisos
              </span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64"
          side={isCollapsed ? "right" : "top"}
        >
          <DropdownMenuLabel>Tenants conectados</DropdownMenuLabel>
          {(status?.tenants ?? []).map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onSelect={() => {
                if (tenant.id !== activeTenant.id) {
                  setActive.mutate(tenant.id);
                }
              }}
            >
              <Building2 className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{tenant.label}</span>
              {tenant.id === activeTenant.id ? (
                <span className="text-2xs text-muted-foreground">activo</span>
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsConnectOpen(true)}>
            <Plug className="h-4 w-4" />
            Conectar otro tenant
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            data-testid="pimia-disconnect-tenant"
            onSelect={() => disconnect.mutate(activeTenant.id)}
          >
            <Unplug className="h-4 w-4" />
            Desconectar {activeTenant.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PimiaConnectDialog
        onOpenChange={setIsConnectOpen}
        open={isConnectOpen}
      />
    </>
  );
}
