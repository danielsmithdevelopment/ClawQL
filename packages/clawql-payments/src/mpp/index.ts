export {
  MPP_METHOD_STRIPE,
  MPP_METHOD_X402,
  MPP_CREDENTIAL_META_KEY,
  MPP_MCP_PAYMENT_REQUIRED_CODE,
  MPP_MCP_VERIFICATION_FAILED_CODE,
  MPP_PAYMENT_REQUIRED_META_KEY,
  MPP_RECEIPT_META_KEY,
  type MppPaymentChallenge,
  type MppPaymentInfo,
  type MppPaymentIntent,
  type MppPaymentMethod,
  type MppPaymentOffer,
  type MppServiceDocs,
  type MppServiceInfo,
} from "./types.js";

export { isMppEnabled, isMppOpenApiEnabled } from "./config.js";

export {
  buildOffersForGate,
  buildStripeOffer,
  buildX402Offer,
  offersFromX402Required,
  paymentInfoFromOffers,
  toPaymentInfo,
} from "./offers.js";

export { buildChallengesFromOffers, buildMppPaymentRequiredBody } from "./challenge.js";

export { mergePaymentRequiredHeaders, mppWwwAuthenticateHeader } from "./headers.js";

export {
  buildMppOpenApiDocument,
  renderMppOpenApiJson,
  composeMppOpenApiDocument,
  type BuildMppOpenApiOptions,
} from "./openapi.js";

export { MppOpenApiService, mppOpenApiLiveLayer } from "./openapi-service.js";

export {
  attachMppOpenApiRoutes,
  handleMppOpenApiRequest,
  MPP_OPENAPI_PATH,
  type AttachMppOpenApiOptions,
} from "./http.js";

export {
  buildMppMcpChallenges,
  buildMppMcpJsonRpcError,
  enrichMcpToolResultWithMpp,
  readMppCredentialFromHeaders,
  readMppCredentialFromMeta,
  type MppMcpJsonRpcError,
  type MppMcpToolResult,
} from "./mcp.js";

export {
  parseAuthorizationPaymentHeader,
  parseMppCredentialRaw,
  extractPaymentCredential,
  decodeChallengeRequest,
  type MppCredential,
  type ParsedPaymentCredential,
} from "./credential.js";

export { MppVerificationError } from "./verification-errors.js";

export {
  MppVerificationService,
  mppVerificationLiveLayer,
  type MppVerificationSuccess,
  type VerifyMppCredentialInput,
} from "./verification-service.js";

export {
  buildMppPaymentReceipt,
  mppPaymentReceiptHeader,
  type MppPaymentReceipt,
} from "./receipt.js";

export { registerMppChallenges, verifyMppCredential } from "./verify.js";

export {
  appendFinanceOffers,
  buildFinanceOffer,
  financeProvidersFromEnv,
  MPP_FINANCE_METHOD_ADYEN,
  MPP_FINANCE_METHOD_PAYPAL,
  MPP_FINANCE_METHOD_SQUARE,
} from "./providers.js";

export { isMppxEnabled, MppxAdapterService, mppxAdapterLiveLayer } from "./mppx-adapter.js";

export { isMppMcpJsonRpcEnabled } from "./mcp-jsonrpc.js";

export {
  MppMcpJsonRpcPaymentRequiredError,
  MppMcpJsonRpcVerificationFailedError,
  isMppMcpJsonRpcPaymentError,
} from "./mcp-jsonrpc-errors.js";
