import { createFileRoute } from "@tanstack/react-router";

import { PimiaCustomerScreen } from "@/features/pimia/ui/PimiaCustomerScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia/clientes/$customerId")({
  component: PimiaCustomerRouteComponent,
});

function PimiaCustomerRouteComponent() {
  usePreviewFeatureWarning("pimia");
  const { customerId } = Route.useParams();
  return <PimiaCustomerScreen customerId={customerId} />;
}
