/**
 * VENDORED FILE — do not edit by hand.
 *
 * Source: `@atmosphere-money/app-node` (packages/app-node/src/index.ts) from the
 * Atmosphere Money SDK monorepo, https://github.com/Atmosphere-Money/atm-js
 * (version 0.0.0-beta.4). Vendored verbatim because the npm package is not yet
 * published. Replace this file with the npm dependency once it is public.
 *
 * License: MIT (c) Atmosphere Money — same license as this repo. The package is
 * deliberately dependency-free (only `node:crypto` + `Buffer`, both covered by
 * the Worker's `nodejs_compat_v2` flag).
 */
/* eslint-disable */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side helpers for apps integrating with Atmosphere Money.
 *
 * Keep this package on your backend. Do not build `atm.checkout.v1:`
 * envelopes in browser code because they may contain private checkout/session
 * context, app order ids, buyer assertions, or return/cancel URLs.
 */

export const ATM_CHECKOUT_PRODUCT_PREFIX = "atm.checkout.v1:";
export const DEFAULT_ATM_BROKER_URL = "https://checkout.atmosphere.money";
export const DEFAULT_ATM_APPVIEW_URL = "https://appview.atmosphere.money";
export const ATM_BROKER_DID = "did:plc:7srqsetux75b6flzbbyag2ro";
export const ATM_BROKER_SERVICE_AUDIENCE =
  `${ATM_BROKER_DID}#AttestedNetwork`;
export const DEFAULT_ATM_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
export const ATM_EVENT_RECEIVE_NSID = "money.atmosphere.event.receive";
export const DEFAULT_ATM_XRPC_RECEIVER_SERVICE = "#AtmEventReceiver";
export const ATM_XRPC_METHODS = {
  actor: {
    getPayoutStatus: "money.atmosphere.actor.getPayoutStatus",
    getProfile: "money.atmosphere.actor.getProfile",
  },
  app: {
    auditFeeDistributions: "money.atmosphere.app.auditFeeDistributions",
    getConfig: "money.atmosphere.app.getConfig",
    requestRecipientApproval: "money.atmosphere.app.requestRecipientApproval",
    updateConfig: "money.atmosphere.app.updateConfig",
    setRecipientFeeShare: "money.atmosphere.app.setRecipientFeeShare",
    clearRecipientFeeShare: "money.atmosphere.app.clearRecipientFeeShare",
    listRecipientFeeShares: "money.atmosphere.app.listRecipientFeeShares",
  },
  catalog: {
    createProduct: "money.atmosphere.catalog.createProduct",
    updateProduct: "money.atmosphere.catalog.updateProduct",
  },
  payment: {
    assertPayer: "money.atmosphere.payment.assertPayer",
    initiate: "network.attested.payment.initiate",
    status: "network.attested.payment.status",
    createPledge: "money.atmosphere.payment.createPledge",
    listPledges: "money.atmosphere.payment.listPledges",
    cancelPledge: "money.atmosphere.payment.cancelPledge",
    convertPledges: "money.atmosphere.payment.convertPledges",
  },
  event: {
    receive: "money.atmosphere.event.receive",
  },
  tickets: {
    archiveTicketTier: "tickets.atmosphere.archiveTicketTier",
    checkInTicket: "tickets.atmosphere.checkInTicket",
    claimFreeTicket: "tickets.atmosphere.claimFreeTicket",
    createCapacityGroup: "tickets.atmosphere.createCapacityGroup",
    createTicketEvent: "tickets.atmosphere.createTicketEvent",
    createTicketHold: "tickets.atmosphere.createTicketHold",
    createTicketTier: "tickets.atmosphere.createTicketTier",
    getTicketAvailability: "tickets.atmosphere.getTicketAvailability",
    listBuyerTickets: "tickets.atmosphere.listBuyerTickets",
    listOrganizerTickets: "tickets.atmosphere.listOrganizerTickets",
    releaseTicketHold: "tickets.atmosphere.releaseTicketHold",
    updateCapacityGroup: "tickets.atmosphere.updateCapacityGroup",
    updateTicketEvent: "tickets.atmosphere.updateTicketEvent",
    updateTicketTier: "tickets.atmosphere.updateTicketTier",
    verifyTicket: "tickets.atmosphere.verifyTicket",
  },
} as const;

type NestedStringValue<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? NestedStringValue<T[keyof T]>
    : never;

export type AtmXrpcMethod = NestedStringValue<typeof ATM_XRPC_METHODS>;

export type AtmEnvironment = "test" | "live";
export type AtmPaymentType = "tip" | "shop" | "commission" | "subscribe" | "ticket";
export type AtmPublicRecordVisibility = "public" | "private";
export type AtmSubscriptionActiveLimit =
  | "multiple"
  | "one_per_payer_recipient";

export type AtmPublicRecordPaymentPolicy = {
  appRecord?: AtmPublicRecordVisibility;
  attestation?: AtmPublicRecordVisibility;
};

export type AtmCheckoutPublicRecords = AtmPublicRecordPaymentPolicy;

export type AtmCheckoutSubscriptionPolicy = {
  activeLimit?: AtmSubscriptionActiveLimit;
};

export type AtmPublicRecordsPolicy = {
  enabled?: boolean;
  defaults?: AtmPublicRecordPaymentPolicy;
  byPaymentType?: Partial<Record<AtmPaymentType, AtmPublicRecordPaymentPolicy>>;
};

/** attested.network trust tiers, least → most assured. */
export type AtmAttestationTier = "federated" | "creator-trusted" | "strict";

export type AtmAttestationProofRef = {
  did?: string | null;
  proofUri?: string | null;
  proofCid?: string | null;
};

/**
 * The structured attestation block ATM sends on `attestation.updated` and
 * `payment.*` webhooks. Exactly three parties: broker (ATM), creator, payer.
 */
export type AtmAttestation = {
  /** The attested.network tier this payment satisfies, or null when none is active/public. */
  trustTier?: AtmAttestationTier | null;
  /** Whether the attestation currently stands or was withdrawn (refund/dispute). */
  lifecycle?: "active" | "invalidated";
  /** Whether the payment has public on-protocol records (vs ATM-ledger-only). */
  visibility?: "public" | "private";
  cid?: string | null;
  broker?: AtmAttestationProofRef;
  creator?: AtmAttestationProofRef & { proofPending?: boolean };
  payer?: {
    did?: string | null;
    recordUri?: string | null;
    recordCid?: string | null;
  };
};

export type AtmAttestationRefInspection = {
  /** Highest tier whose reference slots are present; not a trust verdict. */
  presentTier: AtmAttestationTier | null;
  missing: string[];
  /** This helper never resolves records, re-derives CIDs, or verifies signatures. */
  cryptographicallyVerified: false;
};

const ATM_ATTESTATION_TIER_RANK: Record<AtmAttestationTier, number> = {
  federated: 1,
  "creator-trusted": 2,
  strict: 3,
};

/**
 * Inspect which attested.network reference slots ATM included in a webhook.
 *
 * This is deliberately NOT named or shaped as a verifier. URI/CID strings in a
 * payload are attacker-controlled until the signed ATM webhook is authenticated
 * and, for protocol trust, the referenced records are resolved, CID-matched,
 * schema-checked, and chained to the broker proof. Never use `presentTier` as an
 * authorization or fulfillment verdict.
 *
 * Note: ATM payer records are private until the buyer publishes them, so a
 * missing payer record means "not yet public", NOT "unpaid" — fulfillment truth
 * is the Stripe/ATM webhook, not the public record.
 */
export function inspectAtmAttestationRefs(
  attestation: AtmAttestation | null | undefined,
  opts: { expect?: AtmAttestationTier } = {}
): AtmAttestationRefInspection {
  const hasBroker = Boolean(attestation?.broker?.proofUri);
  const hasCreator = Boolean(attestation?.creator?.proofUri);
  const payerDid = attestation?.payer?.did ?? null;
  const payerUri = attestation?.payer?.recordUri ?? null;
  const payerKnown = Boolean(
    payerUri && payerDid && payerUri.startsWith(`at://${payerDid}/`)
  );

  let presentTier: AtmAttestationTier | null = null;
  if (hasBroker) presentTier = "federated";
  if (hasBroker && hasCreator) presentTier = "creator-trusted";
  if (hasBroker && hasCreator && payerKnown) presentTier = "strict";

  const expected = opts.expect ?? "federated";

  const missing: string[] = [];
  if (!hasBroker) missing.push("broker proof");
  if (ATM_ATTESTATION_TIER_RANK[expected] >= 2 && !hasCreator) {
    missing.push("creator proof");
  }
  if (ATM_ATTESTATION_TIER_RANK[expected] >= 3 && !payerKnown) {
    missing.push("payer record on the payer's repo");
  }
  return { presentTier, missing, cryptographicallyVerified: false };
}

export type AtmRecipientApprovalStatus =
  | "pending"
  | "approved"
  | "blocked"
  | "revoked"
  | "needs-review";

