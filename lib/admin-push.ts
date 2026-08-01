import "server-only";

import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type PushMessage = { title: string; body: string; url: string; tag: string };
type Subscription = { endpoint: string; p256dh: string; auth: string };

const b64url = (value: Buffer) => value.toString("base64url");
const fromB64url = (value: string) => Buffer.from(value, "base64url");

function hkdfExtract(salt: Buffer, ikm: Buffer) {
  return createHmac("sha256", salt).update(ikm).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  for (let counter = 1; output.length < length; counter += 1) {
    previous = createHmac("sha256", prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    output = Buffer.concat([output, previous]);
  }
  return output.subarray(0, length);
}

function createVapidToken(endpoint: string, publicKey: Buffer, privateKey: Buffer) {
  const origin = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(Buffer.from(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    sub: process.env.VAPID_SUBJECT ?? "mailto:admin@ingamepin.com",
  })));
  const x = publicKey.subarray(1, 33);
  const y = publicKey.subarray(33, 65);
  const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y), d: b64url(privateKey) }, format: "jwk" });
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

async function sendOne(subscription: Subscription, message: PushMessage) {
  const vapidPublic = fromB64url(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
  const vapidPrivate = fromB64url(process.env.VAPID_PRIVATE_KEY ?? "");
  if (vapidPublic.length !== 65 || vapidPrivate.length !== 32) throw new Error("VAPID keys are missing or invalid.");

  const clientPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);
  const server = createECDH("prime256v1");
  server.generateKeys();
  const serverPublic = server.getPublicKey();
  const sharedSecret = server.computeSecret(clientPublic);
  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientPublic, serverPublic]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const contentKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(message)), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4); recordSize.writeUInt32BE(4096);
  const body = Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, encrypted]);
  const token = createVapidToken(subscription.endpoint, vapidPublic, vapidPrivate);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${b64url(vapidPublic)}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body,
  });
}

export async function notifyAdminsByPush(eventKey: string, message: PushMessage) {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const admin = createAdminClient();
  const claim = await admin.from("admin_push_events").insert({ event_key: eventKey });
  if (claim.error) {
    if (claim.error.code !== "23505") console.error("Push event claim failed:", claim.error);
    return;
  }
  const result = await admin.from("admin_push_subscriptions").select("endpoint, p256dh, auth");
  if (result.error) return console.error("Push subscriptions load failed:", result.error);
  await Promise.all((result.data ?? []).map(async (subscription) => {
    try {
      const response = await sendOne(subscription, message);
      if (response.status === 404 || response.status === 410) {
        await admin.from("admin_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      } else if (!response.ok) console.error("Admin push rejected:", response.status);
    } catch (error) { console.error("Admin push failed:", error); }
  }));
}

