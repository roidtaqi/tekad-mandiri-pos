export {
  BACK_OFFICE_LOCAL_DATABASE_NAME,
  BACK_OFFICE_LOCAL_DATABASE_SCHEMA_VERSION,
  createBackOfficeLocalDatabase,
} from "./back-office-database";
export type { BackOfficeLocalDatabase } from "./back-office-database";
export type {
  LocalDatabaseApplication,
  LocalDatabaseLifecycle,
} from "./local-database";
export {
  createPosLocalDatabase,
  POS_LOCAL_DATABASE_NAME,
  POS_LOCAL_DATABASE_SCHEMA_VERSION,
} from "./pos-database";
export type { PosLocalDatabase } from "./pos-database";
export { CATALOG_ALREADY_BOOTSTRAPPED } from "./catalog-cache";
export type {
  PosCatalogCache,
  LocalCatalogBootstrapState,
  LocalPosProduct,
  LocalPosProductUnit,
  LocalPosBarcode,
} from "./catalog-cache.js";
export { PricingBootstrapError } from "./pricing-cache.js";
export type { PosPricingCache } from "./pricing-cache.js";
export {
  ShiftOpenError,
  SHIFT_OPEN_PERMISSION_DENIED,
  SHIFT_AUTHORIZATION_EXPIRED,
  INVALID_SHIFT_CONTEXT,
  INVALID_OPENING_CASH,
  ACTIVE_SHIFT_ALREADY_EXISTS,
} from "./shift-cache.js";
export type {
  PosShiftCache,
  LocalShiftRecord,
  OpenShiftInput,
} from "./shift-cache.js";
export {
  PRODUCT_NOT_FOUND,
  AMBIGUOUS_IDENTIFIER,
  NO_PUBLISHED_PRICE,
  INVALID_LOOKUP_INPUT,
  ProductLookupError,
} from "./product-lookup.js";
export {
  PosSalesManager,
  CompleteSaleError,
  SHIFT_REQUIRED,
  SALE_SHIFT_CONTEXT_MISMATCH,
  SALE_TERMINAL_REQUIRED,
  EMPTY_CART,
  SALE_CART_INTEGRITY_INVALID,
  SALE_NUMERIC_BOUNDARY_INVALID,
  SALE_UNIT_CONVERSION_INVALID,
  PAYMENT_INSUFFICIENT,
  SALE_PERMISSION_DENIED,
  SALE_AUTHORIZATION_EXPIRED,
  IDEMPOTENCY_KEY_REUSE_ERROR,
  type CompleteSaleInput,
  type CompleteSaleResult,
  type LocalCompletedTransaction,
  type LocalCompletedTransactionItem,
  type LocalCompletedPayment,
  type LocalSaleStockMovement,
  type CompletedSaleAggregate,
} from "./sales-manager.js";
export type {
  ProductLookupResult,
  PosProductLookup,
} from "./product-lookup.js";