export type AtmRequestRecipientApprovalInput = {
  recipientDid: string;
  environment: AtmEnvironment;
  paymentTypes: AtmPaymentType[];
  feeShareBps?: number;
  publicRecords?: AtmPublicRecordsPolicy;
  requestReason?: string;
  setupReturnUrl?: string;
  /**
   * Optional recipient (creator) presence token — a
   * `com.atproto.server.getServiceAuth` JWT with `iss = recipientDid`,
   * `aud = <brokerDid>#AttestedNetwork`, `lxm = money.atmosphere.app.assertRecipient`.
   * When present + valid, ATM may register the creator role without a separate
   * ATM sign-in. The app approval request remains `pending`: this token is not
   * bound to the requested app/environment/fee/scope. An invalid token is rejected.
   */
  recipientAssertionJwt?: string;
};

export type AtmRequestRecipientApprovalResult = {
  id: string;
  status: AtmRecipientApprovalStatus;
  dashboardUrl: string;
  onboardingUrl: string;
  paymentTypes: AtmPaymentType[];
  feeShareBps: number;
  materialChangeReasons?: string[];
  /** Deprecated compatibility field. Always false. */
  autoApproved?: boolean;
  /** True when the creator still needs to finish payout setup on ATM. */
  needsPaymentSetup?: boolean;
  [key: string]: unknown;
};

export type AtmAppWebhookEventSetting = {
  type: AtmWebhookEventType | string;
  enabled: boolean;
};

export type AtmAppConfig = {
  appDid: string;
  environment: AtmEnvironment;
  status: string;
  appUrl: string | null;
  feeShareBps: number;
  webhook: {
    configured: boolean;
    url: string | null;
    paused: boolean;
    secretRotatedAt: string | null;
    previousSecretExpiresAt: string | null;
  };
  appConfig: {
    modules: {
      payments: boolean;
      products: boolean;
      subscriptions: boolean;
      tickets: boolean;
      machinePayments: boolean;
    };
    subscriptionPolicy: {
      activeLimit: "multiple" | "one-per-payer-recipient" | string;
    };
    ticketing: {
      qrPasses: boolean;
      walletPasses: boolean;
    };
    ticketFee: {
      bps: number;
      flatAmount: number;
      passToBuyer: boolean;
    };
    payout: {
      holdDays: number;
    };
    checkout: {
      theme: "auto" | "light" | "dark" | string;
    };
    paymentMethods: {
      enabled: string[];
      disabled: string[];
      dynamicPaymentMethods: boolean;
    };
    publicRecords: Required<AtmPublicRecordsPolicy>;
    eventDelivery: {
      transport: "webhook" | "xrpc" | string;
      xrpcReceiver: {
        serviceRef: string;
        method: string;
      };
    };
    webhookEvents: AtmAppWebhookEventSetting[];
    atmSupportBps: number;
  };
};

export type AtmUpdateAppConfigInput = {
  environment: AtmEnvironment;
  appUrl?: string | null;
  webhookUrl?: string | null;
  webhookPaused?: boolean;
  feeShareBps?: number;
  atmSupportBps?: number;
  modules?: Partial<Record<"payments" | "products" | "subscriptions" | "tickets", boolean>>;
  subscriptionPolicy?: {
    activeLimit?: "multiple" | "one-per-payer-recipient";
  };
  ticketing?: {
    qrPasses?: boolean;
    walletPasses?: boolean;
  };
  /**
   * Apps can choose who pays ATM's configured ticket processing fee. ATM owns
   * the actual ticket fee rate and returns it from `getAppConfig`.
   */
  ticketFee?: {
    passToBuyer?: boolean;
  };
  payout?: {
    holdDays?: number;
  };
  checkout?: {
    theme?: "auto" | "light" | "dark";
  };
  paymentMethods?: {
    enabled?: string[];
    disabled?: string[];
    dynamicPaymentMethods?: boolean;
  };
  publicRecords?: AtmPublicRecordsPolicy;
  eventDelivery?: {
    transport?: "webhook" | "xrpc";
    xrpcReceiver?: {
      serviceRef?: string;
      method?: string;
    };
  };
  webhookEvents?: AtmAppWebhookEventSetting[];
};

export type AtmStrongRef = {
  $type: "com.atproto.repo.strongRef";
  uri: string;
  cid: string;
};

export type AtmProductKind =
  | "physical"
  | "digital"
  | "commission"
  | "membership"
  | "service"
  | "ticket"
  | "other";

export type AtmProductAppRef = {
  type?: "shop" | "commission" | "membership" | "membership-tier" | "custom";
  id?: string;
  uri?: string;
  cid?: string;
};

export type AtmProductRecurringPrice = {
  interval: "day" | "week" | "month" | "year";
  intervalCount?: number;
};

export type AtmProductCustomUnitAmount = {
  enabled: boolean;
  preset?: number;
  minimum?: number;
  maximum?: number;
};

export type AtmProductPriceTier = {
  upTo: string;
  unitAmount?: number;
  flatAmount?: number;
};

export type AtmProductPriceInput = {
  currency: string;
  unitAmount: number;
  type: "one-time" | "recurring";
  recurring?: AtmProductRecurringPrice;
  customUnitAmount?: AtmProductCustomUnitAmount;
  billingScheme?: "per-unit" | "tiered";
  tiersMode?: "graduated" | "volume";
  tiers?: AtmProductPriceTier[];
};

export type AtmProductInventoryInput = {
  trackInventory: boolean;
  quantityTotal?: number;
};

export type AtmCreateProductInput = {
  environment?: AtmEnvironment;
  title: string;
  sku?: string;
  kind: AtmProductKind;
  description?: string;
  price: AtmProductPriceInput;
  inventory?: AtmProductInventoryInput;
  variantOf?: AtmStrongRef;
  appProductRef?: AtmProductAppRef;
  fulfillmentUrl?: string;
  appLabel?: string;
  appUrl?: string;
  appIconUrl?: string;
};

export type AtmUpdateProductInput = {
  environment?: AtmEnvironment;
  product: AtmStrongRef;
  title?: string;
  sku?: string;
  kind?: AtmProductKind;
  description?: string;
  price?: AtmProductPriceInput;
  inventory?: AtmProductInventoryInput;
  /** True archives the product; false restores it to active sale surfaces. */
  archived?: boolean;
  appProductRef?: AtmProductAppRef;
  fulfillmentUrl?: string;
  appLabel?: string;
  appUrl?: string;
  appIconUrl?: string;
  linkStatus?: "active" | "archived";
};

export type AtmProductWriteResult = {
  product: AtmStrongRef;
  price?: AtmStrongRef;
  [key: string]: unknown;
};

export type AtmCheckoutEnvelope = {
  recipient: string;
  amount: number | string;
  currency?: string;
  paymentType?: AtmPaymentType;
  environment?: AtmEnvironment;
  /** Stable app retry key (1–200 URL-safe characters), scoped by app + environment. */
  idempotencyKey?: string;
  /** Canonical ISO expiry for a shop/commission reservation (30 minutes–24 hours). */
  checkoutExpiresAt?: string;
  /**
   * Buyer identity is optional. When supplied, both fields are required: a DID
   * without its per-checkout payer assertion is only app attribution and must
   * never be presented by the SDK as authenticated buyer identity.
   */
  payerDid?: string;
  payerAssertionJwt?: string;
  creatorHandle?: string;
  creatorDisplayName?: string;
  returnUrl?: string;
  cancelUrl?: string;
  interval?: "month" | "quarter" | "year";
  publicRecords?: AtmCheckoutPublicRecords;
  /**
   * Optional per-checkout override for subscription duplicate handling. Omit to
   * use the app/environment default configured in ATM.
   */
  subscriptionPolicy?: AtmCheckoutSubscriptionPolicy;
  subscriptionActiveLimit?: AtmSubscriptionActiveLimit;
  /**
   * Optional stable key for a subscription offering or tier family. Use the
   * same key for upgradeable tiers that should share one active relationship.
   * Omit it to let ATM fall back to the listing ref, then the seller/app pair.
   */
  subscriptionGroupKey?: string;
  listing?: AtmStrongRef;
  entitlements?: AtmStrongRef[];
  /** Public discount ref. Live recurring checkout is launch-gated; one-time
   * live and recurring test checkout remain supported. */
  discount?: AtmStrongRef;
  /** Public discount-code ref; same live-recurring launch gate as `discount`. */
  discountCode?: AtmStrongRef;
  metadata?: Record<string, unknown>;
};

