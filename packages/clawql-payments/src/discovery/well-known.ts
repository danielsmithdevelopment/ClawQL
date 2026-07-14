import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  PaymentsDiscoveryService,
  type BuildPaymentsWellKnownOptions,
  type PaymentsWellKnownAcpMethod,
  type PaymentsWellKnownAdyenMethod,
  type PaymentsWellKnownAp2Method,
  type PaymentsWellKnownDocument,
  type PaymentsWellKnownMethod,
  type PaymentsWellKnownPaypalMethod,
  type PaymentsWellKnownResource,
  type PaymentsWellKnownStripeMethod,
  type PaymentsWellKnownX402Method,
} from "./payments-discovery-service.js";

export type {
  BuildPaymentsWellKnownOptions,
  PaymentsWellKnownAcpMethod,
  PaymentsWellKnownAdyenMethod,
  PaymentsWellKnownAp2Method,
  PaymentsWellKnownDocument,
  PaymentsWellKnownMethod,
  PaymentsWellKnownPaypalMethod,
  PaymentsWellKnownResource,
  PaymentsWellKnownStripeMethod,
  PaymentsWellKnownX402Method,
};

export async function buildPaymentsWellKnownDocument(
  options: BuildPaymentsWellKnownOptions = {}
): Promise<PaymentsWellKnownDocument> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const discovery = yield* PaymentsDiscoveryService;
      return yield* discovery.buildDocument(options);
    }),
    options.env
  );
}

export async function renderPaymentsWellKnownJson(
  options: BuildPaymentsWellKnownOptions = {}
): Promise<string> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const discovery = yield* PaymentsDiscoveryService;
      return yield* discovery.renderJson(options);
    }),
    options.env
  );
}
