import { createFileRoute } from "@tanstack/react-router";

import { PimiaEstimatesScreen } from "@/features/pimia/ui/PimiaEstimatesScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia/presupuestos")({
  component: PimiaEstimatesRouteComponent,
});

function PimiaEstimatesRouteComponent() {
  usePreviewFeatureWarning("pimia");
  return <PimiaEstimatesScreen />;
}
