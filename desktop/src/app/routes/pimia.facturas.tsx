import { createFileRoute } from "@tanstack/react-router";

import { PimiaInvoicesScreen } from "@/features/pimia/ui/PimiaInvoicesScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia/facturas")({
  component: PimiaInvoicesRouteComponent,
});

function PimiaInvoicesRouteComponent() {
  usePreviewFeatureWarning("pimia");
  return <PimiaInvoicesScreen />;
}
