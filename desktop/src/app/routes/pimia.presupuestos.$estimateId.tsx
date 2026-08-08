import { createFileRoute } from "@tanstack/react-router";

import { PimiaEstimateScreen } from "@/features/pimia/ui/PimiaEstimateScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia/presupuestos/$estimateId")({
  component: PimiaEstimateRouteComponent,
});

function PimiaEstimateRouteComponent() {
  usePreviewFeatureWarning("pimia");
  const { estimateId } = Route.useParams();
  return <PimiaEstimateScreen estimateId={estimateId} />;
}
