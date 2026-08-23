import { useState, type FormEvent } from "react";
import { Button, Field, Heading, Input, Select, Stack, Surface, Text, Textarea } from "@kastur/ui";

import { useBackofficeRuntime } from "../../runtime/RuntimeContext";
import type {
  PurchaseCreatePayload,
  PurchaseInvoicePayload,
  PurchaseReceiptPayload,
} from "../../runtime/command-gateway";
import { ResourcePage } from "../resources/ResourcePage";
import {
  CommandSurface,
  OperationFormPage,
  OperationIndex,
  RemoveLineButton,
  TechnicalId,
  idLines,
  integerInput,
  nowLocalInput,
  nullable,
  toIso,
  useCommandSubmission,
  useStoredDeviceId,
} from "./shared";

const purchaseLinks = [
  { label: "Buat purchase", path: "/purchasing/create", permission: "purchase.create" },
  { label: "Terima barang", path: "/purchasing/receive", permission: "purchase.receive" },
  { label: "Catat invoice", path: "/purchasing/invoice", permission: "purchase.update_draft" },
  { label: "Post purchase", path: "/purchasing/post", permission: "purchase.post" },
] as const;

const newPurchaseItem = () => ({
  item_id: crypto.randomUUID(),
  product_id: "",
  product_unit_id: "",
  expected_qty: "1",
  conversion_snapshot: "1",
  agreed_unit_price: "",
  agreed_discount_amount: "0",
  agreed_free_qty: "0",
});

const newReceiptItem = () => ({
  receipt_item_id: crypto.randomUUID(),
  purchase_item_id: "",
  product_id: "",
  product_unit_id: "",
  received_qty: "1",
  accepted_qty: "1",
  rejected_qty: "0",
  free_qty_received: "0",
  conversion_snapshot: "1",
  rejection_reason: "",
});

const newInvoiceItem = () => ({
  invoice_item_id: crypto.randomUUID(),
  purchase_item_id: "",
  invoiced_qty: "1",
  free_qty: "0",
  unit_price: "0",
  item_discount_amount: "0",
  tax_amount: "0",
});

const newCharge = () => ({
  charge_id: crypto.randomUUID(),
  type: "FREIGHT" as const,
  amount: "0",
  description: "",
});

export function PurchasingIndexPage() {
  return (
    <OperationIndex links={purchaseLinks}>
      <ResourcePage page="purchases" />
    </OperationIndex>
  );
}

export function PurchaseCreatePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [purchaseId] = useState(() => crypto.randomUUID());
  const [purchaseNumber, setPurchaseNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => nowLocalInput().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([newPurchaseItem()]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: PurchaseCreatePayload = {
      purchase_id: purchaseId,
      purchase_number: purchaseNumber.trim(),
      purchase_date: purchaseDate,
      supplier_id: supplierId.trim(),
      notes: nullable(notes),
      items: items.map((item) => ({
        ...item,
        product_id: item.product_id.trim(),
        product_unit_id: item.product_unit_id.trim(),
        agreed_unit_price: nullable(item.agreed_unit_price),
      })),
    };
    void submission.execute(deviceId, payload, (identity, body) =>
      commandGateway.createPurchase(identity, body));
  };

  return (
    <OperationFormPage backTo="/purchasing" description="Membuat draft purchase dengan item dan snapshot konversi eksplisit." permission="purchase.create" title="Buat Purchase">
      <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Buat purchase">
        <TechnicalId label="Purchase ID baru" value={purchaseId} />
        <div className="operation-grid">
          <Field label="Nomor purchase" required><Input required value={purchaseNumber} onChange={(event) => setPurchaseNumber(event.currentTarget.value)} /></Field>
          <Field label="Tanggal purchase" required><Input required type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.currentTarget.value)} /></Field>
          <Field label="Supplier ID" required><Input required value={supplierId} onChange={(event) => setSupplierId(event.currentTarget.value)} /></Field>
        </div>
        <Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></Field>
        <LineSection title="Item purchase" onAdd={() => setItems((current) => [...current, newPurchaseItem()])}>
          {items.map((item, index) => (
            <Surface className="operation-line" elevation={0} padding="default" key={item.item_id}>
              <Stack gap={3}>
                <TechnicalId label={`Item ${index + 1} ID`} value={item.item_id} />
                <div className="operation-grid">
                  <Field label="Product ID" required><Input required value={item.product_id} onChange={(event) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, product_id: event.currentTarget.value } : entry))} /></Field>
                  <Field label="Product Unit ID" required><Input required value={item.product_unit_id} onChange={(event) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, product_unit_id: event.currentTarget.value } : entry))} /></Field>
                  <DecimalField label="Qty diharapkan" value={item.expected_qty} onChange={(value) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, expected_qty: value } : entry))} />
                  <DecimalField label="Snapshot konversi" value={item.conversion_snapshot} onChange={(value) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, conversion_snapshot: value } : entry))} />
                  <Field label="Harga unit disepakati" description="Kosong jika belum disepakati"><Input inputMode="decimal" value={item.agreed_unit_price} onChange={(event) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, agreed_unit_price: event.currentTarget.value } : entry))} /></Field>
                  <DecimalField label="Diskon item" value={item.agreed_discount_amount} onChange={(value) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, agreed_discount_amount: value } : entry))} />
                  <DecimalField label="Qty gratis" value={item.agreed_free_qty} onChange={(value) => setItems((current) => current.map((entry) => entry.item_id === item.item_id ? { ...entry, agreed_free_qty: value } : entry))} />
                </div>
                {items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((entry) => entry.item_id !== item.item_id))} /> : null}
              </Stack>
            </Surface>
          ))}
        </LineSection>
      </CommandSurface>
    </OperationFormPage>
  );
}

