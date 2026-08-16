import { Route, Routes } from "react-router-dom";
import ProductList from "./ProductList";
import AddProduct from "./AddProduct";
import ProductDetail from "./ProductDetail";
import { useAuthContext } from "../auth/AuthContext";
import { hasCachedPermission } from "@kastur/auth-client";
import { EmptyState, Spinner } from "@kastur/ui";

export default function CatalogRoutes() {
  const authContext = useAuthContext();
  
  if (!authContext) {
    return <Spinner label="Memuat sesi..." />;
  }

  if (!hasCachedPermission(authContext, "product.read")) {
    return <EmptyState title="Akses Ditolak" description="Anda tidak memiliki izin untuk mengakses produk." />;
  }

  return (
    <Routes>
      <Route index element={<ProductList />} />
      <Route path="new" element={<AddProduct />} />
      <Route path=":productId" element={<ProductDetail />} />
    </Routes>
  );
}
