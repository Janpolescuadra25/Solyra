/**
 * Solyra Brain Package Signature Verification (Step 10)
 * Native Ed25519 signing, verification, and canonical JSON serialization.
 * Zero external dependencies.
 */

import * as crypto from 'node:crypto';
import type { BrainModuleReference, BrainPackageManifest } from './loader.js';

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function canonicalizeManifest(manifest: BrainPackageManifest): string {
  const { authorSignature: _authorSignature, ...signable } = manifest;

  const sortedModules: BrainModuleReference[] = [...(signable.modules ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((module) => {
      const ref: BrainModuleReference = {
        name: module.name,
        entryPoint: module.entryPoint,
        sha256: module.sha256,
        moduleType: module.moduleType,
      };
      if (module.payload !== undefined) {
        ref.payload = sortValue(module.payload);
      }
      return ref;
    });

  const canonicalObject: Record<string, unknown> = {
    schemaVersion: signable.schemaVersion,
    brainId: signable.brainId,
    version: signable.version,
    createdAt: signable.createdAt,
    authorPublicKey: signable.authorPublicKey ?? '',
    isSystemPackage: Boolean(signable.isSystemPackage),
    runtimeConstraints: sortValue(signable.runtimeConstraints ?? {}),
    modules: sortedModules,
  };

  return JSON.stringify(sortValue(canonicalObject));
}

export interface KeyPairResult {
  publicKeyHex: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateEd25519KeyPair(): KeyPairResult {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublicKey = spkiDer.subarray(spkiDer.length - 32);
  const publicKeyHex = rawPublicKey.toString('hex');

  return { publicKeyHex, publicKeyPem, privateKeyPem };
}

function parsePublicKey(keyInput: string): crypto.KeyObject {
  const trimmed = keyInput.trim();
  if (trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) {
    return crypto.createPublicKey(trimmed);
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const rawKey = Buffer.from(trimmed, 'hex');
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const spkiDer = Buffer.concat([spkiPrefix, rawKey]);
    return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
  }

  throw new Error('Unsupported public key format. Expected SPKI PEM or 64-character hex string.');
}

export function signPackageManifest(
  manifest: BrainPackageManifest,
  privateKeyInput: string | crypto.KeyObject,
): string {
  const canonicalData = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const privateKey = typeof privateKeyInput === 'string'
    ? crypto.createPrivateKey(privateKeyInput)
    : privateKeyInput;

  return crypto.sign(null, canonicalData, privateKey).toString('hex');
}

export interface SignatureVerificationResult {
  valid: boolean;
  reason?: string;
}

export function verifyPackageSignature(
  manifest: BrainPackageManifest,
  trustedPublicKeys?: string[],
): SignatureVerificationResult {
  if (!manifest.authorSignature) {
    return { valid: false, reason: 'Manifest is missing authorSignature.' };
  }

  if (!manifest.authorPublicKey) {
    return { valid: false, reason: 'Manifest is missing authorPublicKey.' };
  }

  if (trustedPublicKeys && trustedPublicKeys.length > 0) {
    const normalizedKey = manifest.authorPublicKey.trim().toLowerCase();
    const isTrusted = trustedPublicKeys.some((key) => key.trim().toLowerCase() === normalizedKey);
    if (!isTrusted) {
      return {
        valid: false,
        reason: `Author public key '${manifest.authorPublicKey}' is not in the trusted author keys registry.`,
      };
    }
  }

  try {
    const publicKeyObject = parsePublicKey(manifest.authorPublicKey);
    const canonicalData = Buffer.from(canonicalizeManifest(manifest), 'utf8');
    const signatureBuffer = Buffer.from(manifest.authorSignature, 'hex');
    const isValid = crypto.verify(null, canonicalData, publicKeyObject, signatureBuffer);

    if (!isValid) {
      return {
        valid: false,
        reason: 'Cryptographic signature verification failed: signature does not match canonical payload.',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: `Verification error: ${(error as Error).message}`,
    };
  }
}