export function PurchaseReceivePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [receiptId] = useState(() => crypto.randomUUID());
  const [purchaseId, setPurchaseId] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receivedAt, setReceivedAt] = useState(nowLocalInput);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([newReceiptItem()]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: PurchaseReceiptPayload = {
      purchase_id: purchaseId.trim(), receipt_id: receiptId, receipt_number: receiptNumber.trim(),
      received_at: toIso(receivedAt), notes: nullable(notes),
      items: items.map((item) => ({ ...item, purchase_item_id: item.purchase_item_id.trim(), product_id: item.product_id.trim(), product_unit_id: item.product_unit_id.trim(), rejection_reason: nullable(item.rejection_reason) })),
    };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.receivePurchase(identity, body));
  };

  return (
    <OperationFormPage backTo="/purchasing" description="Mencatat penerimaan fisik terhadap purchase yang sudah ada." permission="purchase.receive" title="Terima Barang">
      <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Catat penerimaan">
        <TechnicalId label="Receipt ID baru" value={receiptId} />
        <div className="operation-grid">
          <Field label="Purchase ID" required><Input required value={purchaseId} onChange={(event) => setPurchaseId(event.currentTarget.value)} /></Field>
          <Field label="Nomor receipt" required><Input required value={receiptNumber} onChange={(event) => setReceiptNumber(event.currentTarget.value)} /></Field>
          <Field label="Waktu diterima" required><Input required type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.currentTarget.value)} /></Field>
        </div>
        <Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></Field>
        <LineSection title="Item penerimaan" onAdd={() => setItems((current) => [...current, newReceiptItem()])}>
          {items.map((item, index) => (
            <Surface className="operation-line" elevation={0} padding="default" key={item.receipt_item_id}>
              <Stack gap={3}>
                <TechnicalId label={`Receipt item ${index + 1} ID`} value={item.receipt_item_id} />
                <div className="operation-grid">
                  <Field label="Purchase Item ID" required><Input required value={item.purchase_item_id} onChange={(event) => updateReceipt(setItems, item.receipt_item_id, "purchase_item_id", event.currentTarget.value)} /></Field>
                  <Field label="Product ID" required><Input required value={item.product_id} onChange={(event) => updateReceipt(setItems, item.receipt_item_id, "product_id", event.currentTarget.value)} /></Field>
                  <Field label="Product Unit ID" required><Input required value={item.product_unit_id} onChange={(event) => updateReceipt(setItems, item.receipt_item_id, "product_unit_id", event.currentTarget.value)} /></Field>
                  <DecimalField label="Qty diterima" value={item.received_qty} onChange={(value) => updateReceipt(setItems, item.receipt_item_id, "received_qty", value)} />
                  <DecimalField label="Qty diterima baik" value={item.accepted_qty} onChange={(value) => updateReceipt(setItems, item.receipt_item_id, "accepted_qty", value)} />
                  <DecimalField label="Qty ditolak" value={item.rejected_qty} onChange={(value) => updateReceipt(setItems, item.receipt_item_id, "rejected_qty", value)} />
                  <DecimalField label="Qty gratis diterima" value={item.free_qty_received} onChange={(value) => updateReceipt(setItems, item.receipt_item_id, "free_qty_received", value)} />
                  <DecimalField label="Snapshot konversi" value={item.conversion_snapshot} onChange={(value) => updateReceipt(setItems, item.receipt_item_id, "conversion_snapshot", value)} />
                  <Field label="Alasan penolakan"><Input value={item.rejection_reason} onChange={(event) => updateReceipt(setItems, item.receipt_item_id, "rejection_reason", event.currentTarget.value)} /></Field>
                </div>
                {items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((entry) => entry.receipt_item_id !== item.receipt_item_id))} /> : null}
              </Stack>
            </Surface>
          ))}
        </LineSection>
      </CommandSurface>
    </OperationFormPage>
  );
}

