import { createFileRoute } from "@tanstack/react-router";

import { PimiaScreen } from "@/features/pimia/ui/PimiaScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia")({
  component: PimiaRouteComponent,
});

function PimiaRouteComponent() {
  usePreviewFeatureWarning("pimia");
  return <PimiaScreen />;
}
