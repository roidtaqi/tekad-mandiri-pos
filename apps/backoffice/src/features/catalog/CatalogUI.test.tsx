// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CatalogContext } from "./CatalogContext";
import { MockCatalogGateway } from "./MockCatalogGateway";
import CatalogRoutes from "./CatalogRoutes";
import { AuthContext } from "../auth/AuthContext";
import type { AuthContextResponse, ProductListQuery } from "@kastur/contracts";

const getGateway = () => new MockCatalogGateway();
const getAuth = (perms = ["product.read", "product.create"]): AuthContextResponse => ({
  user: { id: "u", display_name: "Test User" },
  membership: { business_id: "b", status: "ACTIVE" },
  primary_role: "OWNER",
  permissions: perms,
  authorization_version: 1,
  offline_valid_until: new Date(Date.now() + 86400000).toISOString(),
  default_location_id: "loc-1",
  server_time: new Date().toISOString()
});

function renderCatalog(initialPath = "/products", perms = ["product.read", "product.create"], customGateway = getGateway()) {
  return render(
    <AuthContext.Provider value={getAuth(perms)}>
      <CatalogContext.Provider value={customGateway}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/products/*" element={<CatalogRoutes />} />
          </Routes>
        </MemoryRouter>
      </CatalogContext.Provider>
    </AuthContext.Provider>
  );
}

describe("Catalog UI", () => {
  afterEach(cleanup);

  describe("Product List", () => {
    it("A, B, F: renders heading, loading state, and loaded rows", async () => {
      renderCatalog("/products");
      expect(screen.getByRole("heading", { name: "Produk" })).toBeDefined();
      expect(screen.getByLabelText("Memuat produk")).toBeDefined();

      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat produk")).toBeNull();
      });

      expect(screen.getAllByText("Indomie Goreng").length).toBeGreaterThan(0);
    });

    it("C: empty catalog state", async () => {
      const gw = getGateway();
      gw.listProducts = async () => ({ items: [], total: 0 });
      renderCatalog("/products", ["product.read", "product.create"], gw);

      await waitFor(() => {
        expect(screen.getByText("Tidak ada produk")).toBeDefined();
      });
    });

    it("D: no-results state", async () => {
      renderCatalog("/products?q=asdfasdfasdf");
      await waitFor(() => {
        expect(screen.getByText("Tidak ada hasil")).toBeDefined();
      });
    });

    it("E: gateway error state", async () => {
      const gw = getGateway();
      gw.listProducts = async () => { throw new Error("password authentication failed"); };
      renderCatalog("/products", ["product.read"], gw);

      await waitFor(() => {
        expect(screen.getByText("Gagal memuat produk. Silakan coba lagi.")).toBeDefined();
      });
      expect(screen.queryByText(/password authentication failed/i)).toBeNull();
    });

    it("G, H, I, J, K, L: interacting with filters updates URL state", async () => {
      let lastQuery: ProductListQuery | null = null;
      const gw = getGateway();
      const origList = gw.listProducts.bind(gw);
      gw.listProducts = async (q) => {
        lastQuery = q;
        return origList(q);
      };

      const App = () => (
        <MemoryRouter initialEntries={["/products"]}>
          <AuthContext.Provider value={getAuth(["product.read"])}>
            <CatalogContext.Provider value={gw}>
              <Routes>
                <Route path="/products/*" element={<CatalogRoutes />} />
              </Routes>
            </CatalogContext.Provider>
          </AuthContext.Provider>
        </MemoryRouter>
      );
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat produk")).toBeNull();
      });

      const searchInput = screen.getByPlaceholderText("Nama, SKU, atau Barcode");
      fireEvent.change(searchInput, { target: { value: "testq" } });

      const catSelect = screen.getByLabelText("Filter kategori");
      fireEvent.change(catSelect, { target: { value: "c1" } });

      const brandSelect = screen.getByLabelText("Filter brand");
      fireEvent.change(brandSelect, { target: { value: "b1" } });

      const statusSelect = screen.getByLabelText("Filter status");
      fireEvent.change(statusSelect, { target: { value: "ACTIVE" } });

      const trackSelect = screen.getByLabelText("Filter lacak stok");
      fireEvent.change(trackSelect, { target: { value: "true" } });

      const sortSelect = screen.getByLabelText("Urutkan");
      fireEvent.change(sortSelect, { target: { value: "name_asc" } });

      await waitFor(() => {
        expect(lastQuery?.q).toBe("testq");
        expect(lastQuery?.category_id).toBe("c1");
        expect(lastQuery?.brand_id).toBe("b1");
        expect(lastQuery?.status).toBe("ACTIVE");
        expect(lastQuery?.track_inventory).toBe(true);
        expect(lastQuery?.sort).toBe("name_asc");
      });
    });

    it("M, N: detail navigation and back navigation preserves state", async () => {
      renderCatalog("/products?q=indomie");
      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat produk")).toBeNull();
      });

      const details = screen.getAllByRole("button", { name: /Detail/i });
      fireEvent.click(details[0]!);

      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat detail produk")).toBeNull();
      });

      expect(screen.getAllByText("Ringkasan").length).toBeGreaterThan(0);

      const backBtn = screen.getByRole("button", { name: /Kembali/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat produk")).toBeNull();
      });
      const searchInput = screen.getByPlaceholderText("Nama, SKU, atau Barcode");
      expect((searchInput as HTMLInputElement).value).toBe("indomie");
    });

    it("O, P, Q, R: permission boundaries for list", async () => {
      const { unmount } = renderCatalog("/products", ["product.read", "product.create"]);
      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat produk")).toBeNull();
      });
      // Add button should be visible in header
      expect(screen.getAllByRole("button", { name: /Tambah Produk/i }).length).toBeGreaterThan(0);
      unmount();

      const { unmount: u2 } = renderCatalog("/products", ["product.read"]);
      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat produk")).toBeNull();
      });
      // Should not be visible
      expect(screen.queryByRole("button", { name: /Tambah Produk/i })).toBeNull();
      u2();

      renderCatalog("/products", []);
      await waitFor(() => {
        expect(screen.getByText("Akses Ditolak")).toBeDefined();
      });
    });

    it("S: leading-zero Barcode exact search", async () => {
      renderCatalog("/products?q=89686012345");
      await waitFor(() => {
        expect(screen.getByText("Tidak ada hasil")).toBeDefined();
      });

      renderCatalog("/products?q=089686012345");
      await waitFor(() => {
        expect(screen.getAllByText("Indomie Goreng").length).toBeGreaterThan(0);
      });
    });
  });

  describe("Add Product", () => {
    it("K: required-field validation prevents submission", async () => {
      const gw = getGateway();
      let called = false;
      gw.createProduct = async () => { called = true; return { product_id: "new", version: "1" }; };

      renderCatalog("/products/new", ["product.read", "product.create"], gw);
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Tambah Produk" })).toBeDefined();
      });

      const submitBtn = screen.getByRole("button", { name: "Simpan" });

      // Submit without filling required fields
      fireEvent.click(submitBtn);

      await new Promise(r => setTimeout(r, 10));

      expect(called).toBe(false);

      const nameInput = screen.getByLabelText(/Nama Produk/i) as HTMLInputElement;
      expect(nameInput.validity.valueMissing).toBe(true);
    });

    it("A, B, C, D, E, H, I: form validation, correct submission, optional brand, inventory tracking", async () => {
      const gw = getGateway();
      let createdArgs: any = null;
      let submitCount = 0;
      gw.createProduct = async (req) => {
        submitCount++;
        createdArgs = req;
        await new Promise(r => setTimeout(r, 20)); // wait slightly to test duplicate protection
        return { product_id: "new-p", version: "1" };
      };

      const origGet = gw.getProductDetail;
      gw.getProductDetail = async (id) => {
        if (id === "new-p") return { id: "new-p", name: "Test Prod", category: { name: "Cat" }, base_unit_code: "PCS", units: [] } as any;
        return origGet.call(gw, id);
      };

      renderCatalog("/products/new", ["product.read", "product.create"], gw);
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Tambah Produk" })).toBeDefined();
      });

      const submitBtn = screen.getByRole("button", { name: "Simpan" });

      // In happy-dom, standard HTML5 validation might prevent onClick from triggering if required fields are empty
      // So we will just fill in the fields, but omit brand to prove it's optional

      fireEvent.change(screen.getByLabelText(/Nama Produk/i), { target: { value: "Test Prod" } });
      fireEvent.change(screen.getByLabelText(/SKU/i), { target: { value: "SKU123" } });
      fireEvent.change(screen.getByLabelText(/Kategori/i), { target: { value: "c1" } }); // Fill required category
      fireEvent.change(screen.getByLabelText(/Unit Dasar/i), { target: { value: "PCS" } });

      const trackCheckbox = screen.getByLabelText(/Lacak stok untuk produk ini/i);
      fireEvent.click(trackCheckbox);

      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn); // Double click to test E (duplicate protection)

      await waitFor(() => {
        expect(createdArgs).not.toBeNull();
      });

      expect(submitCount).toBe(1); // duplicate prevented
      expect(createdArgs.name).toBe("Test Prod");
      expect(createdArgs.sku).toBe("SKU123");
      expect(createdArgs.category_id).toBe("c1");
      expect(createdArgs.base_unit_code).toBe("PCS");
      expect(createdArgs.brand_id).toBeNull(); // optional
      expect(createdArgs.track_inventory).toBe(false);

      // It should navigate to /products/new-p
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Ringkasan" })).toBeDefined();
      });
    });

    it("F, G: SKU_ALREADY_EXISTS shows error and values survive", async () => {
      const gw = getGateway();
      renderCatalog("/products/new", ["product.read", "product.create"], gw);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Tambah Produk" })).toBeDefined();
      });

      fireEvent.change(screen.getByLabelText(/Nama Produk/i), { target: { value: "Indomie" } });
      fireEvent.change(screen.getByLabelText(/SKU/i), { target: { value: "SKU001" } }); // already exists
      fireEvent.change(screen.getByLabelText(/Kategori/i), { target: { value: "c1" } });
      fireEvent.change(screen.getByLabelText(/Unit Dasar/i), { target: { value: "PCS" } });

      fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

      await waitFor(() => {
        expect(screen.getByText("SKU already exists")).toBeDefined();
      });

      expect((screen.getByLabelText(/Nama Produk/i) as HTMLInputElement).value).toBe("Indomie");
    });

    it("I: unexpected error", async () => {
      const gw = getGateway();
      gw.createProduct = async () => { throw new Error("Unknown DB Error"); };
      renderCatalog("/products/new", ["product.read", "product.create"], gw);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Tambah Produk" })).toBeDefined();
      });

      fireEvent.change(screen.getByLabelText(/Nama Produk/i), { target: { value: "Test" } });
      fireEvent.change(screen.getByLabelText(/SKU/i), { target: { value: "S1" } });
      fireEvent.change(screen.getByLabelText(/Kategori/i), { target: { value: "c1" } });
      fireEvent.change(screen.getByLabelText(/Unit Dasar/i), { target: { value: "PCS" } });

      fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

      await waitFor(() => {
        expect(screen.getByText("Produk gagal disimpan. Silakan coba lagi.")).toBeDefined();
      });
      expect(screen.queryByText(/Unknown DB Error/i)).toBeNull();
    });

    it("J: missing product.create denies form", async () => {
      renderCatalog("/products/new", ["product.read"]);
      await waitFor(() => {
        expect(screen.getByText("Akses Ditolak")).toBeDefined();
      });
    });
  });

  describe("Product Detail", () => {
    it("A-I, M: displays product fields correctly", async () => {
      renderCatalog("/products/p1");

      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat detail produk")).toBeNull();
      });

      // A: Name/SKU
      expect(screen.getAllByText(/Indomie Goreng/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/SKU001/i).length).toBeGreaterThan(0);

      // B, C, D: status, category, brand
      expect(screen.getAllByText(/Aktif/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Makanan Ringan/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Indofood/i).length).toBeGreaterThan(0);

      // F: Base unit badge
      expect(screen.getAllByText("Unit Dasar").length).toBeGreaterThan(0);

      // G: Exact conversion string
      expect(screen.getAllByText("1 PCS = 1 PCS").length).toBeGreaterThan(0);
      expect(screen.getAllByText("1 DUS = 40 PCS").length).toBeGreaterThan(0);

      // H: Barcode
      expect(screen.getAllByText("089686012345").length).toBeGreaterThan(0);

      // M: No fabricated values (price, etc. is disabled)
      expect(screen.getAllByText("Belum tersedia pada tahap ini").length).toBeGreaterThan(0);
    });

    it("E: NULL Brand representation", async () => {
      const gw = getGateway();
      const orig = gw.getProductDetail;
      gw.getProductDetail = async (id) => {
        const p = await orig.call(gw, id);
        return { ...p, brand: null };
      };

      renderCatalog("/products/p1", ["product.read"], gw);
      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat detail produk")).toBeNull();
      });

      const brandLabel = screen.getByText("Brand");
      expect(brandLabel.parentElement?.textContent).toContain("-");
    });

    it("J: no matching Base ProductUnit shows Unit dasar belum dikonfigurasi", async () => {
      const gw = getGateway();
      const orig = gw.getProductDetail;
      gw.getProductDetail = async (id) => {
        const p = await orig.call(gw, id);
        return { ...p, units: [] }; // No units
      };
      renderCatalog("/products/p1", ["product.read"], gw);

      await waitFor(() => {
        expect(screen.queryByLabelText("Memuat detail produk")).toBeNull();
      });

      expect(screen.getAllByText("Unit dasar belum dikonfigurasi").length).toBeGreaterThan(0);
    });

    it("K: ENTITY_NOT_FOUND", async () => {
      renderCatalog("/products/p-unknown");
      await waitFor(() => {
        expect(screen.getByText("Produk tidak ditemukan")).toBeDefined();
      });
    });

    it("L: unexpected error", async () => {
      const gw = getGateway();
      gw.getProductDetail = async () => { throw new Error("relation catalog.products does not exist"); };
      renderCatalog("/products/p1", ["product.read"], gw);
      await waitFor(() => {
        expect(screen.getByText("Gagal memuat produk. Silakan coba lagi.")).toBeDefined();
      });
      expect(screen.queryByText(/relation catalog.products does not exist/i)).toBeNull();
    });
  });
});
