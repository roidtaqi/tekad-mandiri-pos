import { useState, type FormEvent } from "react";
import { Field, Input, Select, Textarea } from "@kastur/ui";

import { useBackofficeRuntime } from "../../runtime/RuntimeContext";
import type { RefundResolvePayload, RefundReversePayload } from "../../runtime/command-gateway";
import { ResourcePage } from "../resources/ResourcePage";
import {
  CommandSurface,
  OperationFormPage,
  OperationIndex,
  integerInput,
  nullable,
  useCommandSubmission,
  useStoredDeviceId,
} from "./shared";

const refundLinks = [
  { label: "Coba ulang refund", path: "/returns/refund/retry", permission: "refund.process" },
  { label: "Selesaikan exception refund", path: "/returns/refund/resolve", permission: "refund.process" },
  { label: "Balikkan refund", path: "/returns/refund/reverse", permission: "refund.reverse" },
] as const;

export function ReturnsIndexPage() {
  return <OperationIndex links={refundLinks}><ResourcePage page="returns" /></OperationIndex>;
}

export function RefundRetryPage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [refundId, setRefundId] = useState("");
  const [version, setVersion] = useState("1");
  const [reason, setReason] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = { refund_id: refundId.trim(), expected_version: integerInput(version, "Versi refund", 1), reason: reason.trim() };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.retryRefund(identity, body));
  };
  return <OperationFormPage backTo="/returns" description="Mencoba ulang settlement refund yang pending atau memerlukan tindakan tanpa mengubah return asal." permission="refund.process" title="Coba Ulang Refund"><CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Coba ulang refund"><RefundIdentityFields refundId={refundId} setRefundId={setRefundId} setVersion={setVersion} version={version} /><Field label="Alasan retry" required><Textarea required value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></Field></CommandSurface></OperationFormPage>;
}

export function RefundResolvePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [refundId, setRefundId] = useState(""); const [version, setVersion] = useState("1");
  const [status, setStatus] = useState<RefundResolvePayload["resolution_status"]>("COMPLETED");
  const [reference, setReference] = useState(""); const [reason, setReason] = useState(""); const [shiftId, setShiftId] = useState(""); const [terminalId, setTerminalId] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cashContext = optionalCashContext(shiftId, terminalId);
    const payload: RefundResolvePayload = { refund_id: refundId.trim(), expected_version: integerInput(version, "Versi refund", 1), resolution_status: status, external_reference: nullable(reference), reason: reason.trim(), ...cashContext };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.resolveRefund(identity, body));
  };
  return <OperationFormPage backTo="/returns" description="Mencatat hasil tindak lanjut refund sebagai completed, failed, atau masih memerlukan tindakan." permission="refund.process" title="Selesaikan Exception Refund"><CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Simpan resolusi refund"><RefundIdentityFields refundId={refundId} setRefundId={setRefundId} setVersion={setVersion} version={version} /><div className="operation-grid"><Field label="Status resolusi" required><Select required value={status} onChange={(event) => setStatus(event.currentTarget.value as typeof status)}><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="REQUIRES_ACTION">Requires action</option></Select></Field><Field label="Referensi eksternal"><Input value={reference} onChange={(event) => setReference(event.currentTarget.value)} /></Field></div><Field label="Alasan resolusi" required><Textarea required value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></Field><CashContextFields shiftId={shiftId} terminalId={terminalId} setShiftId={setShiftId} setTerminalId={setTerminalId} /></CommandSurface></OperationFormPage>;
}

export function RefundReversePage() {
  const { commandGateway } = useBackofficeRuntime();
  const [deviceId, setDeviceId] = useStoredDeviceId();
  const submission = useCommandSubmission();
  const [refundId, setRefundId] = useState(""); const [version, setVersion] = useState("1"); const [reason, setReason] = useState(""); const [shiftId, setShiftId] = useState(""); const [terminalId, setTerminalId] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: RefundReversePayload = { refund_id: refundId.trim(), expected_version: integerInput(version, "Versi refund", 1), reason: reason.trim(), ...optionalCashContext(shiftId, terminalId) };
    void submission.execute(deviceId, payload, (identity, body) => commandGateway.reverseRefund(identity, body));
  };
  return <OperationFormPage backTo="/returns" description="Membuat lifecycle reversal baru; record refund dan return yang telah selesai tidak ditimpa." permission="refund.reverse" title="Balikkan Refund"><CommandSurface {...submission} deviceId={deviceId} onDeviceIdChange={setDeviceId} onSubmit={submit} submitLabel="Balikkan refund"><RefundIdentityFields refundId={refundId} setRefundId={setRefundId} setVersion={setVersion} version={version} /><Field label="Alasan reversal" required><Textarea required value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></Field><CashContextFields shiftId={shiftId} terminalId={terminalId} setShiftId={setShiftId} setTerminalId={setTerminalId} /></CommandSurface></OperationFormPage>;
}

function RefundIdentityFields({ refundId, setRefundId, setVersion, version }: { readonly refundId: string; readonly setRefundId: (value: string) => void; readonly setVersion: (value: string) => void; readonly version: string }) { return <div className="operation-grid"><Field label="Refund ID" required><Input required value={refundId} onChange={(event) => setRefundId(event.currentTarget.value)} /></Field><Field label="Versi refund diharapkan" required><Input inputMode="numeric" required value={version} onChange={(event) => setVersion(event.currentTarget.value)} /></Field></div>; }
function CashContextFields({ setShiftId, setTerminalId, shiftId, terminalId }: { readonly setShiftId: (value: string) => void; readonly setTerminalId: (value: string) => void; readonly shiftId: string; readonly terminalId: string }) { return <div className="operation-grid"><Field description="Isi hanya bila lifecycle action memerlukan efek cash." label="Shift ID"><Input value={shiftId} onChange={(event) => setShiftId(event.currentTarget.value)} /></Field><Field description="Isi hanya bersama Shift ID untuk efek cash." label="Terminal ID"><Input value={terminalId} onChange={(event) => setTerminalId(event.currentTarget.value)} /></Field></div>; }
function optionalCashContext(shiftId: string, terminalId: string): Pick<RefundResolvePayload, "shift_id" | "terminal_id"> { const shift = shiftId.trim(); const terminal = terminalId.trim(); return { ...(shift === "" ? {} : { shift_id: shift }), ...(terminal === "" ? {} : { terminal_id: terminal }) }; }
