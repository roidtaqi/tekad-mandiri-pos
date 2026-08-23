import { useState, type FormEvent } from "react";
import { Button, Field, Heading, Input, Select, Stack, Surface, Textarea } from "@kastur/ui";

import { useBackofficeRuntime } from "../../runtime/RuntimeContext";
import type { PriceProposalApprovePayload, PriceProposalCreatePayload, PromotionPublishPayload } from "../../runtime/command-gateway";
import { ResourcePage } from "../resources/ResourcePage";
import {
  CommandSurface,
  OperationFormPage,
  OperationIndex,
  RemoveLineButton,
  TechnicalId,
  integerInput,
  nowLocalInput,
  nullable,
  toIso,
  useCommandSubmission,
  useStoredDeviceId,
} from "./shared";

const pricingLinks = [
  { label: "Buat proposal", path: "/pricing/proposal/create", permission: "pricing.proposal.create" },
  { label: "Ajukan proposal", path: "/pricing/proposal/submit", permission: "pricing.proposal.review" },
  { label: "Setujui proposal", path: "/pricing/proposal/approve", permission: "pricing.approve" },
  { label: "Publikasikan promosi", path: "/pricing/promotion/publish", permission: "promotion.manage" },
] as const;

const newProposalItem = () => ({
  proposal_item_id: crypto.randomUUID(), product_unit_id: "", current_price_snapshot: "",
  pricing_reference_cost_snapshot: "", target_margin_snapshot: "", minimum_margin_snapshot: "",
  recommended_price: "", proposed_price: "0", calculated_margin: "", risk_level: "LOW" as const,
});

type ApprovalTier = { tier_id: string; tier_code: string; min_qty: string; unit_price: string; sort_order: string };
type ApprovalItem = { proposal_item_id: string; final_approved_price: string; price_version_id: string; tiers: ApprovalTier[] };
const newApprovalItem = (): ApprovalItem => ({ proposal_item_id: "", final_approved_price: "0", price_version_id: crypto.randomUUID(), tiers: [] });
const newTier = (): ApprovalTier => ({ tier_id: crypto.randomUUID(), tier_code: "RETAIL", min_qty: "1", unit_price: "0", sort_order: "0" });

export function PricingIndexPage() {
  return <OperationIndex links={pricingLinks}><ResourcePage page="pricing" /></OperationIndex>;
}

