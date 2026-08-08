import { index, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route("/agents", "agents.tsx"),
  route("/pimia", "pimia.tsx"),
  route("/pimia/clientes", "pimia.clientes.tsx"),
  route("/pimia/clientes/$customerId", "pimia.clientes.$customerId.tsx"),
  route("/pimia/presupuestos", "pimia.presupuestos.tsx"),
  route(
    "/pimia/presupuestos/$estimateId",
    "pimia.presupuestos.$estimateId.tsx",
  ),
  route("/pulse", "pulse.tsx"),
  route("/reminders", "reminders.tsx"),
  route("/settings", "settings.tsx"),
  route("/workflows", "workflows.tsx"),
  route("/workflows/$workflowId", "workflows.$workflowId.tsx"),
  route("/projects", "projects.tsx"),
  route("/projects/$projectId", "projects.$projectId.tsx"),
  route("/messages/new", "messages.new.tsx"),
  route("/channels/$channelId", "channels.$channelId.tsx"),
  route(
    "/channels/$channelId/posts/$postId",
    "channels.$channelId.posts.$postId.tsx",
  ),
]);
