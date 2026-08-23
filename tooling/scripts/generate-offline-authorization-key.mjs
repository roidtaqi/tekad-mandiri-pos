// @ts-check

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
if (!("privateKey" in pair)) {
  throw new Error("Expected an asymmetric ECDSA key pair.");
}

const [privateJwk, publicJwk] = await Promise.all([
  crypto.subtle.exportKey("jwk", pair.privateKey),
  crypto.subtle.exportKey("jwk", pair.publicKey),
]);
const keyId = `kastur-offline-${new Date().toISOString().slice(0, 10)}`;

process.stdout.write(
  `${JSON.stringify(
    {
      key_id: keyId,
      server_secret_bindings: {
        OFFLINE_AUTH_SIGNING_KEY_ID: keyId,
        OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK: JSON.stringify(privateJwk),
      },
      pos_public_build_values: {
        VITE_OFFLINE_AUTH_KEY_ID: keyId,
        VITE_OFFLINE_AUTH_PUBLIC_KEY_JWK: JSON.stringify(publicJwk),
      },
      warning:
        "Store server_secret_bindings only in the server secret manager; only pos_public_build_values may be exposed to the frontend build.",
    },
    null,
    2,
  )}\n`,
);