export function PriceProposalCreatePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [priceSetId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([newProposalItem()]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: PriceProposalCreatePayload = {
      price_set_id: priceSetId, name: nullable(name), source_type: sourceType.trim(), notes: nullable(notes),
      items: items.map((item) => ({
        ...item, product_unit_id: item.product_unit_id.trim(), current_price_snapshot: nullable(item.current_price_snapshot),
        pricing_reference_cost_snapshot: nullable(item.pricing_reference_cost_snapshot), target_margin_snapshot: nullable(item.target_margin_snapshot),
        minimum_margin_snapshot: nullable(item.minimum_margin_snapshot), recommended_price: nullable(item.recommended_price), calculated_margin: nullable(item.calculated_margin),
      })),
    };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.createPriceProposal(identity, body));
  };

  return <OperationFormPage backTo="/pricing" description="Menyiapkan draft price set. Nilai harga, cost, dan margin tetap dikirim sebagai decimal string." permission="pricing.proposal.create" title="Buat Proposal Harga">
    <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Buat proposal">
      <TechnicalId label="Price Set ID baru" value={priceSetId} />
      <div className="operation-grid">
        <Field label="Nama proposal"><Input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
        <Field label="Tipe sumber" required><Input required value={sourceType} onChange={(event) => setSourceType(event.currentTarget.value)} /></Field>
      </div>
      <Field label="Catatan"><Textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} /></Field>
      <Section title="Item proposal" addLabel="Tambah item" onAdd={() => setItems((current) => [...current, newProposalItem()])}>
        {items.map((item, index) => <Surface className="operation-line" elevation={0} padding="default" key={item.proposal_item_id}><Stack gap={3}>
          <TechnicalId label={`Proposal item ${index + 1} ID`} value={item.proposal_item_id} />
          <div className="operation-grid">
            <Field label="Product Unit ID" required><Input required value={item.product_unit_id} onChange={(event) => updateProposal(setItems, item.proposal_item_id, "product_unit_id", event.currentTarget.value)} /></Field>
            <Decimal label="Harga saat ini" optional value={item.current_price_snapshot} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "current_price_snapshot", value)} />
            <Decimal label="Reference cost" optional value={item.pricing_reference_cost_snapshot} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "pricing_reference_cost_snapshot", value)} />
            <Decimal label="Target margin" optional value={item.target_margin_snapshot} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "target_margin_snapshot", value)} />
            <Decimal label="Minimum margin" optional value={item.minimum_margin_snapshot} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "minimum_margin_snapshot", value)} />
            <Decimal label="Harga rekomendasi" optional value={item.recommended_price} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "recommended_price", value)} />
            <Decimal label="Harga diusulkan" value={item.proposed_price} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "proposed_price", value)} />
            <Decimal label="Margin terhitung" optional value={item.calculated_margin} onChange={(value) => updateProposal(setItems, item.proposal_item_id, "calculated_margin", value)} />
            <Field label="Tingkat risiko" required><Select required value={item.risk_level} onChange={(event) => updateProposal(setItems, item.proposal_item_id, "risk_level", event.currentTarget.value as typeof item.risk_level)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></Select></Field>
          </div>
          {items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((entry) => entry.proposal_item_id !== item.proposal_item_id))} /> : null}
        </Stack></Surface>)}
      </Section>
    </CommandSurface>
  </OperationFormPage>;
}

export function PriceProposalSubmitPage() {
  return <VersionCommandPage description="Mengajukan draft price set ke persetujuan dengan optimistic version." permission="pricing.proposal.review" submitLabel="Ajukan proposal" title="Ajukan Proposal" method="submit" />;
}

