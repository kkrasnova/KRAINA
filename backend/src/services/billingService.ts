import { JWT } from 'google-auth-library';
import { billingConfig } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
import { pool } from '../db/pool.js';
import type { BillingVerifyInput } from '../schemas/billing.schemas.js';
import type { SubscriptionDTO } from './profileService.js';

const APPLE_PROD = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

type ParsedApple = {
  productId: string;
  expiresAt: Date;
  originalTransactionId: string;
  paymentProvider: 'apple';
};

type ParsedGoogle = {
  productId: string;
  expiresAt: Date;
  orderId: string;
  paymentProvider: 'google';
};

function skuSets() {
  const apple = {
    explorer: new Set(billingConfig.appleSkuExplorer),
    pro: new Set(billingConfig.appleSkuPro),
    family: new Set(billingConfig.appleSkuFamily),
  };
  const google = {
    explorer: new Set(billingConfig.googleSkuExplorer),
    pro: new Set(billingConfig.googleSkuPro),
    family: new Set(billingConfig.googleSkuFamily),
  };
  return { apple, google };
}

function planTypeFromProductId(
  productId: string,
  platform: 'apple' | 'google',
): 'explorer' | 'pro' | 'family' {
  const { apple, google } = skuSets();
  const m = platform === 'apple' ? apple : google;
  if (m.explorer.has(productId)) return 'explorer';
  if (m.family.has(productId)) return 'family';
  if (m.pro.has(productId)) return 'pro';
  throw new HttpError(400, 'unknown_product_id');
}

function assertBillingSkusConfigured(platform: 'apple' | 'google'): void {
  const { apple, google } = skuSets();
  const s = platform === 'apple' ? apple : google;
  const any =
    s.explorer.size + s.pro.size + s.family.size > 0;
  if (!any) {
    throw new HttpError(503, 'billing_sku_not_configured');
  }
}

async function postAppleVerify(
  url: string,
  receiptBase64: string,
  password: string,
): Promise<{ status: number; latest_receipt_info?: unknown[]; [k: string]: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptBase64,
      password,
      'exclude-old-transactions': true,
    }),
  });
  if (!res.ok) {
    throw new HttpError(502, 'apple_verify_http_error');
  }
  return (await res.json()) as { status: number; latest_receipt_info?: unknown[] };
}

function parseAppleLatestReceipt(
  rows: unknown[],
  hintProductId: string | undefined,
): ParsedApple {
  type Row = {
    product_id?: string;
    expires_date_ms?: string;
    original_transaction_id?: string;
    cancellation_date_ms?: string;
  };
  const list = (rows || []).filter(Boolean) as Row[];
  const now = Date.now();
  const active = list.filter((r) => {
    if (!r.product_id || !r.expires_date_ms) return false;
    if (r.cancellation_date_ms) return false;
    const exp = Number(r.expires_date_ms);
    return Number.isFinite(exp) && exp > now;
  });
  if (!active.length) {
    throw new HttpError(400, 'apple_subscription_not_active');
  }
  let pick: Row | undefined;
  if (hintProductId) {
    const hinted = active.filter((r) => r.product_id === hintProductId);
    pick = hinted.sort(
      (a, b) => Number(b.expires_date_ms || 0) - Number(a.expires_date_ms || 0),
    )[0];
  }
  if (!pick) {
    pick = active.sort(
      (a, b) => Number(b.expires_date_ms || 0) - Number(a.expires_date_ms || 0),
    )[0];
  }
  const productId = String(pick.product_id);
  const expMs = Number(pick.expires_date_ms);
  const oti = String(pick.original_transaction_id || '');
  if (!oti) throw new HttpError(400, 'apple_receipt_invalid');
  return {
    productId,
    expiresAt: new Date(expMs),
    originalTransactionId: oti,
    paymentProvider: 'apple',
  };
}

export async function verifyAppleReceipt(
  receiptBase64: string,
  hintProductId: string | undefined,
): Promise<ParsedApple> {
  const secret = billingConfig.appleSharedSecret;
  if (!secret) {
    throw new HttpError(503, 'billing_apple_not_configured');
  }

  let data = await postAppleVerify(APPLE_PROD, receiptBase64, secret);
  if (data.status === 21007) {
    data = await postAppleVerify(APPLE_SANDBOX, receiptBase64, secret);
  }
  if (data.status !== 0) {
    throw new HttpError(400, 'apple_receipt_invalid');
  }
  const latest = data.latest_receipt_info;
  if (!Array.isArray(latest) || !latest.length) {
    throw new HttpError(400, 'apple_receipt_empty');
  }
  return parseAppleLatestReceipt(latest, hintProductId);
}

