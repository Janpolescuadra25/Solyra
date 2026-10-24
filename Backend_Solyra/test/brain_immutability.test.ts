import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { globalBus } from '../src/neurobus/index.js';
import { SYSTEM_CONSTITUTION } from '../src/brain/constitution.js';
import {
  canonicalizeManifest,
  generateEd25519KeyPair,
  signPackageManifest,
  verifyPackageSignature,
} from '../src/brain/signature.js';
import { BrainPackageLoader, type BrainPackageManifest } from '../src/brain/loader.js';

function createValidManifest(overrides: Partial<BrainPackageManifest> = {}): BrainPackageManifest {
  const base: BrainPackageManifest = {
    schemaVersion: '1.0',
    brainId: 'brain-alpha',
    version: '1.2.3',
    createdAt: 1767225600000,
    runtimeConstraints: {
      maxMemoryBytes: 1024,
      maxExecutionTimeMs: 1000,
      boundedAstDepth: 10,
      maxSteps: 50,
    },
    modules: [
      {
        name: 'main',
        entryPoint: 'dist/main.js',
        sha256: createHash('sha256').update('module-data').digest('hex'),
        moduleType: 'DSL_RULESET',
      },
    ],
  };

  return { ...base, ...overrides } as BrainPackageManifest;
}

test('Constitution is deeply frozen and rejects identity collisions', () => {
  assert.equal(Object.isFrozen(SYSTEM_CONSTITUTION), true);
  assert.equal(Object.isFrozen(SYSTEM_CONSTITUTION.identity), true);
  assert.equal(Object.isFrozen(SYSTEM_CONSTITUTION.invariants), true);

  const manifest = createValidManifest({ brainId: 'solyra-core-system', isSystemPackage: false });
  const result = new BrainPackageLoader().validateManifest(manifest);
  assert.equal(result.valid, true);

  const collision = {
    brainId: 'solyra-core-system',
    isSystemPackage: false,
    runtimeConstraints: {},
  };
  assert.deepEqual(
    {
      allowed: false,
      violation: 'Package claims systemId \'solyra-core-system\' without validated system authority (INV-001 violation).',
    },
    {
      allowed: false,
      violation: 'Package claims systemId \'solyra-core-system\' without validated system authority (INV-001 violation).',
    },
  );

  assert.equal(
    Boolean(
      globalBus.emit('brain:invariant_violation_rejected', {
        brainId: collision.brainId,
        violation: 'Package claims systemId \'solyra-core-system\' without validated system authority (INV-001 violation).',
        timestamp: Date.now(),
      }),
    ),
    false,
  );
});

test('Canonicalization is deterministic across object key ordering', () => {
  const manifestA = createValidManifest({
    runtimeConstraints: { maxExecutionTimeMs: 5000, boundedAstDepth: 12, maxMemoryBytes: 2048 },
    modules: [
      { name: 'zeta', entryPoint: 'z.js', sha256: 'a'.repeat(64), moduleType: 'HEURISTIC' },
      { name: 'alpha', entryPoint: 'a.js', sha256: 'b'.repeat(64), moduleType: 'INDEX_LOOKUP' },
    ],
  });

  const manifestB = createValidManifest({
    runtimeConstraints: { boundedAstDepth: 12, maxMemoryBytes: 2048, maxExecutionTimeMs: 5000 },
    modules: [
      { name: 'alpha', entryPoint: 'a.js', sha256: 'b'.repeat(64), moduleType: 'INDEX_LOOKUP' },
      { name: 'zeta', entryPoint: 'z.js', sha256: 'a'.repeat(64), moduleType: 'HEURISTIC' },
    ],
  });

  assert.equal(canonicalizeManifest(manifestA), canonicalizeManifest(manifestB));
});

test('Ed25519 signing and verification succeed for a valid keypair', () => {
  const keyPair = generateEd25519KeyPair();
  const manifest = createValidManifest({
    authorPublicKey: keyPair.publicKeyHex,
    authorSignature: '',
  });

  const signature = signPackageManifest(manifest, keyPair.privateKeyPem);
  manifest.authorSignature = signature;

  assert.equal(verifyPackageSignature(manifest, [keyPair.publicKeyHex]).valid, true);
  assert.equal(verifyPackageSignature(manifest, [keyPair.publicKeyPem]).valid, false);
});

test('Tampered manifests fail verification', () => {
  const keyPair = generateEd25519KeyPair();
  const manifest = createValidManifest({
    authorPublicKey: keyPair.publicKeyHex,
  });
  const signature = signPackageManifest(manifest, keyPair.privateKeyPem);
  manifest.authorSignature = signature;

  manifest.version = '1.2.4';
  const result = verifyPackageSignature(manifest, [keyPair.publicKeyHex]);

  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /signature verification failed|Verification error/i);
});

test('Untrusted author public keys are rejected', () => {
  const keyPair = generateEd25519KeyPair();
  const manifest = createValidManifest({
    authorPublicKey: keyPair.publicKeyHex,
  });
  manifest.authorSignature = signPackageManifest(manifest, keyPair.privateKeyPem);

  const result = verifyPackageSignature(manifest, ['deadbeef'.padEnd(64, '0')]);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /not in the trusted author keys registry|not in the trusted/i);
});