export function PurchaseInvoicePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [invoiceId] = useState(() => crypto.randomUUID());
  const [purchaseId, setPurchaseId] = useState("");
  const [supplierNumber, setSupplierNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [capturedAt, setCapturedAt] = useState(nowLocalInput);
  const [invoiceVersion, setInvoiceVersion] = useState("0");
  const [purchaseVersion, setPurchaseVersion] = useState("1");
  const [totals, setTotals] = useState({ subtotal: "0", item_discount_total: "0", global_discount_total: "0", tax_total: "0", acquisition_charge_total: "0", grand_total: "0" });
  const [items, setItems] = useState([newInvoiceItem()]);
  const [charges, setCharges] = useState<ReturnType<typeof newCharge>[]>([]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: PurchaseInvoicePayload = {
      purchase_id: purchaseId.trim(), invoice_id: invoiceId,
      supplier_invoice_number: nullable(supplierNumber), invoice_date: nullable(invoiceDate), captured_at: toIso(capturedAt),
      expected_invoice_version: integerInput(invoiceVersion, "Versi invoice"), expected_purchase_version: integerInput(purchaseVersion, "Versi purchase", 1),
      ...totals,
      items: items.map((item) => ({ ...item, purchase_item_id: item.purchase_item_id.trim() })),
      charges: charges.map((charge) => ({ charge_id: charge.charge_id, type: charge.type, amount: charge.amount, allocation_method: "BY_ITEM_VALUE", description: nullable(charge.description) })),
    };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.capturePurchaseInvoice(identity, body));
  };

  return (
    <OperationFormPage backTo="/purchasing" description="Mencatat atau memperbarui invoice supplier dengan total authoritative berupa decimal string." permission="purchase.update_draft" title="Catat Invoice Supplier">
      <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Simpan invoice">
        <TechnicalId label="Invoice ID" value={invoiceId} />
        <div className="operation-grid">
          <Field label="Purchase ID" required><Input required value={purchaseId} onChange={(event) => setPurchaseId(event.currentTarget.value)} /></Field>
          <Field label="Nomor invoice supplier"><Input value={supplierNumber} onChange={(event) => setSupplierNumber(event.currentTarget.value)} /></Field>
          <Field label="Tanggal invoice"><Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.currentTarget.value)} /></Field>
          <Field label="Waktu pencatatan" required><Input required type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.currentTarget.value)} /></Field>
          <Field label="Versi invoice diharapkan" required><Input inputMode="numeric" required value={invoiceVersion} onChange={(event) => setInvoiceVersion(event.currentTarget.value)} /></Field>
          <Field label="Versi purchase diharapkan" required><Input inputMode="numeric" required value={purchaseVersion} onChange={(event) => setPurchaseVersion(event.currentTarget.value)} /></Field>
        </div>
        <Stack gap={2}><Heading level={2}>Total invoice</Heading><Text tone="secondary">Masukkan nilai sesuai dokumen supplier; server memvalidasi integritas total.</Text><div className="operation-grid">
          {Object.entries(totals).map(([key, value]) => <DecimalField key={key} label={invoiceTotalLabels[key as keyof typeof totals]} value={value} onChange={(next) => setTotals((current) => ({ ...current, [key]: next }))} />)}
        </div></Stack>
        <LineSection title="Item invoice" onAdd={() => setItems((current) => [...current, newInvoiceItem()])}>
          {items.map((item, index) => <Surface className="operation-line" elevation={0} padding="default" key={item.invoice_item_id}><Stack gap={3}>
            <TechnicalId label={`Invoice item ${index + 1} ID`} value={item.invoice_item_id} />
            <div className="operation-grid">
              <Field label="Purchase Item ID" required><Input required value={item.purchase_item_id} onChange={(event) => updateInvoice(setItems, item.invoice_item_id, "purchase_item_id", event.currentTarget.value)} /></Field>
              {(["invoiced_qty", "free_qty", "unit_price", "item_discount_amount", "tax_amount"] as const).map((key) => <DecimalField key={key} label={invoiceItemLabels[key]} value={item[key]} onChange={(value) => updateInvoice(setItems, item.invoice_item_id, key, value)} />)}
            </div>
            {items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((entry) => entry.invoice_item_id !== item.invoice_item_id))} /> : null}
          </Stack></Surface>)}
        </LineSection>
        <LineSection title="Biaya akuisisi" onAdd={() => setCharges((current) => [...current, newCharge()])}>
          {charges.length === 0 ? <Text tone="secondary">Tidak ada biaya akuisisi.</Text> : charges.map((charge, index) => <Surface className="operation-line" elevation={0} padding="default" key={charge.charge_id}><Stack gap={3}>
            <TechnicalId label={`Charge ${index + 1} ID`} value={charge.charge_id} />
            <div className="operation-grid">
              <Field label="Jenis biaya" required><Select required value={charge.type} onChange={(event) => setCharges((current) => current.map((entry) => entry.charge_id === charge.charge_id ? { ...entry, type: event.currentTarget.value as typeof charge.type } : entry))}><option value="FREIGHT">Freight</option><option value="HANDLING">Handling</option><option value="NON_RECOVERABLE_TAX">Pajak tidak dapat dipulihkan</option><option value="OTHER_DIRECT_ACQUISITION">Akuisisi langsung lainnya</option></Select></Field>
              <DecimalField label="Nilai biaya" value={charge.amount} onChange={(value) => setCharges((current) => current.map((entry) => entry.charge_id === charge.charge_id ? { ...entry, amount: value } : entry))} />
              <Field label="Deskripsi"><Input value={charge.description} onChange={(event) => setCharges((current) => current.map((entry) => entry.charge_id === charge.charge_id ? { ...entry, description: event.currentTarget.value } : entry))} /></Field>
            </div><RemoveLineButton onClick={() => setCharges((current) => current.filter((entry) => entry.charge_id !== charge.charge_id))} />
          </Stack></Surface>)}
        </LineSection>
      </CommandSurface>
    </OperationFormPage>
  );
}