async function googlePublisherAccessToken(): Promise<string> {
  const raw = billingConfig.googlePlayServiceAccountJson;
  if (!raw) {
    throw new HttpError(503, 'billing_google_not_configured');
  }
  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(raw) as { client_email: string; private_key: string };
  } catch {
    throw new HttpError(503, 'billing_google_bad_json');
  }
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const creds = await client.authorize().catch(() => null);
  const token = creds?.access_token;
  if (!token) {
    throw new HttpError(503, 'billing_google_auth_failed');
  }
  return token;
}

export async function verifyGoogleSubscription(
  productId: string,
  purchaseToken: string,
): Promise<ParsedGoogle> {
  const pkg = billingConfig.googlePlayPackageName;
  if (!pkg) {
    throw new HttpError(503, 'billing_google_package_not_configured');
  }

  const accessToken = await googlePublisherAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    pkg,
  )}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
    purchaseToken,
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) {
    throw new HttpError(400, 'google_purchase_not_found');
  }
  if (!res.ok) {
    throw new HttpError(502, 'google_verify_http_error');
  }
  const body = (await res.json()) as {
    expiryTimeMillis?: string;
    orderId?: string;
  };
  const expMs = Number(body.expiryTimeMillis);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) {
    throw new HttpError(400, 'google_subscription_not_active');
  }
  const orderId = String(body.orderId || purchaseToken).slice(0, 512);
  return {
    productId,
    expiresAt: new Date(expMs),
    orderId,
    paymentProvider: 'google',
  };
}

async function upsertUserSubscription(
  userId: string,
  params: {
    planType: 'explorer' | 'pro' | 'family';
    expiresAt: Date;
    paymentProvider: 'apple' | 'google';
    externalId: string;
  },
): Promise<SubscriptionDTO> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE subscriptions SET is_active = false WHERE user_id = $1`, [userId]);
    await client.query(
      `INSERT INTO subscriptions (user_id, plan_type, billing_period, price_usd, starts_at, expires_at, is_active, payment_provider, external_id)
       VALUES ($1, $2, 'monthly', NULL, now(), $3, true, $4, $5)`,
      [userId, params.planType, params.expiresAt.toISOString(), params.paymentProvider, params.externalId],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  const r = await pool.query(
    `SELECT plan_type, billing_period, is_active, expires_at, payment_provider
     FROM subscriptions
     WHERE user_id = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY starts_at DESC
     LIMIT 1`,
    [userId],
  );
  if (!r.rowCount) {
    throw new HttpError(500, 'billing_persist_failed');
  }
  const row = r.rows[0] as {
    plan_type: string;
    billing_period: string | null;
    is_active: boolean;
    expires_at: string | null;
    payment_provider: string | null;
  };
  return {
    plan_type: row.plan_type,
    billing_period: row.billing_period,
    is_active: row.is_active,
    expires_at: row.expires_at,
    payment_provider: row.payment_provider,
  };
}

export async function verifyAndSaveSubscription(
  userId: string,
  body: BillingVerifyInput,
): Promise<{ subscription: SubscriptionDTO }> {
  if (body.platform === 'ios') {
    assertBillingSkusConfigured('apple');
    const receipt = body.appReceiptBase64!;
    const parsed = await verifyAppleReceipt(receipt, body.productId);
    const planType = planTypeFromProductId(parsed.productId, 'apple');
    const subscription = await upsertUserSubscription(userId, {
      planType,
      expiresAt: parsed.expiresAt,
      paymentProvider: 'apple',
      externalId: `apple:${parsed.originalTransactionId}`,
    });
    return { subscription };
  }

  assertBillingSkusConfigured('google');
  const parsed = await verifyGoogleSubscription(body.productId!, body.purchaseToken!);
  const planType = planTypeFromProductId(parsed.productId, 'google');
  const subscription = await upsertUserSubscription(userId, {
    planType,
    expiresAt: parsed.expiresAt,
    paymentProvider: 'google',
    externalId: `google:${parsed.orderId}`,
  });
  return { subscription };
}
