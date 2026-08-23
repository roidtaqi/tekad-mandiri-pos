import { useState, type FormEvent } from "react";
import { Button, Field, Heading, Input, Select, Stack, Surface, Textarea } from "@kastur/ui";

import { useBackofficeRuntime } from "../../runtime/RuntimeContext";
import type { InventoryAdjustmentPayload, OpnameCountPayload } from "../../runtime/command-gateway";
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

const inventoryLinks = [
  { label: "Buat adjustment", path: "/inventory/adjust", permission: "inventory.adjust" },
  { label: "Buat opname", path: "/inventory/opname/create", permission: "inventory.opname.create" },
  { label: "Catat hitungan", path: "/inventory/opname/count", permission: "inventory.opname.create" },
  { label: "Hitung ulang", path: "/inventory/opname/recount", permission: "inventory.opname.create" },
  { label: "Ajukan review", path: "/inventory/opname/review", permission: "inventory.opname.create" },
  { label: "Post opname", path: "/inventory/opname/post", permission: "inventory.opname.post" },
] as const;

type AdjustmentItem = { item_id: string; product_id: string; product_unit_id: string; quantity: string; conversion_snapshot: string };
const newAdjustmentItem = (): AdjustmentItem => ({ item_id: crypto.randomUUID(), product_id: "", product_unit_id: "", quantity: "1", conversion_snapshot: "1" });
type CountItem = { key: string; product_id: string; physical_qty: string; counted_at: string };
const newCountItem = (): CountItem => ({ key: crypto.randomUUID(), product_id: "", physical_qty: "0", counted_at: nowLocalInput() });

export function InventoryIndexPage() { return <OperationIndex links={inventoryLinks}><ResourcePage page="inventory" /></OperationIndex>; }

export function InventoryAdjustmentPage() {
  const { commandGateway } = useBackofficeRuntime(); const [deviceId, setDeviceId] = useStoredDeviceId(); const submission = useCommandSubmission();
  const [adjustmentId] = useState(() => crypto.randomUUID()); const [number, setNumber] = useState(""); const [direction, setDirection] = useState<InventoryAdjustmentPayload["direction"]>("IN"); const [reason, setReason] = useState<InventoryAdjustmentPayload["reason_code"]>("DATA_CORRECTION"); const [notes, setNotes] = useState(""); const [items, setItems] = useState<AdjustmentItem[]>([newAdjustmentItem()]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload: InventoryAdjustmentPayload = { adjustment_id: adjustmentId, adjustment_number: number.trim(), direction, reason_code: reason, notes: nullable(notes), items: items.map((item) => ({ ...item, product_id: item.product_id.trim(), product_unit_id: item.product_unit_id.trim() })) }; void submission.execute(deviceId, payload, (identity, body) => commandGateway.adjustInventory(identity, body)); };
  return <OperationFormPage backTo="/inventory" description="Membuat movement ledger melalui command adjustment; saldo bukan diedit langsung." permission="inventory.adjust" title="Adjustment Inventory">
    <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Terapkan adjustment">
      <TechnicalId label="Adjustment ID baru" value={adjustmentId} />
      <div className="operation-grid"><Field label="Nomor adjustment" required><Input required value={number} onChange={(event) => setNumber(event.currentTarget.value)} /></Field><Field label="Arah" required><Select required value={direction} onChange={(event) => setDirection(event.currentTarget.value as typeof direction)}><option value="IN">Masuk</option><option value="OUT">Keluar</option></Select></Field><Field label="Alasan" required><Select required value={reason} onChange={(event) => setReason(event.currentTarget.value as typeof reason)}><option value="DAMAGED">Rusak</option><option value="LOST">Hilang</option><option value="FOUND">Ditemukan</option><option value="DATA_CORRECTION">Koreksi data</option><option value="EXPIRED">Kedaluwarsa</option><option value="OTHER">Lainnya</option></Select></Field></div>
      <Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></Field>
      <Section title="Item adjustment" onAdd={() => setItems((current) => [...current, newAdjustmentItem()])}>
        {items.map((item, index) => <Surface className="operation-line" elevation={0} padding="default" key={item.item_id}><Stack gap={3}><TechnicalId label={`Item ${index + 1} ID`} value={item.item_id} /><div className="operation-grid"><Field label="Product ID" required><Input required value={item.product_id} onChange={(event) => updateAdjustment(setItems, item.item_id, "product_id", event.currentTarget.value)} /></Field><Field label="Product Unit ID" required><Input required value={item.product_unit_id} onChange={(event) => updateAdjustment(setItems, item.item_id, "product_unit_id", event.currentTarget.value)} /></Field><Decimal label="Qty" value={item.quantity} onChange={(value) => updateAdjustment(setItems, item.item_id, "quantity", value)} /><Decimal label="Snapshot konversi" value={item.conversion_snapshot} onChange={(value) => updateAdjustment(setItems, item.item_id, "conversion_snapshot", value)} /></div>{items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((entry) => entry.item_id !== item.item_id))} /> : null}</Stack></Surface>)}
      </Section>
    </CommandSurface>
  </OperationFormPage>;
}

