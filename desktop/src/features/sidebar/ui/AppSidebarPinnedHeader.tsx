import { Activity, Bot, FolderGit2, Inbox, Zap } from "lucide-react";

import type { AppView } from "@/app/AppShell.helpers";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { TopbarSearch } from "@/features/search/ui/TopbarSearch";
import { FeatureGate } from "@/shared/features";
import type { Channel, SearchHit } from "@/shared/api/types";
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";
import { SidebarMenuLabel } from "@/shared/ui/sidebar-menu-label";

// Divergencia Pimia: era una copia literal de la unión de `AppView`.
type SidebarSelectedView = AppView;

type AppSidebarPinnedHeaderProps = {
  channelLabels: Record<string, string>;
  currentPubkey?: string;
  onBrowseChannels?: () => void;
  onCreateAgent: () => void;
  onCreateChannel: () => void;
  onOpenDm: (input: { pubkeys: string[] }) => Promise<void>;
  onOpenSearchResult: (hit: SearchHit) => void;
  onSelectChannel: (channelId: string) => void;
  searchChannels: Channel[];
  searchFocusRequest: number;
  suggestionChannels: Channel[];
};

type AppSidebarPrimaryMenuProps = {
  homeBadgeCount: number;
  onSelectHome: () => void;
  selectedView: SidebarSelectedView;
};

export function AppSidebarPinnedHeader({
  channelLabels,
  currentPubkey,
  onBrowseChannels,
  onCreateAgent,
  onCreateChannel,
  onOpenDm,
  onOpenSearchResult,
  onSelectChannel,
  searchChannels,
  searchFocusRequest,
  suggestionChannels,
}: AppSidebarPinnedHeaderProps) {
  return (
    <div
      className="mx-[3px] shrink-0 px-2 pb-2 pt-3"
      data-testid="sidebar-pinned-header"
    >
      <TopbarSearch
        channelLabels={channelLabels}
        channels={searchChannels}
        currentPubkey={currentPubkey}
        focusRequest={searchFocusRequest}
        onOpenChannel={onSelectChannel}
        onOpenResult={onOpenSearchResult}
        onOpenUser={(user) => onOpenDm({ pubkeys: [user.pubkey] })}
        onBrowseChannels={onBrowseChannels}
        onCreateAgent={onCreateAgent}
        onCreateChannel={onCreateChannel}
        suggestionChannels={suggestionChannels}
      />
    </div>
  );
}

export function AppSidebarPrimaryMenu({
  homeBadgeCount,
  onSelectHome,
  selectedView,
}: AppSidebarPrimaryMenuProps) {
  // Divergencia Pimia: el menú navega desde aquí en vez de recibir un
  // `onSelectX` cableado en `AppShell`. Es el patrón que ya usa
  // `ChannelActivityPopover`, y evita que cada sección nueva engorde
  // `AppShell.tsx` y `AppSidebar.tsx`, que están en el techo del ratchet.
  // `onSelectHome` sí sigue viniendo del shell: `AppSidebar` lo usa además
  // para volver a la bandeja al ocultar el canal activo.
  const { goAgents, goProjects, goPulse, goWorkflows } = useAppNavigation();

  return (
    <SidebarHeader
      className="relative z-40 cursor-default select-none px-2 pb-0 pt-0"
      data-tauri-drag-region
      data-testid="sidebar-primary-menu"
    >
      <SidebarMenu className="pb-2">
        <SidebarMenuItem>
          <SidebarMenuButton
            className="data-[active=true]:font-normal"
            isActive={selectedView === "home"}
            onClick={onSelectHome}
            tooltip="Inbox"
            type="button"
          >
            <Inbox
              className={
                selectedView !== "home" ? "h-4 w-4 opacity-80" : "h-4 w-4"
              }
            />
            <SidebarMenuLabel
              className={selectedView !== "home" ? "opacity-80" : undefined}
            >
              Inbox
            </SidebarMenuLabel>
          </SidebarMenuButton>
          {homeBadgeCount > 0 ? (
            <SidebarMenuBadge
              className="right-2 rounded-full bg-primary/15 px-1.5 text-2xs text-primary peer-data-[active=true]/menu-button:bg-sidebar-active-foreground/20 peer-data-[active=true]/menu-button:text-sidebar-active-foreground"
              data-testid="sidebar-home-count"
            >
              {Math.min(homeBadgeCount, 99)}
            </SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
        <FeatureGate feature="pulse">
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="open-pulse-view"
              isActive={selectedView === "pulse"}
              onClick={() => void goPulse()}
              tooltip="Pulse"
              type="button"
            >
              <Activity className="h-4 w-4" />
              <SidebarMenuLabel>Pulse</SidebarMenuLabel>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </FeatureGate>
        <FeatureGate feature="projects">
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="open-projects-view"
              isActive={selectedView === "projects"}
              onClick={() => void goProjects()}
              tooltip="Projects"
              type="button"
            >
              <FolderGit2 className="h-4 w-4" />
              <SidebarMenuLabel>Projects</SidebarMenuLabel>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </FeatureGate>
        <SidebarMenuItem>
          <SidebarMenuButton
            className="data-[active=true]:font-normal"
            data-testid="open-agents-view"
            isActive={selectedView === "agents"}
            onClick={() => void goAgents()}
            tooltip="Agents"
            type="button"
          >
            <Bot
              className={
                selectedView !== "agents" ? "h-4 w-4 opacity-80" : "h-4 w-4"
              }
            />
            <SidebarMenuLabel
              className={selectedView !== "agents" ? "opacity-80" : undefined}
            >
              Agents
            </SidebarMenuLabel>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <FeatureGate feature="workflows">
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="open-workflows-view"
              isActive={selectedView === "workflows"}
              onClick={() => void goWorkflows()}
              tooltip="Workflows"
              type="button"
            >
              <Zap className="h-4 w-4" />
              <SidebarMenuLabel>Workflows</SidebarMenuLabel>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </FeatureGate>
      </SidebarMenu>
    </SidebarHeader>
  );
}
