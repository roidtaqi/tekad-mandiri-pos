import { useEffect, useState } from "react";

import type { Cart, CartTotals } from "@kastur/domain";
import { Button, EmptyState, Input } from "@kastur/ui";

import { formatMoney, userFacingError } from "../shared/format.js";

function QuantityEditor({
  lineKey,
  quantity,
  onChange,
}: {
  readonly lineKey: string;
  readonly quantity: string;
  readonly onChange: (lineKey: string, quantity: string) => void;
}) {
  const [draft, setDraft] = useState(quantity);
  useEffect(() => setDraft(quantity), [quantity]);
  return (
    <Input
      aria-label="Jumlah item"
      className="cart-line__quantity"
      inputMode="decimal"
      onBlur={() => {
        try {
          onChange(lineKey, draft);
        } catch {
          setDraft(quantity);
        }
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      value={draft}
    />
  );
}

export function CartPanel({
  cart,
  totals,
  currency,
  onChangeQuantity,
  onRemove,
  onClear,
}: {
  readonly cart: Cart;
  readonly totals: CartTotals;
  readonly currency: string;
  readonly onChangeQuantity: (lineKey: string, quantity: string) => void;
  readonly onRemove: (lineKey: string) => void;
  readonly onClear: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const changeQuantity = (lineKey: string, quantity: string) => {
    try {
      onChangeQuantity(lineKey, quantity);
      setError(null);
    } catch (quantityError: unknown) {
      setError(userFacingError(quantityError));
      throw quantityError;
    }
  };

  return (
    <section className="cart-panel" aria-labelledby="cart-title">
      <div className="section-heading-row">
        <h2 id="cart-title">Keranjang</h2>
        {cart.lines.length > 0 ? (
          <Button onClick={onClear} size="compact" variant="ghost">Kosongkan</Button>
        ) : null}
      </div>
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {cart.lines.length === 0 ? (
        <EmptyState title="Keranjang kosong" description="Pindai barcode atau cari produk untuk memulai." />
      ) : (
        <div className="cart-lines">
          {cart.lines.map((line) => (
            <article className="cart-line" key={line.line_key}>
              <div className="cart-line__identity">
                <strong>{line.product_name}</strong>
                <small>{line.variant_name} · {formatMoney(line.unit_price, currency)}</small>
                {line.tier_code !== null && line.tier_code !== "RETAIL" ? (
                  <small>Tier {line.tier_code}</small>
                ) : null}
                {line.promotion_id !== null ? (
                  <small>
                    Promo · hemat {formatMoney(line.promotion_discount, currency)} / unit
                  </small>
                ) : null}
                {line.pricing_time_status === "CLOCK_UNTRUSTED" ? (
                  <small role="status">Waktu harga perlu verifikasi saat tersambung.</small>
                ) : null}
              </div>
              <QuantityEditor
                lineKey={line.line_key}
                onChange={changeQuantity}
                quantity={line.quantity}
              />
              <strong>{formatMoney(line.line_total, currency)}</strong>
              <Button
                aria-label={`Hapus ${line.product_name}`}
                onClick={() => onRemove(line.line_key)}
                size="compact"
                variant="ghost"
              >
                Hapus
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="cart-total">
        <span>Total</span>
        <strong>{formatMoney(totals.grand_total, currency)}</strong>
      </div>
    </section>
  );
}