export function PriceProposalApprovePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [priceSetId, setPriceSetId] = useState("");
  const [version, setVersion] = useState("1");
  const [effectiveFrom, setEffectiveFrom] = useState(nowLocalInput);
  const [ownerReason, setOwnerReason] = useState("");
  const [items, setItems] = useState<ApprovalItem[]>([newApprovalItem()]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: PriceProposalApprovePayload = {
      price_set_id: priceSetId.trim(), expected_version: integerInput(version, "Versi Price Set", 1), effective_from: toIso(effectiveFrom), owner_reason: nullable(ownerReason),
      items: items.map((item) => ({ proposal_item_id: item.proposal_item_id.trim(), final_approved_price: item.final_approved_price, price_version_id: nullable(item.price_version_id), tiers: item.tiers.map((tier) => ({ tier_id: nullable(tier.tier_id), tier_code: tier.tier_code.trim(), min_qty: tier.min_qty, unit_price: tier.unit_price, sort_order: integerInput(tier.sort_order, "Urutan tier") })) })),
    };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.approvePriceProposal(identity, body));
  };
  return <OperationFormPage backTo="/pricing" description="Owner menyetujui harga final dan jadwal efektif. Tier kosong memakai tier retail default server." permission="pricing.approve" title="Setujui Proposal Harga">
    <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Setujui dan publikasikan">
      <div className="operation-grid"><Field label="Price Set ID" required><Input required value={priceSetId} onChange={(event) => setPriceSetId(event.currentTarget.value)} /></Field><Field label="Versi diharapkan" required><Input inputMode="numeric" required value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Field><Field label="Mulai berlaku" required><Input required type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.currentTarget.value)} /></Field></div>
      <Field label="Alasan Owner"><Textarea value={ownerReason} onChange={(event) => setOwnerReason(event.currentTarget.value)} /></Field>
      <Section title="Item persetujuan" addLabel="Tambah item" onAdd={() => setItems((current) => [...current, newApprovalItem()])}>
        {items.map((item, index) => <Surface className="operation-line" elevation={0} padding="default" key={`${index}-${item.price_version_id}`}><Stack gap={3}>
          <div className="operation-grid"><Field label="Proposal Item ID" required><Input required value={item.proposal_item_id} onChange={(event) => updateApproval(setItems, index, { proposal_item_id: event.currentTarget.value })} /></Field><Decimal label="Harga final" value={item.final_approved_price} onChange={(value) => updateApproval(setItems, index, { final_approved_price: value })} /><Field label="Price Version ID" description="Kosongkan agar server membuat ID"><Input value={item.price_version_id} onChange={(event) => updateApproval(setItems, index, { price_version_id: event.currentTarget.value })} /></Field></div>
          <Section title={`Tier item ${index + 1}`} addLabel="Tambah tier" onAdd={() => updateApproval(setItems, index, { tiers: [...item.tiers, newTier()] })}>
            {item.tiers.map((tier, tierIndex) => <div className="operation-grid operation-tier" key={`${tierIndex}-${tier.tier_id}`}><Field label="Tier ID"><Input value={tier.tier_id} onChange={(event) => updateTier(setItems, index, tierIndex, { tier_id: event.currentTarget.value })} /></Field><Field label="Kode tier" required><Input required value={tier.tier_code} onChange={(event) => updateTier(setItems, index, tierIndex, { tier_code: event.currentTarget.value })} /></Field><Decimal label="Minimum qty" value={tier.min_qty} onChange={(value) => updateTier(setItems, index, tierIndex, { min_qty: value })} /><Decimal label="Harga unit" value={tier.unit_price} onChange={(value) => updateTier(setItems, index, tierIndex, { unit_price: value })} /><Field label="Urutan" required><Input inputMode="numeric" required value={tier.sort_order} onChange={(event) => updateTier(setItems, index, tierIndex, { sort_order: event.currentTarget.value })} /></Field><RemoveLineButton onClick={() => updateApproval(setItems, index, { tiers: item.tiers.filter((_, candidate) => candidate !== tierIndex) })} /></div>)}
          </Section>
          {items.length > 1 ? <RemoveLineButton onClick={() => setItems((current) => current.filter((_, candidate) => candidate !== index))} /> : null}
        </Stack></Surface>)}
      </Section>
    </CommandSurface>
  </OperationFormPage>;
}

export function PromotionPublishPage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [promotionId] = useState(() => crypto.randomUUID());
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<PromotionPublishPayload["promotion_type"]>("FIXED_PRICE");
  const [value, setValue] = useState("0");
  const [minQty, setMinQty] = useState("1");
  const [priority, setPriority] = useState("0");
  const [from, setFrom] = useState(nowLocalInput);
  const [to, setTo] = useState(() => { const date = new Date(Date.now() + 86_400_000); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); });
  const [reason, setReason] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: PromotionPublishPayload = { promotion_id: promotionId, product_unit_id: unitId.trim(), name: name.trim(), promotion_type: type, value, min_qty: minQty, priority: integerInput(priority, "Prioritas"), effective_from: toIso(from), effective_to: toIso(to), owner_reason: nullable(reason) };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.publishPromotion(identity, body));
  };
  return <OperationFormPage backTo="/pricing" description="Owner mempublikasikan satu promosi dengan periode, prioritas, dan product unit eksplisit." permission="promotion.manage" title="Publikasikan Promosi">
    <CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Publikasikan promosi">
      <TechnicalId label="Promotion ID baru" value={promotionId} />
      <div className="operation-grid"><Field label="Product Unit ID" required><Input required value={unitId} onChange={(event) => setUnitId(event.currentTarget.value)} /></Field><Field label="Nama promosi" required><Input required value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field><Field label="Tipe promosi" required><Select required value={type} onChange={(event) => setType(event.currentTarget.value as typeof type)}><option value="FIXED_PRICE">Harga tetap</option><option value="PERCENT_DISCOUNT">Diskon persen</option><option value="FIXED_DISCOUNT">Diskon tetap</option></Select></Field><Decimal label="Nilai" value={value} onChange={setValue} /><Decimal label="Minimum qty" value={minQty} onChange={setMinQty} /><Field label="Prioritas" required><Input inputMode="numeric" required value={priority} onChange={(event) => setPriority(event.currentTarget.value)} /></Field><Field label="Mulai berlaku" required><Input required type="datetime-local" value={from} onChange={(event) => setFrom(event.currentTarget.value)} /></Field><Field label="Berakhir" required><Input required type="datetime-local" value={to} onChange={(event) => setTo(event.currentTarget.value)} /></Field></div>
      <Field label="Alasan Owner"><Textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></Field>
    </CommandSurface>
  </OperationFormPage>;
}