export function PurchasePostPage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [purchaseId, setPurchaseId] = useState("");
  const [version, setVersion] = useState("1");
  const [exceptionIds, setExceptionIds] = useState("");
  const [notes, setNotes] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = { purchase_id: purchaseId.trim(), expected_version: integerInput(version, "Versi purchase", 1), accepted_integrity_exception_ids: idLines(exceptionIds), notes: nullable(notes) };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.postPurchase(identity, body));
  };
  return (
    <OperationFormPage backTo="/purchasing" description="Finalisasi online-authoritative dengan versi optimistik dan penerimaan exception yang eksplisit." permission="purchase.post" title="Post Purchase">
      <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Post purchase">
        <div className="operation-grid"><Field label="Purchase ID" required><Input required value={purchaseId} onChange={(event) => setPurchaseId(event.currentTarget.value)} /></Field><Field label="Versi diharapkan" required><Input inputMode="numeric" required value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Field></div>
        <Field label="Integrity exception ID yang diterima" description="Satu UUID per baris atau dipisah koma."><Textarea value={exceptionIds} onChange={(event) => setExceptionIds(event.currentTarget.value)} /></Field>
        <Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></Field>
      </CommandSurface>
    </OperationFormPage>
  );
}

function LineSection({ children, onAdd, title }: { readonly children: React.ReactNode; readonly onAdd: () => void; readonly title: string }) {
  return <Stack gap={2}><div className="operation-section-heading"><Heading level={2}>{title}</Heading><Button onClick={onAdd} size="compact" type="button" variant="secondary">Tambah baris</Button></div>{children}</Stack>;
}

function DecimalField({ label, onChange, value }: { readonly label: string; readonly onChange: (value: string) => void; readonly value: string }) {
  return <Field label={label} required><Input inputMode="decimal" required value={value} onChange={(event) => onChange(event.currentTarget.value)} /></Field>;
}

function updateReceipt(setter: React.Dispatch<React.SetStateAction<ReturnType<typeof newReceiptItem>[]>>, id: string, key: keyof ReturnType<typeof newReceiptItem>, value: string) {
  setter((current) => current.map((entry) => entry.receipt_item_id === id ? { ...entry, [key]: value } : entry));
}

function updateInvoice(setter: React.Dispatch<React.SetStateAction<ReturnType<typeof newInvoiceItem>[]>>, id: string, key: keyof ReturnType<typeof newInvoiceItem>, value: string) {
  setter((current) => current.map((entry) => entry.invoice_item_id === id ? { ...entry, [key]: value } : entry));
}

const invoiceTotalLabels = { subtotal: "Subtotal", item_discount_total: "Total diskon item", global_discount_total: "Diskon global", tax_total: "Total pajak", acquisition_charge_total: "Total biaya akuisisi", grand_total: "Grand total" } as const;
const invoiceItemLabels = { invoiced_qty: "Qty invoice", free_qty: "Qty gratis", unit_price: "Harga unit", item_discount_amount: "Diskon item", tax_amount: "Pajak item" } as const;