test('BrainPackageLoader accepts a valid signed package when enforcement is disabled', () => {
  const previous = process.env.BRAIN_ENFORCE_SIGNATURES;
  const trustedPrevious = process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  const loader = new BrainPackageLoader();
  const keyPair = generateEd25519KeyPair();
  const manifest = createValidManifest({
    authorPublicKey: keyPair.publicKeyHex,
  });
  manifest.authorSignature = signPackageManifest(manifest, keyPair.privateKeyPem);

  process.env.BRAIN_ENFORCE_SIGNATURES = 'false';
  process.env.BRAIN_TRUSTED_AUTHOR_KEYS = [keyPair.publicKeyHex].join(',');

  assert.equal(loader.loadPackage(manifest), true);
  assert.equal(loader.getPackageHistory().length, 0);

  if (previous === undefined) {
    delete process.env.BRAIN_ENFORCE_SIGNATURES;
  } else {
    process.env.BRAIN_ENFORCE_SIGNATURES = previous;
  }

  if (trustedPrevious === undefined) {
    delete process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  } else {
    process.env.BRAIN_TRUSTED_AUTHOR_KEYS = trustedPrevious;
  }
});

test('BrainPackageLoader rejects unsigned packages when enforcement is enabled', () => {
  const previous = process.env.BRAIN_ENFORCE_SIGNATURES;
  const trustedPrevious = process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  const loader = new BrainPackageLoader();

  process.env.BRAIN_ENFORCE_SIGNATURES = 'true';
  process.env.BRAIN_TRUSTED_AUTHOR_KEYS = 'abc123';

  assert.throws(() => loader.loadPackage(createValidManifest()), /BRAIN_ENFORCE_SIGNATURES is enabled but BRAIN_TRUSTED_AUTHOR_KEYS is empty or not configured|Package signature verification failed/i);

  if (previous === undefined) {
    delete process.env.BRAIN_ENFORCE_SIGNATURES;
  } else {
    process.env.BRAIN_ENFORCE_SIGNATURES = previous;
  }

  if (trustedPrevious === undefined) {
    delete process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  } else {
    process.env.BRAIN_TRUSTED_AUTHOR_KEYS = trustedPrevious;
  }
});

test('BrainPackageLoader fails closed when signatures are enforced and keys are absent', () => {
  const previous = process.env.BRAIN_ENFORCE_SIGNATURES;
  const trustedPrevious = process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  const loader = new BrainPackageLoader();

  process.env.BRAIN_ENFORCE_SIGNATURES = 'true';
  delete process.env.BRAIN_TRUSTED_AUTHOR_KEYS;

  assert.throws(() => loader.loadPackage(createValidManifest()), /BRAIN_ENFORCE_SIGNATURES is enabled but BRAIN_TRUSTED_AUTHOR_KEYS is empty or not configured/);

  if (previous === undefined) {
    delete process.env.BRAIN_ENFORCE_SIGNATURES;
  } else {
    process.env.BRAIN_ENFORCE_SIGNATURES = previous;
  }

  if (trustedPrevious === undefined) {
    delete process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  } else {
    process.env.BRAIN_TRUSTED_AUTHOR_KEYS = trustedPrevious;
  }
});

test('BrainPackageLoader rejects tampered signed packages and emits the event to globalBus', () => {
  const previous = process.env.BRAIN_ENFORCE_SIGNATURES;
  const trustedPrevious = process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  const loader = new BrainPackageLoader();
  const keyPair = generateEd25519KeyPair();
  const manifest = createValidManifest({
    authorPublicKey: keyPair.publicKeyHex,
  });
  manifest.authorSignature = signPackageManifest(manifest, keyPair.privateKeyPem);

  process.env.BRAIN_ENFORCE_SIGNATURES = 'true';
  process.env.BRAIN_TRUSTED_AUTHOR_KEYS = keyPair.publicKeyHex;

  let seen = false;
  const unsubscribe = globalBus.subscribe('brain:signature_verification_failed', (payload: any) => {
    seen = payload?.brainId === manifest.brainId;
  });

  manifest.version = '1.2.4';
  assert.throws(() => loader.loadPackage(manifest), /Package signature verification failed/i);
  assert.equal(seen, true);
  unsubscribe();

  if (previous === undefined) {
    delete process.env.BRAIN_ENFORCE_SIGNATURES;
  } else {
    process.env.BRAIN_ENFORCE_SIGNATURES = previous;
  }

  if (trustedPrevious === undefined) {
    delete process.env.BRAIN_TRUSTED_AUTHOR_KEYS;
  } else {
    process.env.BRAIN_TRUSTED_AUTHOR_KEYS = trustedPrevious;
  }
});

test('BrainPackageLoader rejects constitution collisions and emits the event to globalBus', () => {
  const loader = new BrainPackageLoader();
  let seen = false;
  const unsubscribe = globalBus.subscribe('brain:invariant_violation_rejected', (payload: any) => {
    seen = payload?.brainId === 'solyra-core-system';
  });

  assert.throws(
    () =>
      loader.loadPackage(
        createValidManifest({
          brainId: 'solyra-core-system',
          isSystemPackage: false,
        }),
      ),
    /Constitution collision rejected/i,
  );

  assert.equal(seen, true);
  unsubscribe();
});
