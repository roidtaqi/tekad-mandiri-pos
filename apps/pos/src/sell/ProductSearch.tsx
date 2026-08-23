import { useRef, useState, type FormEvent } from "react";

import type { ProductLookupResult, PosProductLookup } from "@kastur/local-db";
import { Button, EmptyState, Field, Input } from "@kastur/ui";

import { formatMoney, userFacingError } from "../shared/format.js";

export function ProductSearch({
  businessId,
  currency,
  lookup,
  onAdd,
  onFinished,
}: {
  readonly businessId: string;
  readonly currency: string;
  readonly lookup: PosProductLookup;
  readonly onAdd: (product: ProductLookupResult) => void;
  readonly onFinished: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly ProductLookupResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim() === "") return;
    setSearching(true);
    setError(null);
    try {
      setResults((await lookup.searchProducts(businessId, query)).slice(0, 30));
    } catch (searchError: unknown) {
      setResults([]);
      setError(userFacingError(searchError));
    } finally {
      setSearching(false);
    }
  };

  const add = (product: ProductLookupResult) => {
    onAdd(product);
    inputRef.current?.blur();
    onFinished();
  };

  return (
    <section className="product-search" aria-labelledby="product-search-title">
      <h2 id="product-search-title">Cari Produk</h2>
      <form className="product-search__form" onSubmit={(event) => void submit(event)}>
        <Field label="Nama, SKU, atau barcode">
          <Input
            ref={inputRef}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Ketik lalu Enter"
            value={query}
          />
        </Field>
        <Button loading={searching} loadingLabel="Mencari" type="submit">
          Cari
        </Button>
      </form>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {results.length === 0 && query !== "" && !searching && !error ? (
        <EmptyState title="Produk tidak ditemukan" description="Coba nama, SKU, atau barcode lain." />
      ) : null}
      <div className="product-results">
        {results.map((product) => (
          <button
            className="product-result"
            key={product.product_unit_id}
            onClick={() => add(product)}
            type="button"
          >
            <span>
              <strong>{product.product_name}</strong>
              <small>{product.variant_name} · {product.sku}</small>
            </span>
            <strong>{formatMoney(product.unit_price, currency)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