export function OpnameCreatePage() {
  const { commandGateway } = useBackofficeRuntime(); const [deviceId, setDeviceId] = useStoredDeviceId(); const submission = useCommandSubmission(); const [opnameId] = useState(() => crypto.randomUUID()); const [number, setNumber] = useState(""); const [scopeType, setScopeType] = useState("ALL_TRACKED"); const [productIds, setProductIds] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload = { opname_id: opnameId, opname_number: number.trim(), scope_type: scopeType.trim(), product_ids: idLines(productIds) }; void submission.execute(deviceId, payload, (identity, body) => commandGateway.createOpname(identity, body)); };
  return <OperationFormPage backTo="/inventory" description="Membuka sesi hitung stok dengan scope dan daftar produk eksplisit." permission="inventory.opname.create" title="Buat Stock Opname"><CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Buat opname"><TechnicalId label="Opname ID baru" value={opnameId} /><div className="operation-grid"><Field label="Nomor opname" required><Input required value={number} onChange={(event) => setNumber(event.currentTarget.value)} /></Field><Field label="Tipe scope" required><Input required value={scopeType} onChange={(event) => setScopeType(event.currentTarget.value)} /></Field></div><Field label="Product ID dalam scope" description="Satu UUID per baris atau dipisah koma. Kosong berarti seluruh produk terlacak."><Textarea value={productIds} onChange={(event) => setProductIds(event.currentTarget.value)} /></Field></CommandSurface></OperationFormPage>;
}

export function OpnameCountPage() { return <OpnameCountWorkflow kind="count" />; }
export function OpnameRecountPage() { return <OpnameCountWorkflow kind="recount" />; }
export function OpnameReviewPage() { return <OpnameTransitionWorkflow kind="review" />; }
export function OpnamePostPage() { return <OpnameTransitionWorkflow kind="post" />; }