function VersionCommandPage({ description, method, permission, submitLabel, title }: { readonly description: string; readonly method: "submit"; readonly permission: string; readonly submitLabel: string; readonly title: string }) {
  const { commandGateway } = useBackofficeRuntime(); const [deviceId, setDeviceId] = useStoredDeviceId(); const submission = useCommandSubmission(); const [id, setId] = useState(""); const [version, setVersion] = useState("1");
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const payload = { price_set_id: id.trim(), expected_version: integerInput(version, "Versi Price Set", 1) }; void submission.execute(deviceId, payload, (identity, body) => method === "submit" ? commandGateway.submitPriceProposal(identity, body) : commandGateway.submitPriceProposal(identity, body)); };
  return <OperationFormPage backTo="/pricing" description={description} permission={permission} title={title}><CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel={submitLabel}><div className="operation-grid"><Field label="Price Set ID" required><Input required value={id} onChange={(event) => setId(event.currentTarget.value)} /></Field><Field label="Versi diharapkan" required><Input inputMode="numeric" required value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Field></div></CommandSurface></OperationFormPage>;
}

function Section({ addLabel, children, onAdd, title }: { readonly addLabel: string; readonly children: React.ReactNode; readonly onAdd: () => void; readonly title: string }) { return <Stack gap={2}><div className="operation-section-heading"><Heading level={2}>{title}</Heading><Button onClick={onAdd} size="compact" type="button" variant="secondary">{addLabel}</Button></div>{children}</Stack>; }
function Decimal({ label, onChange, optional = false, value }: { readonly label: string; readonly onChange: (value: string) => void; readonly optional?: boolean; readonly value: string }) { return <Field label={label} required={!optional}><Input inputMode="decimal" required={!optional} value={value} onChange={(event) => onChange(event.currentTarget.value)} /></Field>; }
function updateProposal(setter: React.Dispatch<React.SetStateAction<ReturnType<typeof newProposalItem>[]>>, id: string, key: keyof ReturnType<typeof newProposalItem>, value: string) { setter((current) => current.map((entry) => entry.proposal_item_id === id ? { ...entry, [key]: value } : entry)); }
function updateApproval(setter: React.Dispatch<React.SetStateAction<ApprovalItem[]>>, index: number, patch: Partial<ApprovalItem>) { setter((current) => current.map((entry, candidate) => candidate === index ? { ...entry, ...patch } : entry)); }
function updateTier(setter: React.Dispatch<React.SetStateAction<ApprovalItem[]>>, itemIndex: number, tierIndex: number, patch: Partial<ApprovalTier>) { setter((current) => current.map((item, candidate) => candidate === itemIndex ? { ...item, tiers: item.tiers.map((tier, tierCandidate) => tierCandidate === tierIndex ? { ...tier, ...patch } : tier) } : item)); }