export type AtmTicketHoldInput = {
  environment?: AtmEnvironment;
  eventId?: string;
  eventUri?: string;
  /** Optional authenticated buyer identity; supply both buyer fields or neither. */
  buyerDid?: string;
  buyerAssertionJwt?: string;
  customerEmail?: string;
  items: Array<{ tierId: string; quantity: number }>;
  returnUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type AtmTicketAvailabilityParams = {
  environment?: AtmEnvironment;
  eventId?: string;
  eventUri?: string;
};

export type AtmFreeTicketClaimInput = {
  environment?: AtmEnvironment;
  eventId?: string;
  eventUri?: string;
  tierId: string;
  buyerDid: string;
  buyerAssertionJwt: string;
  customerEmail?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type AtmTicketCheckInInput = {
  environment?: AtmEnvironment;
  ticketToken: string;
  checkInListId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type AtmTicketEventInput = {
  uri?: string;
  cid?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  url?: string;
  imageUrl?: string;
  image?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AtmTicketEventStatus = "active" | "paused" | "archived";

export type AtmCreateTicketEventInput = {
  environment?: AtmEnvironment;
  organizerDid: string;
  organizerAssertionJwt?: string;
  event: AtmTicketEventInput & { uri: string; title: string };
  status?: AtmTicketEventStatus;
  metadata?: Record<string, unknown>;
};

export type AtmUpdateTicketEventInput = {
  environment?: AtmEnvironment;
  eventId: string;
  title?: string;
  startsAt?: string | null;
  eventCid?: string | null;
  imageUrl?: string | null;
  status?: AtmTicketEventStatus;
  metadata?: Record<string, unknown>;
};

export type AtmCreateTicketTierInput = {
  environment?: AtmEnvironment;
  organizerDid: string;
  organizerAssertionJwt?: string;
  event: AtmTicketEventInput;
  title: string;
  description?: string | null;
  currency: string;
  unitAmount: number;
  quantityTotal: number;
  maxPerOrder?: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  tierRef?: AtmStrongRef | null;
  productRef?: AtmStrongRef | null;
  priceRef?: AtmStrongRef | null;
  metadata?: Record<string, unknown>;
};

export type AtmUpdateTicketTierInput = {
  environment?: AtmEnvironment;
  tierId: string;
  title?: string;
  description?: string | null;
  currency?: string;
  unitAmount?: number;
  maxPerOrder?: number;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  tierRef?: AtmStrongRef | null;
  productRef?: AtmStrongRef | null;
  priceRef?: AtmStrongRef | null;
  metadata?: Record<string, unknown>;
  status?: "active" | "paused" | "archived";
};

export type AtmArchiveTicketTierInput = {
  environment?: AtmEnvironment;
  tierId: string;
};

export type AtmCreateCapacityGroupInput = {
  environment?: AtmEnvironment;
  organizerDid: string;
  event: AtmTicketEventInput;
  name: string;
  totalCapacity: number;
  metadata?: Record<string, unknown>;
};

export type AtmUpdateCapacityGroupInput = {
  environment?: AtmEnvironment;
  capacityGroupId: string;
  name?: string;
  totalCapacity?: number;
  status?: "active" | "archived";
  metadata?: Record<string, unknown>;
};

export type AtmReleaseTicketHoldInput = {
  environment?: AtmEnvironment;
  holdId: string;
  reason?: string;
};

export type AtmListBuyerTicketsParams = {
  environment?: AtmEnvironment;
  buyerDid?: string;
  paymentId?: string;
  limit?: number;
  cursor?: string;
};

export type AtmListOrganizerTicketsParams = {
  environment?: AtmEnvironment;
  organizerDid?: string;
  eventId?: string;
  limit?: number;
  cursor?: string;
};

export type AtmVerifyTicketInput = {
  environment?: AtmEnvironment;
  ticketToken: string;
};

export type AtmServiceAuthTokenProvider = (input: {
  lxm: string;
  aud: string;
}) => Promise<string> | string;

export type AtmAppClientOptions = {
  brokerUrl?: string;
  appViewUrl?: string;
  serviceAudience?: string;
  getServiceAuthToken: AtmServiceAuthTokenProvider;
};

export type AtmInitiatePaymentResult = {
  token: string;
  url: string;
};

export type AtmWebhookEnvelope<TData = Record<string, unknown>> = {
  id: string;
  type: string;
  /** ISO 8601 datetime the envelope was built (apiVersion 2026-07+). */
  createdAt: string;
  apiVersion: string;
  environment: AtmEnvironment;
  data: AtmLexiconTypedEventData<TData>;
};

export type AtmWebhookEventType =
  | "app.webhook.test"
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.refund-updated"
  | "payment.disputed"
  | "payment.dispute-closed"
  | "subscription.invoice-paid"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.payment-failed"
  | "subscription.recovered"
  | "pledge.created"
  | "pledge.canceled"
  | "pledge.converted"
  | "pledge.conversion-failed"
  | "payer.record.requested"
  | "creator.proof.requested"
  | "attestation.updated"
  | "product.updated"
  | "product.archived"
  | "product.deleted"
  | "ticket.hold.created"
  | "ticket.hold.expired"
  | "tickets.issued"
  | "ticket.voided"
  | "ticket.refunded"
  | "ticket.checked-in"
  | "ticket.form-submitted"
  | "ticket.waitlist.joined"
  | "ticket.waitlist.offered"
  | "ticket.collaboration.invited"
  | "ticket.collaboration.accepted"
  | "ticket.collaboration.revoked"
  | "payer.claimed"
  | "customer.segment.message-requested"
  | "recipient.authorization.updated";

export type AtmLexiconTypedEventData<TData = Record<string, unknown>> = TData & {
  /**
   * Lexicon payload ref for generated AT Protocol/XRPC tooling.
   *
   * HTTP webhook handlers can usually branch on the envelope `type`; XRPC
   * receiver validators use this field to discriminate the `data` union.
   */
  $type?: string;
};

export type AtmPaymentSummary = {
  id: string;
  /** Amount in the smallest currency unit. */
  amount?: number;
  currency?: string;
  status?: string;
  paymentType?: AtmPaymentType | string;
  payerDid?: string | null;
  recipientDid?: string | null;
  appDid?: string | null;
  createdAt?: string;
  [key: string]: unknown;
};

export type AtmSubscriptionSummary = {
  id: string;
  status?: string;
  /** Amount in the smallest currency unit. */
  amount?: number;
  currency?: string;
  interval?: "day" | "week" | "month" | "year" | string;
  /** Units of `interval` between billings (quarterly = month x 3). */
  intervalCount?: number;
  payerDid?: string | null;
  recipientDid?: string | null;
  appDid?: string | null;
  [key: string]: unknown;
};

export type AtmTicketSummary = {
  id: string;
  ticketId?: string;
  tierId?: string;
  eventId?: string;
  eventUri?: string;
  status?: string;
  [key: string]: unknown;
};

export type AtmCapacityGroupSummary = {
  id?: string;
  name?: string;
  status?: string;
  totalCapacity?: number;
  [key: string]: unknown;
};

export type AtmTicketTierSummary = {
  id?: string;
  title?: string;
  status?: string;
  currency?: string;
  unitAmount?: number;
  quantityTotal?: number;
  [key: string]: unknown;
};

export type AtmTicketEventSummary = {
  id?: string;
  uri?: string;
  title?: string;
  startsAt?: string;
  [key: string]: unknown;
};

export type AtmTicketEventResult = {
  event?: AtmTicketEventSummary;
  [key: string]: unknown;
};

export type AtmPaymentEventData = {
  payment: AtmPaymentSummary;
  [key: string]: unknown;
};

export type AtmSubscriptionEventData = {
  subscription: AtmSubscriptionSummary;
  payment?: AtmPaymentSummary;
  [key: string]: unknown;
};

export type AtmTicketEventData = {
  eventId?: string;
  eventUri?: string;
  holdId?: string;
  paymentId?: string;
  issuedCount?: number;
  tickets?: AtmTicketSummary[];
  [key: string]: unknown;
};

export type AtmProductEventData = {
  product: {
    uri: string;
    cid?: string | null;
    title?: string;
    [key: string]: unknown;
  };
  creatorDid?: string;
  appLink?: Record<string, unknown>;
  [key: string]: unknown;
};

/** `payer.claimed` — a guest payer linked their records to a DID. */
export type AtmPayerClaimedEventData = {
  did: string;
  paymentIds: string[];
  subscriptionIds?: string[];
  ticketIds?: string[];
  claimedAt: string;
  [key: string]: unknown;
};

/** `ticket.waitlist.joined` / `ticket.waitlist.offered`. */
export type AtmTicketWaitlistEventData = {
  waitlist: {
    id: string;
    eventId: string;
    capacityGroupId: string;
    quantity: number;
    /** Present on `ticket.waitlist.offered`: the held seat + claim deadline. */
    offerHoldId?: string;
    offerExpiresAt?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Pledge lifecycle snapshot (Substack-style subscribe-before-payable). The
 * payer saved a card; no charge and no payment record exists until the pledge
 * converts. Amounts are integer minor units.
 */
export type AtmPledgeSummary = {
  id: string;
  recipientDid: string;
  /** Present only for signed-in pledgers; guest pledges omit it. */
  payerDid?: string;
  amount: number;
  currency: string;
  interval: "month" | "quarter" | "year" | string;
  tierLabel?: string;
  subscriptionGroupKey?: string;
  listing?: { uri: string; cid?: string; [key: string]: unknown };
  status:
    | "pending_setup"
    | "active"
    | "converting"
    | "converted"
    | "canceled"
    | "superseded"
    | "failed"
    | "expired"
    | string;
  autoConvert: boolean;
  createdAt: string;
  canceledAt?: string;
  canceledBy?: string | null;
  convertedAt?: string;
  [key: string]: unknown;
};

/** `pledge.created` / `pledge.canceled` — pledge lifecycle signals. */
export type AtmPledgeEventData = {
  pledge: AtmPledgeSummary;
  [key: string]: unknown;
};

/**
 * `pledge.converted` — the recipient became payable and the pledge became a
 * live subscription (the saved card was charged). Settlement still emits
 * `payment.completed` / `subscription.invoice-paid` for the first invoice.
 */
export type AtmPledgeConvertedEventData = {
  pledge: AtmPledgeSummary;
  paymentId: string;
  subscriptionId?: string | null;
  [key: string]: unknown;
};

/**
 * `pledge.conversion-failed` — the saved card could not be charged. When
 * `willRetry` is false the pledge is terminal and your app owns
 * re-engagement (e.g. link the supporter to a fresh subscribe checkout).
 */
export type AtmPledgeConversionFailedEventData = {
  pledge: AtmPledgeSummary;
  reasonCode: string;
  willRetry: boolean;
  [key: string]: unknown;
};

/** `customer.segment.message-requested` — fan a message out to a cohort. */
export type AtmSegmentMessageEventData = {
  segmentKey: string;
  messageType: string;
  memberCount: number;
  requestedAt: string;
  [key: string]: unknown;
};

/**
 * `recipient.authorization.updated` — a creator/recipient approved, blocked, or
 * revoked your app's authorization to originate payments on their behalf. Gate
 * your checkout on this: `status === "approved"` means you may accept payments
 * for `recipientDid` (within `approvedPaymentTypes` / `approvedFeeShareBps`);
 * `"blocked"`/`"revoked"` means you must stop. Carries DIDs + scope only — no PII.
 */
export type AtmRecipientAuthorizationEventData = {
  recipientDid: string;
  status: "approved" | "blocked" | "revoked";
  approvedPaymentTypes?: string[];
  approvedFeeShareBps?: number | null;
  updatedAt: string;
  [key: string]: unknown;
};

export type AtmEventDataByType = {
  "payment.completed": AtmPaymentEventData;
  "payment.failed": AtmPaymentEventData;
  "payment.refunded": AtmPaymentEventData;
  "payment.refund-updated": AtmPaymentEventData;
  "payment.disputed": AtmPaymentEventData;
  "payment.dispute-closed": AtmPaymentEventData;
  "subscription.invoice-paid": AtmSubscriptionEventData;
  "subscription.updated": AtmSubscriptionEventData;
  "subscription.canceled": AtmSubscriptionEventData;
  "subscription.payment-failed": AtmSubscriptionEventData;
  "subscription.recovered": AtmSubscriptionEventData;
  "pledge.created": AtmPledgeEventData;
  "pledge.canceled": AtmPledgeEventData;
  "pledge.converted": AtmPledgeConvertedEventData;
  "pledge.conversion-failed": AtmPledgeConversionFailedEventData;
  "product.updated": AtmProductEventData;
  "product.archived": AtmProductEventData;
  "product.deleted": AtmProductEventData;
  "ticket.hold.created": AtmTicketEventData;
  "ticket.hold.expired": AtmTicketEventData;
  "tickets.issued": AtmTicketEventData;
  "ticket.voided": AtmTicketEventData;
  "ticket.refunded": AtmTicketEventData;
  "ticket.checked-in": AtmTicketEventData;
  "ticket.form-submitted": AtmTicketEventData;
  "ticket.waitlist.joined": AtmTicketWaitlistEventData;
  "ticket.waitlist.offered": AtmTicketWaitlistEventData;
  "ticket.collaboration.invited": AtmTicketEventData;
  "ticket.collaboration.accepted": AtmTicketEventData;
  "ticket.collaboration.revoked": AtmTicketEventData;
  "payer.claimed": AtmPayerClaimedEventData;
  "customer.segment.message-requested": AtmSegmentMessageEventData;
  "recipient.authorization.updated": AtmRecipientAuthorizationEventData;
};

export type AtmEventDataFor<TType extends AtmWebhookEventType> =
  TType extends keyof AtmEventDataByType
    ? AtmEventDataByType[TType]
    : Record<string, unknown>;

export type AtmTypedEvent<TType extends AtmWebhookEventType> =
  AtmWebhookEnvelope<AtmEventDataFor<TType>> & { type: TType };

export type AtmTypedWebhookEnvelope<TType extends keyof AtmEventDataByType> =
  AtmWebhookEnvelope<AtmEventDataByType[TType]> & { type: TType };

export type AtmPaymentCompletedEvent = AtmTypedEvent<"payment.completed">;
export type AtmTicketsIssuedEvent = AtmTypedEvent<"tickets.issued">;
export type AtmTicketCheckedInEvent = AtmTypedEvent<"ticket.checked-in">;

export type AtmPayoutStatus = {
  actor?: string;
  payable?: boolean;
  status?: string;
  reason?: string;
  [key: string]: unknown;
};

export type AtmPaymentStatus = {
  token?: string;
  status?: string;
  payment?: AtmPaymentSummary;
  [key: string]: unknown;
};

export type AtmFeeDistributionStatus =
  | "queued"
  | "transferred"
  | "held"
  | "reversed"
  | "failed";

export type AtmFeeDistribution = {
  id: string;
  paymentId: string;
  chargeId?: string;
  role: string;
  /** Amount in the smallest currency unit. */
  amount: number;
  currency: string;
  status: AtmFeeDistributionStatus;
  heldReason?: string;
  processorTransferId?: string;
  clawbackStatus?: "pending" | "reversed" | "failed" | "waived";
  clawbackAmount: number;
  processorReversalId?: string;
  period?: string;
  createdAt: string;
  [key: string]: unknown;
};

export type AtmAuditFeeDistributionsParams = {
  cursor?: string;
  environment?: AtmEnvironment;
  paymentId?: string;
  status?: AtmFeeDistributionStatus;
  limit?: number;
};

export type AtmFeeDistributionsResult = {
  distributions: AtmFeeDistribution[];
  cursor?: string;
  [key: string]: unknown;
};

export type AtmProfile = {
  did?: string;
  handle?: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  [key: string]: unknown;
};

export type AtmTicketAvailability = {
  eventId?: string;
  eventUri?: string;
  environment?: AtmEnvironment;
  available?: boolean;
  tiers?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type AtmTicketHoldResult = {
  holdId?: string;
  token?: string;
  url?: string;
  expiresAt?: string;
  [key: string]: unknown;
};

export type AtmTicketTierResult = {
  event?: AtmTicketEventSummary;
  capacityGroup?: AtmCapacityGroupSummary;
  tier?: AtmTicketTierSummary;
  [key: string]: unknown;
};

export type AtmCapacityGroupResult = {
  event?: AtmTicketEventSummary;
  capacityGroup?: AtmCapacityGroupSummary;
  [key: string]: unknown;
};

export type AtmArchiveTicketTierResult = {
  tier?: AtmTicketTierSummary;
  [key: string]: unknown;
};

export type AtmReleaseTicketHoldResult = {
  hold?: {
    id?: string;
    status?: "released" | "expired" | "failed" | "completed" | string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type AtmListTicketsResult = {
  tickets: AtmTicketSummary[];
  cursor?: string;
  [key: string]: unknown;
};

export type AtmFreeTicketClaimResult = {
  claimId?: string;
  tickets?: AtmTicketSummary[];
  [key: string]: unknown;
};

export type AtmTicketCheckInResult = {
  ok?: boolean;
  status?: string;
  ticket?: AtmTicketSummary;
  [key: string]: unknown;
};

export type AtmVerifyTicketResult = {
  valid: boolean;
  reason?: string;
  ticket?: AtmTicketSummary;
  presentation?: Record<string, unknown>;
  event?: AtmTicketEventSummary;
  tier?: AtmTicketTierSummary;
  [key: string]: unknown;
};

export type AtmWebhookHeaders = {
  signature: string | null | undefined;
  deliveryId: string | null | undefined;
  event?: string | null | undefined;
  apiVersion?: string | null | undefined;
  environment?: string | null | undefined;
};

export type VerifyAtmWebhookOptions = {
  rawBody: string;
  signature: string;
  deliveryId: string;
  secret: string | readonly string[];
  toleranceSeconds?: number;
  now?: number;
};

export type ConstructAtmWebhookOptions = {
  rawBody: string;
  headers: AtmWebhookHeaders;
  secret: string | readonly string[];
  toleranceSeconds?: number;
  now?: number;
};

export type AtmVerifiedServiceAuthClaims = {
  iss: string;
  aud: string;
  lxm: string;
  exp?: number;
  iat?: number;
  jti?: string;
};

export type AtmReceiverServiceAuthVerifier = (input: {
  token: string;
  expectedIss: string;
  expectedAud: string;
  expectedLxm: string;
}) => Promise<AtmVerifiedServiceAuthClaims> | AtmVerifiedServiceAuthClaims;

export type AtmXrpcReceiverHeaders = {
  authorization: string | null | undefined;
  deliveryId?: string | null | undefined;
  event?: string | null | undefined;
  apiVersion?: string | null | undefined;
  environment?: string | null | undefined;
};

export type ConstructAtmXrpcReceiverOptions = {
  rawBody: string;
  headers: AtmXrpcReceiverHeaders;
  appDid: string;
  serviceRef?: string;
  expectedIssuerDid?: string;
  expectedLxm?: string;
  verifyServiceAuthJwt: AtmReceiverServiceAuthVerifier;
};

export type VerifyServiceAuthRequestOptions = {
  request: Request;
  expectedIss: string;
  expectedAud: string;
  expectedLxm: string;
  verifyServiceAuthJwt: AtmReceiverServiceAuthVerifier;
};

export type AtmWebhookHandlerEvent<
  TType extends AtmWebhookEventType | undefined = undefined,
> = TType extends AtmWebhookEventType
  ? AtmTypedEvent<TType>
  : AtmWebhookEnvelope;

export type AtmWebhookHandlerResult =
  | Response
  | {
      status?: number;
      body?: unknown;
      headers?: Record<string, string>;
    }
  | void;

export type AtmWebhookHandlerOptions<
  TType extends AtmWebhookEventType | undefined = undefined,
> = {
  secret: string | readonly string[];
  expectedType?: TType;
  toleranceSeconds?: number;
  now?: number;
  /**
   * Durable delivery state. `claim` must atomically distinguish a completed
   * delivery from an active claim. The helper calls `complete` only after a
   * successful 2xx fulfillment result and calls `release` when fulfillment
   * throws or returns non-2xx so ATM can safely redrive the same delivery.
   * Complete/release must condition on the supplied claim id so a stale worker
   * cannot settle a newer lease after its own lease expires.
   */
  deliveryStore?: AtmWebhookDeliveryStore<TType>;
  onEvent: (
    event: AtmWebhookHandlerEvent<TType>,
    context: { rawBody: string; request?: Request }
  ) => Promise<AtmWebhookHandlerResult> | AtmWebhookHandlerResult;
  onError?: (error: unknown) => Promise<AtmWebhookHandlerResult> | AtmWebhookHandlerResult;
};

export type AtmWebhookDeliveryClaimResult =
  | { status: "claimed"; claimId: string }
  | { status: "completed" }
  | { status: "busy" };

export type AtmWebhookDeliveryStore<
  TType extends AtmWebhookEventType | undefined = undefined,
> = {
  claim: (
    deliveryId: string,
    event: AtmWebhookHandlerEvent<TType>
  ) => Promise<AtmWebhookDeliveryClaimResult> | AtmWebhookDeliveryClaimResult;
  complete: (
    deliveryId: string,
    claimId: string,
    event: AtmWebhookHandlerEvent<TType>
  ) => Promise<void> | void;
  release: (
    deliveryId: string,
    claimId: string,
    event: AtmWebhookHandlerEvent<TType>,
    error?: unknown
  ) => Promise<void> | void;
};

export type AtmExpressLikeRequest = {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: string | Buffer;
  body?: unknown;
};

export type AtmExpressLikeResponse = {
  status(code: number): AtmExpressLikeResponse;
  json(body: unknown): unknown;
  send?(body: unknown): unknown;
  setHeader?(name: string, value: string): unknown;
};

export type AtmExpressWebhookHandlerOptions<
  TType extends AtmWebhookEventType | undefined = undefined,
> = AtmWebhookHandlerOptions<TType> & {
  getRawBody?: (request: AtmExpressLikeRequest) => Promise<string | Buffer> | string | Buffer;
};

export type AtmHonoLikeContext = {
  req: {
    raw: Request;
  };
};

export type AtmCloudflareWorkerWebhookHandler = {
  fetch(request: Request): Promise<Response>;
};

export function createAtmCheckoutProduct(input: AtmCheckoutEnvelope): string {
  assertDid(input.recipient, "recipient");
  if (Boolean(input.payerDid) !== Boolean(input.payerAssertionJwt)) {
    throw new Error(
      "payerDid and payerAssertionJwt must be supplied together; omit both for guest checkout"
    );
  }
  if (input.payerDid) assertDid(input.payerDid, "payerDid");
  if (input.amount === "" || input.amount === null || input.amount === undefined) {
    throw new Error("amount is required");
  }
  if (
    input.idempotencyKey !== undefined &&
    (!/^[A-Za-z0-9._:/-]{1,200}$/.test(input.idempotencyKey) ||
      input.idempotencyKey.trim() !== input.idempotencyKey)
  ) {
    throw new Error("idempotencyKey must be 1-200 URL-safe characters");
  }
  if (
    input.checkoutExpiresAt !== undefined &&
    (!Number.isFinite(Date.parse(input.checkoutExpiresAt)) ||
      new Date(input.checkoutExpiresAt).toISOString() !== input.checkoutExpiresAt)
  ) {
    throw new Error("checkoutExpiresAt must be a canonical ISO timestamp");
  }
  // Older betas exposed customerEmail even though ATM intentionally ignores an
  // app-supplied checkout email. Strip it at runtime as well as from the public
  // type so stale callers cannot bind an idempotency key to a misleading field.
  const { customerEmail: _ignoredCustomerEmail, ...supportedInput } = input as
    AtmCheckoutEnvelope & { customerEmail?: unknown };
  const payload = pruneUndefined(supportedInput);
  return `${ATM_CHECKOUT_PRODUCT_PREFIX}${base64UrlEncode(JSON.stringify(payload))}`;
}

export function createPaymentInitiateBody(input: AtmCheckoutEnvelope): {
  product: string;
} {
  return { product: createAtmCheckoutProduct(input) };
}

export function createTicketHoldBody(input: AtmTicketHoldInput): AtmTicketHoldInput {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("ticket hold requires at least one item");
  }
  for (const item of input.items) {
    if (!item.tierId) {
      throw new Error("ticket hold items require tierId");
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("ticket hold item quantity must be a positive integer");
    }
  }
  if (Boolean(input.buyerDid) !== Boolean(input.buyerAssertionJwt)) {
    throw new Error(
      "buyerDid and buyerAssertionJwt must be supplied together; omit both for guest checkout"
    );
  }
  if (input.buyerDid) assertDid(input.buyerDid, "buyerDid");
  return pruneUndefined(input);
}

export function createFreeTicketClaimBody(
  input: AtmFreeTicketClaimInput
): AtmFreeTicketClaimInput {
  assertDid(input.buyerDid, "buyerDid");
  if (!input.buyerAssertionJwt) {
    throw new Error("free ticket claims require buyerAssertionJwt");
  }
  if (!input.tierId) {
    throw new Error("free ticket claims require tierId");
  }
  return pruneUndefined(input);
}

export function signAtmWebhookPayload(opts: {
  rawBody: string;
  deliveryId: string;
  secret: string;
  timestamp?: number;
}): string {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${opts.deliveryId}.${opts.rawBody}`;
  const digest = createHmac("sha256", opts.secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifyAtmWebhookSignature(
  opts: VerifyAtmWebhookOptions
): boolean {
  const parsed = parseAtmSignatureHeader(opts.signature);
  if (!parsed) return false;
  const tolerance =
    opts.toleranceSeconds ?? DEFAULT_ATM_WEBHOOK_TOLERANCE_SECONDS;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const signedPayload = `${parsed.timestamp}.${opts.deliveryId}.${opts.rawBody}`;
  const secrets = normalizeSecrets(opts.secret);
  if (secrets.length === 0) return false;

  let valid = false;
  for (const secret of secrets) {
    const expected = createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");
    const expectedBuffer = Uint8Array.from(Buffer.from(expected, "hex"));
    const dummyBuffer = new Uint8Array(expectedBuffer.length);
    for (const candidate of parsed.signatures) {
      const wellFormed = /^[0-9a-fA-F]{64}$/.test(candidate);
      const candidateBuffer = wellFormed
        ? Uint8Array.from(Buffer.from(candidate, "hex"))
        : dummyBuffer;
      const matches = timingSafeEqual(expectedBuffer, candidateBuffer) && wellFormed;
      valid = matches || valid;
    }
  }
  return valid;
}

export function constructAtmWebhookEvent<TData = Record<string, unknown>>(
  opts: ConstructAtmWebhookOptions
): AtmWebhookEnvelope<TData> {
  const signature = opts.headers.signature;
  const deliveryId = opts.headers.deliveryId;
  if (!signature) {
    throw new AtmWebhookSignatureError("Missing Atm-Signature header");
  }
  if (!deliveryId) {
    throw new AtmWebhookSignatureError("Missing Atm-Delivery-Id header");
  }
  const ok = verifyAtmWebhookSignature({
    rawBody: opts.rawBody,
    signature,
    deliveryId,
    secret: opts.secret,
    toleranceSeconds: opts.toleranceSeconds,
    now: opts.now,
  });
  if (!ok) {
    throw new AtmWebhookSignatureError("ATM webhook signature is invalid");
  }
  const parsed = safeJsonParse(opts.rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AtmWebhookSignatureError("ATM webhook body is not a JSON object");
  }
  const event = parsed as Partial<AtmWebhookEnvelope<TData>>;
  if (event.id !== deliveryId) {
    throw new AtmWebhookSignatureError(
      "ATM webhook delivery id does not match the signed body"
    );
  }
  if (opts.headers.event && event.type !== opts.headers.event) {
    throw new AtmWebhookSignatureError(
      "ATM webhook event type does not match the signed body"
    );
  }
  if (opts.headers.apiVersion && event.apiVersion !== opts.headers.apiVersion) {
    throw new AtmWebhookSignatureError(
      "ATM webhook API version does not match the signed body"
    );
  }
  if (opts.headers.environment && event.environment !== opts.headers.environment) {
    throw new AtmWebhookSignatureError(
      "ATM webhook environment does not match the signed body"
    );
  }
  return event as AtmWebhookEnvelope<TData>;
}

export function constructTypedAtmWebhookEvent<TType extends AtmWebhookEventType>(
  opts: ConstructAtmWebhookOptions & { expectedType: TType }
): AtmTypedEvent<TType> {
  const event = constructAtmWebhookEvent<AtmEventDataFor<TType>>({
    ...opts,
    headers: {
      ...opts.headers,
      event: opts.headers.event ?? opts.expectedType,
    },
  });
  if (event.type !== opts.expectedType) {
    throw new AtmWebhookSignatureError(
      `ATM webhook event type does not match expected ${opts.expectedType}`
    );
  }
  return event as AtmTypedEvent<TType>;
}

export function createNodeWebhookHandler<
  TType extends AtmWebhookEventType | undefined = undefined,
>(options: AtmWebhookHandlerOptions<TType>) {
  return async function handleAtmWebhook(request: Request): Promise<Response> {
    try {
      const rawBody = await request.text();
      const event = constructWebhookHandlerEvent(rawBody, requestHeaders(request), options);
      const outcome = await processWebhookDelivery(options, event, {
        rawBody,
        request,
      });
      if (outcome.kind === "completed") {
        return jsonResponse(200, {
          ok: true,
          duplicate: true,
          deliveryId: event.id,
        });
      }
      if (outcome.kind === "busy") {
        return jsonResponse(
          503,
          { error: "AtmWebhookDeliveryBusy", deliveryId: event.id },
          { "retry-after": "1" }
        );
      }
      return normalizeWebhookHandlerResult(outcome.result);
    } catch (error) {
      if (options.onError) {
        return normalizeWebhookErrorHandlerResult(await options.onError(error));
      }
      return defaultWebhookErrorResponse(error);
    }
  };
}

export const createNextWebhookRoute = createNodeWebhookHandler;

export function createHonoWebhookHandler<
  TType extends AtmWebhookEventType | undefined = undefined,
>(options: AtmWebhookHandlerOptions<TType>) {
  const handler = createNodeWebhookHandler(options);
  return function handleAtmHonoWebhook(
    contextOrRequest: AtmHonoLikeContext | Request
  ): Promise<Response> {
    const request =
      contextOrRequest instanceof Request
        ? contextOrRequest
        : contextOrRequest.req.raw;
    return handler(request);
  };
}

export function createCloudflareWorkerWebhookHandler<
  TType extends AtmWebhookEventType | undefined = undefined,
>(
  options: AtmWebhookHandlerOptions<TType>
): AtmCloudflareWorkerWebhookHandler {
  const handler = createNodeWebhookHandler(options);
  return {
    fetch(request: Request) {
      return handler(request);
    },
  };
}

export function createExpressWebhookHandler<
  TType extends AtmWebhookEventType | undefined = undefined,
>(options: AtmExpressWebhookHandlerOptions<TType>) {
  return async function handleAtmExpressWebhook(
    request: AtmExpressLikeRequest,
    response: AtmExpressLikeResponse,
    next?: (error?: unknown) => void
  ): Promise<void> {
    try {
      const raw = options.getRawBody
        ? await options.getRawBody(request)
        : defaultExpressRawBody(request);
      const rawBody = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
      const event = constructWebhookHandlerEvent(
        rawBody,
        expressHeaders(request.headers),
        options
      );
      const outcome = await processWebhookDelivery(options, event, { rawBody });
      if (outcome.kind === "completed") {
        sendExpressJson(response, 200, {
          ok: true,
          duplicate: true,
          deliveryId: event.id,
        });
        return;
      }
      if (outcome.kind === "busy") {
        sendExpressJson(
          response,
          503,
          { error: "AtmWebhookDeliveryBusy", deliveryId: event.id },
          { "retry-after": "1" }
        );
        return;
      }
      const normalized = normalizePlainWebhookHandlerResult(outcome.result);
      sendExpressJson(response, normalized.status, normalized.body, normalized.headers);
    } catch (error) {
      if (options.onError) {
        const normalized = normalizePlainWebhookErrorHandlerResult(
          await options.onError(error)
        );
        sendExpressJson(response, normalized.status, normalized.body, normalized.headers);
        return;
      }
      if (next) {
        next(error);
        return;
      }
      const normalized = defaultPlainWebhookError(error);
      sendExpressJson(response, normalized.status, normalized.body, normalized.headers);
    }
  };
}

export async function constructAtmXrpcReceiverEvent<
  TData = Record<string, unknown>,
>(
  opts: ConstructAtmXrpcReceiverOptions
): Promise<AtmWebhookEnvelope<TData>> {
  assertDid(opts.appDid, "appDid");
  const expectedAud = receiverAudience(
    opts.appDid,
    opts.serviceRef ?? DEFAULT_ATM_XRPC_RECEIVER_SERVICE
  );
  const expectedIssuerDid = opts.expectedIssuerDid ?? ATM_BROKER_DID;
  const expectedLxm = opts.expectedLxm ?? ATM_EVENT_RECEIVE_NSID;
  const token = bearerToken(opts.headers.authorization);
  if (!token) {
    throw new AtmXrpcReceiverAuthError("Missing XRPC receiver Authorization bearer token");
  }
  const claims = await opts.verifyServiceAuthJwt({
    token,
    expectedIss: expectedIssuerDid,
    expectedAud,
    expectedLxm,
  });
  verifyAtmReceiverServiceAuthClaims({
    claims,
    expectedIss: expectedIssuerDid,
    expectedAud,
    expectedLxm,
  });

  const event = parseAtmEventEnvelope<TData>(opts.rawBody);
  assertOptionalEventHeaders(event, {
    deliveryId: opts.headers.deliveryId,
    event: opts.headers.event,
    apiVersion: opts.headers.apiVersion,
    environment: opts.headers.environment,
  });
  return event;
}

export async function verifyServiceAuthRequest(
  opts: VerifyServiceAuthRequestOptions
): Promise<AtmVerifiedServiceAuthClaims> {
  const token = bearerToken(opts.request.headers.get("authorization"));
  if (!token) {
    throw new AtmXrpcReceiverAuthError("Missing service-auth Authorization bearer token");
  }
  const claims = await opts.verifyServiceAuthJwt({
    token,
    expectedIss: opts.expectedIss,
    expectedAud: opts.expectedAud,
    expectedLxm: opts.expectedLxm,
  });
  verifyAtmReceiverServiceAuthClaims({
    claims,
    expectedIss: opts.expectedIss,
    expectedAud: opts.expectedAud,
    expectedLxm: opts.expectedLxm,
  });
  return claims;
}

export async function constructTypedAtmXrpcReceiverEvent<
  TType extends AtmWebhookEventType,
>(
  opts: ConstructAtmXrpcReceiverOptions & { expectedType: TType }
): Promise<AtmTypedEvent<TType>> {
  const event = await constructAtmXrpcReceiverEvent<AtmEventDataFor<TType>>({
    ...opts,
    headers: {
      ...opts.headers,
      event: opts.headers.event ?? opts.expectedType,
    },
  });
  if (event.type !== opts.expectedType) {
    throw new AtmXrpcReceiverAuthError(
      `ATM XRPC receiver event type does not match expected ${opts.expectedType}`
    );
  }
  return event as AtmTypedEvent<TType>;
}

export function verifyAtmReceiverServiceAuthClaims(opts: {
  claims: AtmVerifiedServiceAuthClaims;
  expectedIss: string;
  expectedAud: string;
  expectedLxm: string;
}): void {
  if (opts.claims.iss !== opts.expectedIss) {
    throw new AtmXrpcReceiverAuthError(
      `ATM receiver JWT iss mismatch: expected ${opts.expectedIss}`
    );
  }
  if (opts.claims.aud !== opts.expectedAud) {
    throw new AtmXrpcReceiverAuthError(
      `ATM receiver JWT aud mismatch: expected ${opts.expectedAud}`
    );
  }
  if (opts.claims.lxm !== opts.expectedLxm) {
    throw new AtmXrpcReceiverAuthError(
      `ATM receiver JWT lxm mismatch: expected ${opts.expectedLxm}`
    );
  }
}

export function createAtmXrpcReceiverAudience(
  appDid: string,
  serviceRef = DEFAULT_ATM_XRPC_RECEIVER_SERVICE
): string {
  assertDid(appDid, "appDid");
  return receiverAudience(appDid, serviceRef);
}

export function createAtmAppClient(options: AtmAppClientOptions) {
  const brokerUrl = normalizeBaseUrl(options.brokerUrl ?? DEFAULT_ATM_BROKER_URL);
  const appViewUrl = normalizeBaseUrl(options.appViewUrl ?? DEFAULT_ATM_APPVIEW_URL);
  const audience = options.serviceAudience ?? ATM_BROKER_SERVICE_AUDIENCE;

  async function callJson<T>(
    baseUrl: string,
    method: string,
    nsid: string,
    body?: unknown
  ): Promise<T> {
    const token = await options.getServiceAuthToken({ lxm: nsid, aud: audience });
    const res = await fetch(`${baseUrl}/xrpc/${nsid}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return readAtmJson<T>(res);
  }

  async function callQuery<T>(
    baseUrl: string,
    nsid: string,
    params: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const token = await options.getServiceAuthToken({ lxm: nsid, aud: audience });
    const url = new URL(`${baseUrl}/xrpc/${nsid}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    return readAtmJson<T>(res);
  }

  return {
    createCheckoutProduct: createAtmCheckoutProduct,
    createPaymentInitiateBody,

    getPayoutStatus(actor: string) {
      return callQuery<AtmPayoutStatus>(
        brokerUrl,
        ATM_XRPC_METHODS.actor.getPayoutStatus,
        { actor }
      );
    },

    /**
     * Audit this app's own app-fee payout distributions (queued/held/
     * transferred/reversed/failed) for reconciliation and payout transparency.
     * Scoped server-side to rows the app both originated and is the fee
     * recipient of; never returns creator proceeds or connected-account ids.
     */
    auditFeeDistributions(params: AtmAuditFeeDistributionsParams = {}) {
      return callQuery<AtmFeeDistributionsResult>(
        brokerUrl,
        ATM_XRPC_METHODS.app.auditFeeDistributions,
        {
          cursor: params.cursor,
          environment: params.environment,
          paymentId: params.paymentId,
          status: params.status,
          limit: params.limit,
        }
      );
    },

    /**
     * Read this app's test/live configuration through app service-auth. The
     * response is sanitized: it reports webhook status and ticket fee policy,
     * but never returns webhook signing secrets or processor credentials.
     */
    getAppConfig(environment: AtmEnvironment) {
      return callQuery<AtmAppConfig>(brokerUrl, ATM_XRPC_METHODS.app.getConfig, {
        environment,
      });
    },

    /**
     * Update app-level configuration that is safe for app code to control:
     * app/webhook URLs, modules, app fee share, checkout policy, public-record
     * defaults, event delivery, and ticketing toggles. ATM-owned fee rates and
     * processor account state are intentionally not mutable here.
     */
    updateAppConfig(input: AtmUpdateAppConfigInput) {
      return callJson<AtmAppConfig>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.app.updateConfig,
        input
      );
    },

    initiatePayment(input: AtmCheckoutEnvelope) {
      return callJson<AtmInitiatePaymentResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.payment.initiate,
        createPaymentInitiateBody(input)
      );
    },

    requestRecipientApproval(input: AtmRequestRecipientApprovalInput) {
      return callJson<AtmRequestRecipientApprovalResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.app.requestRecipientApproval,
        input
      );
    },

    createProduct(input: AtmCreateProductInput) {
      return callJson<AtmProductWriteResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.catalog.createProduct,
        input
      );
    },

    updateProduct(input: AtmUpdateProductInput) {
      return callJson<AtmProductWriteResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.catalog.updateProduct,
        input
      );
    },

    getPaymentStatus(token: string) {
      return callQuery<AtmPaymentStatus>(
        brokerUrl,
        ATM_XRPC_METHODS.payment.status,
        { token }
      );
    },

    createTicketEvent(input: AtmCreateTicketEventInput) {
      return callJson<AtmTicketEventResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.createTicketEvent,
        input
      );
    },

    updateTicketEvent(input: AtmUpdateTicketEventInput) {
      return callJson<AtmTicketEventResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.updateTicketEvent,
        input
      );
    },

    createTicketTier(input: AtmCreateTicketTierInput) {
      return callJson<AtmTicketTierResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.createTicketTier,
        input
      );
    },

    updateTicketTier(input: AtmUpdateTicketTierInput) {
      return callJson<{ tier?: AtmTicketTierSummary; [key: string]: unknown }>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.updateTicketTier,
        input
      );
    },

    archiveTicketTier(input: AtmArchiveTicketTierInput) {
      return callJson<AtmArchiveTicketTierResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.archiveTicketTier,
        input
      );
    },

    createCapacityGroup(input: AtmCreateCapacityGroupInput) {
      return callJson<AtmCapacityGroupResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.createCapacityGroup,
        input
      );
    },

    updateCapacityGroup(input: AtmUpdateCapacityGroupInput) {
      return callJson<{ capacityGroup?: AtmCapacityGroupSummary; [key: string]: unknown }>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.updateCapacityGroup,
        input
      );
    },

    getTicketAvailability(input: AtmTicketAvailabilityParams) {
      return callQuery<AtmTicketAvailability>(
        brokerUrl,
        ATM_XRPC_METHODS.tickets.getTicketAvailability,
        {
          environment: input.environment,
          eventId: input.eventId,
          eventUri: input.eventUri,
        }
      );
    },

    createTicketHold(input: AtmTicketHoldInput) {
      return callJson<AtmTicketHoldResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.createTicketHold,
        createTicketHoldBody(input)
      );
    },

    releaseTicketHold(input: AtmReleaseTicketHoldInput) {
      return callJson<AtmReleaseTicketHoldResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.releaseTicketHold,
        input
      );
    },

    claimFreeTicket(input: AtmFreeTicketClaimInput) {
      return callJson<AtmFreeTicketClaimResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.claimFreeTicket,
        createFreeTicketClaimBody(input)
      );
    },

    listBuyerTickets(input: AtmListBuyerTicketsParams) {
      return callQuery<AtmListTicketsResult>(
        brokerUrl,
        ATM_XRPC_METHODS.tickets.listBuyerTickets,
        input
      );
    },

    listOrganizerTickets(input: AtmListOrganizerTicketsParams) {
      return callQuery<AtmListTicketsResult>(
        brokerUrl,
        ATM_XRPC_METHODS.tickets.listOrganizerTickets,
        input
      );
    },

    verifyTicket(input: AtmVerifyTicketInput) {
      return callJson<AtmVerifyTicketResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.verifyTicket,
        input
      );
    },

    checkInTicket(input: AtmTicketCheckInInput) {
      return callJson<AtmTicketCheckInResult>(
        brokerUrl,
        "POST",
        ATM_XRPC_METHODS.tickets.checkInTicket,
        input
      );
    },

    getProfile(actor: string) {
      return callQuery<AtmProfile>(
        appViewUrl,
        ATM_XRPC_METHODS.actor.getProfile,
        { actor }
      );
    },
  };
}

async function readAtmJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String((json as { message: unknown }).message)
        : `ATM request failed with ${res.status}`;
    const error =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : "AtmRequestFailed";
    throw new AtmApiError(error, message, res.status, json);
  }
  return json as T;
}

type AtmWebhookDeliveryOutcome =
  | { kind: "handled"; result: AtmWebhookHandlerResult }
  | { kind: "completed" }
  | { kind: "busy" };

async function processWebhookDelivery<
  TType extends AtmWebhookEventType | undefined,
>(
  options: AtmWebhookHandlerOptions<TType>,
  event: AtmWebhookHandlerEvent<TType>,
  context: { rawBody: string; request?: Request }
): Promise<AtmWebhookDeliveryOutcome> {
  const store = options.deliveryStore;
  let claimed = false;
  let claimId: string | null = null;

  if (store) {
    const claim = await store.claim(event.id, event);
    if (claim.status === "completed") return { kind: "completed" };
    if (claim.status === "busy") return { kind: "busy" };
    if (
      claim.status !== "claimed" ||
      typeof claim.claimId !== "string" ||
      claim.claimId.trim() === ""
    ) {
      throw new Error("ATM webhook delivery store returned an invalid claim result");
    }
    claimId = claim.claimId;
    claimed = true;
  }

  try {
    const result = await options.onEvent(event, context);
    const status = webhookHandlerResultStatus(result);
    if (store && claimed) {
      if (status >= 200 && status < 300) {
        await store.complete(event.id, claimId as string, event);
      } else {
        await store.release(
          event.id,
          claimId as string,
          event,
          new Error(`ATM webhook fulfillment returned HTTP ${status}`)
        );
      }
      claimed = false;
    }
    return { kind: "handled", result };
  } catch (error) {
    if (store && claimed) {
      try {
        await store.release(event.id, claimId as string, event, error);
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          "ATM webhook fulfillment and delivery-claim release both failed"
        );
      }
    }
    throw error;
  }
}

function webhookHandlerResultStatus(result: AtmWebhookHandlerResult): number {
  if (result instanceof Response) return result.status;
  return result?.status ?? 200;
}

function constructWebhookHandlerEvent<
  TType extends AtmWebhookEventType | undefined,
>(
  rawBody: string,
  headers: AtmWebhookHeaders,
  options: AtmWebhookHandlerOptions<TType>
): AtmWebhookHandlerEvent<TType> {
  if (options.expectedType) {
    return constructTypedAtmWebhookEvent({
      rawBody,
      headers,
      secret: options.secret,
      toleranceSeconds: options.toleranceSeconds,
      now: options.now,
      expectedType: options.expectedType,
    }) as AtmWebhookHandlerEvent<TType>;
  }
  return constructAtmWebhookEvent({
    rawBody,
    headers,
    secret: options.secret,
    toleranceSeconds: options.toleranceSeconds,
    now: options.now,
  }) as AtmWebhookHandlerEvent<TType>;
}

function requestHeaders(request: Request): AtmWebhookHeaders {
  return {
    signature: request.headers.get("atm-signature"),
    deliveryId: request.headers.get("atm-delivery-id"),
    event: request.headers.get("atm-event"),
    apiVersion: request.headers.get("atm-api-version"),
    environment: request.headers.get("atm-environment"),
  };
}

function expressHeaders(
  headers: AtmExpressLikeRequest["headers"]
): AtmWebhookHeaders {
  return {
    signature: singleHeader(headers["atm-signature"]),
    deliveryId: singleHeader(headers["atm-delivery-id"]),
    event: singleHeader(headers["atm-event"]),
    apiVersion: singleHeader(headers["atm-api-version"]),
    environment: singleHeader(headers["atm-environment"]),
  };
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function defaultExpressRawBody(request: AtmExpressLikeRequest): string | Buffer {
  if (typeof request.rawBody === "string" || Buffer.isBuffer(request.rawBody)) {
    return request.rawBody;
  }
  if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
    return request.body;
  }
  throw new AtmWebhookSignatureError(
    "Express webhook handler requires rawBody, string body, or getRawBody"
  );
}

function normalizeWebhookHandlerResult(
  result: AtmWebhookHandlerResult
): Response {
  if (result instanceof Response) return result;
  const normalized = normalizePlainWebhookHandlerResult(result);
  return jsonResponse(normalized.status, normalized.body, normalized.headers);
}

function normalizeWebhookErrorHandlerResult(
  result: AtmWebhookHandlerResult
): Response {
  const response = normalizeWebhookHandlerResult(result);
  if (!response.ok) return response;
  return jsonResponse(500, {
    error: "AtmWebhookHandlerFailed",
    message: "onError must return a non-2xx response so ATM can redrive",
  });
}

function normalizePlainWebhookHandlerResult(
  result: AtmWebhookHandlerResult
): { status: number; body: unknown; headers?: Record<string, string> } {
  if (!result) return { status: 200, body: { ok: true } };
  if (result instanceof Response) {
    const headers: Record<string, string> = {};
    result.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return {
      status: result.status,
      body: { ok: result.ok },
      headers,
    };
  }
  return {
    status: result.status ?? 200,
    body: result.body ?? { ok: true },
    headers: result.headers,
  };
}

function normalizePlainWebhookErrorHandlerResult(
  result: AtmWebhookHandlerResult
): { status: number; body: unknown; headers?: Record<string, string> } {
  const normalized = normalizePlainWebhookHandlerResult(result);
  if (normalized.status < 200 || normalized.status >= 300) return normalized;
  return {
    status: 500,
    body: {
      error: "AtmWebhookHandlerFailed",
      message: "onError must return a non-2xx response so ATM can redrive",
    },
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function sendExpressJson(
  response: AtmExpressLikeResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>
): void {
  for (const [name, value] of Object.entries(headers ?? {})) {
    response.setHeader?.(name, value);
  }
  response.status(status).json(body);
}

function defaultWebhookErrorResponse(error: unknown): Response {
  const normalized = defaultPlainWebhookError(error);
  return jsonResponse(normalized.status, normalized.body, normalized.headers);
}

function defaultPlainWebhookError(
  error: unknown
): { status: number; body: unknown; headers?: Record<string, string> } {
  if (error instanceof AtmWebhookSignatureError) {
    return {
      status: 400,
      body: { error: "AtmWebhookVerificationFailed", message: error.message },
    };
  }
  return {
    status: 500,
    body: { error: "AtmWebhookHandlerFailed", message: "Webhook handler failed" },
  };
}

export class AtmApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body: unknown;

  constructor(code: string, message: string, status: number, body: unknown) {
    super(message);
    this.name = "AtmApiError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export class AtmWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtmWebhookSignatureError";
  }
}

export class AtmXrpcReceiverAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtmXrpcReceiverAuthError";
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseAtmSignatureHeader(
  signature: string
): { timestamp: number; signatures: string[] } | null {
  const fields = new Map<string, string[]>();
  for (const piece of signature.split(/[,\s]+/)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) return null;
    const key = trimmed.slice(0, eq).toLowerCase();
    const value = trimmed.slice(eq + 1);
    const values = fields.get(key) ?? [];
    values.push(value);
    fields.set(key, values);
  }

  const timestampRaw = fields.get("t")?.[0];
  const signatures = fields.get("v1") ?? [];
  if (!timestampRaw || signatures.length === 0) return null;
  const timestamp = Number.parseInt(timestampRaw, 10);
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, signatures };
}

function parseAtmEventEnvelope<TData>(rawBody: string): AtmWebhookEnvelope<TData> {
  const parsed = safeJsonParse(rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AtmXrpcReceiverAuthError("ATM event receiver body is not a JSON object");
  }
  const event = parsed as Partial<AtmWebhookEnvelope<TData>>;
  if (typeof event.id !== "string" || !event.id) {
    throw new AtmXrpcReceiverAuthError("ATM event receiver body is missing id");
  }
  if (typeof event.type !== "string" || !event.type) {
    throw new AtmXrpcReceiverAuthError("ATM event receiver body is missing type");
  }
  if (typeof event.apiVersion !== "string" || !event.apiVersion) {
    throw new AtmXrpcReceiverAuthError("ATM event receiver body is missing apiVersion");
  }
  if (event.environment !== "test" && event.environment !== "live") {
    throw new AtmXrpcReceiverAuthError("ATM event receiver body has invalid environment");
  }
  if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) {
    throw new AtmXrpcReceiverAuthError("ATM event receiver body is missing data");
  }
  return event as AtmWebhookEnvelope<TData>;
}

function assertOptionalEventHeaders(
  event: AtmWebhookEnvelope<unknown>,
  headers: {
    deliveryId?: string | null | undefined;
    event?: string | null | undefined;
    apiVersion?: string | null | undefined;
    environment?: string | null | undefined;
  }
) {
  if (headers.deliveryId && event.id !== headers.deliveryId) {
    throw new AtmXrpcReceiverAuthError(
      "ATM event receiver delivery id does not match the body"
    );
  }
  if (headers.event && event.type !== headers.event) {
    throw new AtmXrpcReceiverAuthError(
      "ATM event receiver type does not match the body"
    );
  }
  if (headers.apiVersion && event.apiVersion !== headers.apiVersion) {
    throw new AtmXrpcReceiverAuthError(
      "ATM event receiver API version does not match the body"
    );
  }
  if (headers.environment && event.environment !== headers.environment) {
    throw new AtmXrpcReceiverAuthError(
      "ATM event receiver environment does not match the body"
    );
  }
}

function bearerToken(authorization: string | null | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function receiverAudience(appDid: string, serviceRef: string): string {
  const normalized = normalizeReceiverServiceRef(appDid, serviceRef);
  return `${appDid}${normalized}`;
}

function normalizeReceiverServiceRef(appDid: string, serviceRef: string): string {
  const trimmed = serviceRef.trim();
  if (!trimmed) {
    throw new AtmXrpcReceiverAuthError("XRPC receiver serviceRef is required");
  }
  if (trimmed.startsWith(`${appDid}#`)) {
    const fragment = trimmed.slice(appDid.length);
    if (fragment.length <= 1) {
      throw new AtmXrpcReceiverAuthError("XRPC receiver serviceRef is invalid");
    }
    return fragment;
  }
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 1) {
      throw new AtmXrpcReceiverAuthError("XRPC receiver serviceRef is invalid");
    }
    return trimmed;
  }
  if (trimmed.startsWith("did:")) {
    throw new AtmXrpcReceiverAuthError(
      "XRPC receiver serviceRef must belong to appDid"
    );
  }
  return `#${trimmed}`;
}

function assertDid(value: string, field: string) {
  if (!value.startsWith("did:")) {
    throw new Error(`${field} must be a DID`);
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeSecrets(value: string | readonly string[]): string[] {
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (inner !== undefined) out[key] = pruneUndefined(inner);
    }
    return out as T;
  }
  return value;
}
