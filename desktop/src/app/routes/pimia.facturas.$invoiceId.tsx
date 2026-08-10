import { createFileRoute } from "@tanstack/react-router";

import { PimiaInvoiceScreen } from "@/features/pimia/ui/PimiaInvoiceScreen";
import { usePreviewFeatureWarning } from "@/shared/features";

export const Route = createFileRoute("/pimia/facturas/$invoiceId")({
  component: PimiaInvoiceRouteComponent,
});

function PimiaInvoiceRouteComponent() {
  usePreviewFeatureWarning("pimia");
  const { invoiceId } = Route.useParams();
  return <PimiaInvoiceScreen invoiceId={invoiceId} />;
}
