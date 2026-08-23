import CatalogRoutes from "./CatalogRoutes";
import { CatalogWorkspace } from "./CatalogWorkspace";
import { useBackofficeRuntime } from "../../runtime/RuntimeContext";

export default function CatalogRouteEntry() {
  const { authContext, catalogGateway } = useBackofficeRuntime();
  return (
    <CatalogWorkspace authContext={authContext} catalogGateway={catalogGateway}>
      <CatalogRoutes />
    </CatalogWorkspace>
  );
}
