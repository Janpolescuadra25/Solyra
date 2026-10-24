/**
 * Solyra Core Constitution & System Invariants (Step 10)
 * Deeply immutable definitions of system identity, executive authority,
 * and core safety invariants that cannot be superseded by dynamic packages.
 */

export interface SystemIdentity {
  readonly systemId: string;
  readonly name: string;
  readonly version: string;
  readonly role: string;
  readonly createdAt: number;
}

export interface CoreSafetyInvariant {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: 'CRITICAL';
  readonly protectedScope: readonly string[];
}

export interface SystemConstitution {
  readonly identity: SystemIdentity;
  readonly invariants: readonly CoreSafetyInvariant[];
}

const RAW_IDENTITY: SystemIdentity = {
  systemId: 'solyra-core-system',
  name: 'Solyra Autonomous Kernel',
  version: '1.0.0',
  role: 'root_executive',
  createdAt: 1767225600000,
};

const RAW_INVARIANTS: readonly CoreSafetyInvariant[] = [
  Object.freeze({
    id: 'INV-001',
    name: 'Kernel Identity Immutability',
    description: 'Dynamic packages cannot impersonate or overwrite the root executive identity or systemId.',
    severity: 'CRITICAL',
    protectedScope: Object.freeze(['systemId', 'name', 'version', 'role']),
  }),
  Object.freeze({
    id: 'INV-002',
    name: 'Author Trust Boundary',
    description: 'System packages and elevated runtime permissions strictly require trusted cryptographic verification.',
    severity: 'CRITICAL',
    protectedScope: Object.freeze(['isSystemPackage', 'runtimeConstraints.elevated']),
  }),
  Object.freeze({
    id: 'INV-003',
    name: 'Core State Preservation',
    description: 'Dynamic packages cannot mutate or circumvent foundational state management tiers or constitution.',
    severity: 'CRITICAL',
    protectedScope: Object.freeze(['constitution', 'systemTier']),
  }),
];

export const SYSTEM_CONSTITUTION: SystemConstitution = Object.freeze({
  identity: Object.freeze(RAW_IDENTITY),
  invariants: Object.freeze(RAW_INVARIANTS),
});

export interface ConstitutionValidationResult {
  allowed: boolean;
  violation?: string;
}

export function validateConstitutionCollision(manifest: {
  brainId: string;
  isSystemPackage?: boolean;
  runtimeConstraints?: Record<string, unknown>;
}): ConstitutionValidationResult {
  if (manifest.brainId === SYSTEM_CONSTITUTION.identity.systemId && !manifest.isSystemPackage) {
    return {
      allowed: false,
      violation: `Package claims systemId '${SYSTEM_CONSTITUTION.identity.systemId}' without validated system authority (INV-001 violation).`,
    };
  }

  if (manifest.isSystemPackage && manifest.brainId !== SYSTEM_CONSTITUTION.identity.systemId) {
    if (manifest.runtimeConstraints?.overrideConstitution === true) {
      return {
        allowed: false,
        violation: 'System package cannot override immutable core constitution (INV-003 violation).',
      };
    }
  }

  return { allowed: true };
}
