import { createFileRoute } from "@tanstack/react-router";

import { PimiaCustomersScreen } from "@/features/pimia/ui/PimiaCustomersScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia/clientes")({
  component: PimiaCustomersRouteComponent,
});

function PimiaCustomersRouteComponent() {
  usePreviewFeatureWarning("pimia");
  return <PimiaCustomersScreen />;
}
