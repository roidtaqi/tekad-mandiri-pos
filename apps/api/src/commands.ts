import {
  isOfflineAuthorizationGrant,
  type OfflineAuthorizationGrant,
} from "@kastur/contracts";

import type { AuthenticatedRequestContext } from "./auth.js";
import { requireActiveBusinessDevice } from "./auth.js";
import {
  closeShiftCommand,
  openShiftCommand,
  recordCashMovementCommand,
} from "./cash.js";
import type { CommandIdentity } from "./command-support.js";
import type { RequestDatabase } from "./database.js";
import { ApiError, readJsonObject } from "./http.js";
import {
  adjustInventoryCommand,
  createOpnameCommand,
  countOpnameCommand,
  postOpnameCommand,
  reviewOpnameCommand,
} from "./inventory.js";
import {
  capturePurchaseInvoiceCommand,
  createPurchaseCommand,
  postPurchaseCommand,
  receiveGoodsCommand,
} from "./purchasing.js";
import {
  approvePriceProposalCommand,
  createPriceProposalCommand,
  publishPromotionCommand,
  submitPriceProposalCommand,
} from "./pricing.js";
import {
  completeReturnCommand,
  resolveRefundCommand,
  retryRefundCommand,
  reverseRefundCommand,
} from "./returns.js";
import { completeSaleCommand } from "./sales.js";
import {
  integerValue,
  objectValue,
  stringValue,
  timestampValue,
  uuidValue,
} from "./validation.js";

export interface CommandEnvelope {
  readonly authorization_version: number;
  readonly command: CommandIdentity;
  readonly device_id: string;
  readonly offline_authorization?: OfflineAuthorizationGrant;
  readonly payload: unknown;
}

export interface CommandOutcome {
  readonly replayed: boolean;
  readonly result: unknown;
}

export function readCommandEnvelope(value: unknown, field = "command"): CommandEnvelope {
  const row = objectValue(value, field);
  const schemaVersion = integerValue(row.schema_version, `${field}.schema_version`, 1);
  if (schemaVersion !== 1) {
    throw new ApiError(
      409,
      "COMMAND_SCHEMA_UNSUPPORTED",
      "Versi schema command tidak didukung.",
    );
  }
  const locationId =
    row.location_id === undefined || row.location_id === null
      ? null
      : uuidValue(row.location_id, `${field}.location_id`);
  if (
    row.offline_authorization !== undefined &&
    !isOfflineAuthorizationGrant(row.offline_authorization)
  ) {
    throw new ApiError(
      400,
      "OFFLINE_AUTHORIZATION_INVALID",
      "Bukti otorisasi offline command tidak valid.",
    );
  }
  return {
    authorization_version: integerValue(
      row.authorization_version,
      `${field}.authorization_version`,
      1,
    ),
    command: {
      command_id: uuidValue(row.command_id, `${field}.command_id`),
      command_type: stringValue(row.command_type, `${field}.command_type`),
      correlation_id: uuidValue(row.correlation_id, `${field}.correlation_id`),
      location_id: locationId,
      occurred_at: timestampValue(row.occurred_at, `${field}.occurred_at`),
    },
    device_id: uuidValue(row.device_id, `${field}.device_id`),
    ...(row.offline_authorization === undefined
      ? {}
      : { offline_authorization: row.offline_authorization }),
    payload: row.payload,
  };
}

export async function dispatchCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  envelope: CommandEnvelope,
): Promise<CommandOutcome> {
  const input = {
    command: envelope.command,
    command_authorization_version: envelope.authorization_version,
    device_id: envelope.device_id,
    payload: envelope.payload,
  };

  switch (envelope.command.command_type) {
    case "cash.shift.open":
      return openShiftCommand(database, context, input);
    case "cash.movement.record":
      return recordCashMovementCommand(database, context, input);
    case "cash.shift.close":
      return closeShiftCommand(database, context, input);
    case "sales.complete":
      return completeSaleCommand(database, context, input);
    case "purchasing.purchase.create":
      return createPurchaseCommand(database, context, input);
    case "purchasing.receive_goods":
      return receiveGoodsCommand(database, context, input);
    case "purchasing.invoice.upsert":
      return capturePurchaseInvoiceCommand(database, context, input);
    case "purchasing.purchase.post":
      return postPurchaseCommand(database, context, input);
    case "pricing.proposal.create":
      return createPriceProposalCommand(database, context, input);
    case "pricing.proposal.submit":
      return submitPriceProposalCommand(database, context, input);
    case "pricing.proposal.approve":
      return approvePriceProposalCommand(database, context, input);
    case "pricing.promotion.publish":
      return publishPromotionCommand(database, context, input);
    case "inventory.adjust":
      return adjustInventoryCommand(database, context, input);
    case "inventory.opname.create":
      return createOpnameCommand(database, context, input);
    case "inventory.opname.count":
    case "inventory.opname.recount":
      return countOpnameCommand(database, context, input);
    case "inventory.opname.review":
      return reviewOpnameCommand(database, context, input);
    case "inventory.opname.post":
      return postOpnameCommand(database, context, input);
    case "returns.complete":
      return completeReturnCommand(database, context, input);
    case "returns.refund.retry":
      return retryRefundCommand(database, context, input);
    case "returns.refund.resolve":
      return resolveRefundCommand(database, context, input);
    case "returns.refund.reverse":
      return reverseRefundCommand(database, context, input);
    default:
      throw new ApiError(
        400,
        "COMMAND_TYPE_UNSUPPORTED",
        `Command type ${envelope.command.command_type} tidak didukung.`,
      );
  }
}

export async function executeOnlineCommand(
  request: Request,
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
): Promise<Readonly<Record<string, unknown>>> {
  const body = await readJsonObject(request);
  const envelope = readCommandEnvelope(body, "command");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null || idempotencyKey.length === 0) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Header Idempotency-Key wajib diisi.",
    );
  }
  if (idempotencyKey !== envelope.command.command_id) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_KEY_MISMATCH",
      "Idempotency-Key harus sama dengan command_id.",
    );
  }
  await requireActiveBusinessDevice(database, context, envelope.device_id);

  const outcome = await dispatchCommand(database, context, envelope);
  return {
    command_id: envelope.command.command_id,
    result: {
      ...objectValue(outcome.result, "command result"),
      replayed: outcome.replayed,
    },
    server_time: new Date().toISOString(),
  };
}