function OpnameCountWorkflow({ kind }: { readonly kind: "count" | "recount" }) {
  const { commandGateway } = useBackofficeRuntime(); const [deviceId, setDeviceId] = useStoredDeviceId(); const submission = useCommandSubmission(); const [opnameId, setOpnameId] = useState(""); const [version, setVersion] = useState("1"); const [items, setItems] = useState<CountItem[]>([newCountItem()]);
  const isRecount = kind === "recount";
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload: OpnameCountPayload = { opname_id: opnameId.trim(), expected_version: integerInput(version, "Versi opname", 1), items: items.map((item) => ({ product_id: item.product_id.trim(), physical_qty: item.physical_qty, counted_at: toIso(item.counted_at) })) }; void submission.execute(deviceId, payload, (identity, body) => isRecount ? commandGateway.recountOpname(identity, body) : commandGateway.countOpname(identity, body)); };
  return <OperationFormPage backTo="/inventory" description={isRecount ? "Mengganti hitungan produk yang perlu dihitung ulang tanpa mengedit hasil posted." : "Mencatat hitungan fisik per produk untuk sesi opname terbuka."} permission="inventory.opname.create" title={isRecount ? "Hitung Ulang Opname" : "Catat Hitungan Opname"}>
    <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel={isRecount ? "Simpan hitung ulang" : "Simpan hitungan"}><div className="operation-grid"><Field label="Opname ID" required><Input required value={opnameId} onChange={(event) => setOpnameId(event.currentTarget.value)} /></Field><Field label="Versi diharapkan" required><Input inputMode="numeric" required value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Field></div><Section title="Produk dihitung" onAdd={() => setItems((current) => [...current, newCountItem()])}>{items.map((item, index) => <Surface className="operation-line" elevation={0} padding="default" key={item.key}><Stack gap={3}><div className="operation-grid"><Field label={`Product ID ${index + 1}`} required><Input required value={item.product_id} onChange={(event) => updateCount(setItems, item.key, "product_id", event.currentTarget.value)} /></Field><Decimal label="Qty fisik" value={item.physical_qty} onChange={(value) => updateCount(setItems, item.key, "physical_qty", value)} /><Field label="Waktu dihitung" required><Input required type="datetime-local" value={item.counted_at} onChange={(event) => updateCount(setItems, item.key, "counted_at", event.currentTarget.value)} /></Field></div>{items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} /> : null}</Stack></Surface>)}</Section></CommandSurface>
  </OperationFormPage>;
}

function OpnameTransitionWorkflow({ kind }: { readonly kind: "review" | "post" }) {
  const { commandGateway } = useBackofficeRuntime(); const [deviceId, setDeviceId] = useStoredDeviceId(); const submission = useCommandSubmission(); const [opnameId, setOpnameId] = useState(""); const [version, setVersion] = useState("1"); const [notes, setNotes] = useState(""); const isPost = kind === "post";
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload = { opname_id: opnameId.trim(), expected_version: integerInput(version, "Versi opname", 1), notes: nullable(notes) }; void submission.execute(deviceId, payload, (identity, body) => isPost ? commandGateway.postOpname(identity, body) : commandGateway.reviewOpname(identity, body)); };
  return <OperationFormPage backTo="/inventory" description={isPost ? "Mem-post hasil review menjadi movement ledger dan snapshot opname immutable." : "Memindahkan sesi hitung ke tahap review dengan versi optimistik."} permission={isPost ? "inventory.opname.post" : "inventory.opname.create"} title={isPost ? "Post Stock Opname" : "Ajukan Review Opname"}><CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel={isPost ? "Post opname" : "Ajukan review"}><div className="operation-grid"><Field label="Opname ID" required><Input required value={opnameId} onChange={(event) => setOpnameId(event.currentTarget.value)} /></Field><Field label="Versi diharapkan" required><Input inputMode="numeric" required value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Field></div><Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></Field></CommandSurface></OperationFormPage>;
}

function Section({ children, onAdd, title }: { readonly children: React.ReactNode; readonly onAdd: () => void; readonly title: string }) { return <Stack gap={2}><div className="operation-section-heading"><Heading level={2}>{title}</Heading><Button onClick={onAdd} size="compact" type="button" variant="secondary">Tambah baris</Button></div>{children}</Stack>; }
function Decimal({ label, onChange, value }: { readonly label: string; readonly onChange: (value: string) => void; readonly value: string }) { return <Field label={label} required><Input inputMode="decimal" required value={value} onChange={(event) => onChange(event.currentTarget.value)} /></Field>; }
function updateAdjustment(setter: React.Dispatch<React.SetStateAction<AdjustmentItem[]>>, id: string, key: keyof AdjustmentItem, value: string) { setter((current) => current.map((entry) => entry.item_id === id ? { ...entry, [key]: value } : entry)); }
function updateCount(setter: React.Dispatch<React.SetStateAction<CountItem[]>>, id: string, key: keyof CountItem, value: string) { setter((current) => current.map((entry) => entry.key === id ? { ...entry, [key]: value } : entry)); }
