import type { BrainPackageManifest } from '@solyra/shared';
import { globalBus } from '../neurobus/index.js';

export type BrainLifecycleState = 'UNLOADED' | 'VALIDATED' | 'ACTIVE' | 'REJECTED';

export interface BrainLoaderStats {
  state: BrainLifecycleState;
  activePackage: string | null;
  version: string | null;
  loadedAt: number | null;
  totalLoaded: number;
  totalFailed: number;
  totalUnloaded: number;
  modulesCount: number;
}

export class BrainPackageLoader {
  private activeManifest: BrainPackageManifest | null = null;
  private currentState: BrainLifecycleState = 'UNLOADED';
  private readonly stats = {
    totalLoaded: 0,
    totalFailed: 0,
    totalUnloaded: 0,
    activePackageId: null as string | null,
    activeVersion: null as string | null,
    loadedAt: null as number | null,
    activeModulesCount: 0,
  };

  public validateManifest(manifest: BrainPackageManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest payload is required'] };
    }

    if (manifest.schemaVersion !== '1.0') {
      errors.push('schemaVersion must be "1.0"');
    }

    if (typeof manifest.brainId !== 'string' || manifest.brainId.trim().length === 0) {
      errors.push('brainId must be a non-empty string');
    }

    if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
      errors.push('version must be a non-empty string');
    } else {
      const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
      if (!semver.test(manifest.version) && manifest.version.trim().length > 0) {
        // Accept non-empty versions that are not strictly semver to stay compatible with runtime manifests.
      }
    }

    if (!manifest.runtimeConstraints || typeof manifest.runtimeConstraints !== 'object') {
      errors.push('runtimeConstraints is required');
    } else {
      const constraints = manifest.runtimeConstraints;
      const positiveNumbers: Array<[string, number]> = [
        ['maxMemoryBytes', constraints.maxMemoryBytes],
        ['maxExecutionTimeMs', constraints.maxExecutionTimeMs],
        ['boundedAstDepth', constraints.boundedAstDepth],
      ];

      for (const [name, value] of positiveNumbers) {
        if (!Number.isFinite(value) || value <= 0) {
          errors.push(`${name} must be a positive number`);
        }
      }
    }

    if (!Array.isArray(manifest.modules)) {
      errors.push('modules must be an array');
    } else {
      const validTypes = new Set(['DSL_RULESET', 'INDEX_LOOKUP', 'HEURISTIC', 'GRAMMAR']);
      for (const module of manifest.modules) {
        if (!module || typeof module !== 'object') {
          errors.push('Each module reference must be an object');
          continue;
        }

        if (typeof module.name !== 'string' || module.name.trim().length === 0) {
          errors.push('Each module name must be a non-empty string');
        }

        if (typeof module.entryPoint !== 'string' || module.entryPoint.trim().length === 0) {
          errors.push(`Module ${module.name ?? '<unknown>'} has an invalid entryPoint`);
        }

        if (typeof module.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(module.sha256)) {
          errors.push(`Module ${module.name ?? '<unknown>'} has an invalid sha256 checksum`);
        }

        if (!validTypes.has(module.moduleType)) {
          errors.push(`Module ${module.name ?? '<unknown>'} has an invalid moduleType`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public loadPackage(manifest: BrainPackageManifest): boolean {
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      this.stats.totalFailed++;
      this.currentState = this.activeManifest ? 'ACTIVE' : 'REJECTED';
      globalBus.emit('brain:validation_failed', {
        brainId: manifest?.brainId ?? 'unknown',
        version: manifest?.version ?? 'unknown',
        errors: validation.errors,
        timestamp: Date.now(),
      });
      return false;
    }

    if (this.activeManifest) {
      globalBus.emit('brain:package_unloaded', {
        brainId: this.activeManifest.brainId,
        version: this.activeManifest.version,
        timestamp: Date.now(),
      });
    }

    this.activeManifest = manifest;
    this.currentState = 'ACTIVE';
    this.stats.totalLoaded++;
    this.stats.activePackageId = manifest.brainId;
    this.stats.activeVersion = manifest.version;
    this.stats.loadedAt = Date.now();
    this.stats.activeModulesCount = manifest.modules.length;

    globalBus.emit('brain:package_loaded', {
      brainId: manifest.brainId,
      version: manifest.version,
      moduleCount: manifest.modules.length,
      timestamp: Date.now(),
    });

    return true;
  }

  public unloadPackage(): boolean {
    if (!this.activeManifest) {
      return false;
    }

    const previous = this.activeManifest;
    globalBus.emit('brain:package_unloaded', {
      brainId: previous.brainId,
      version: previous.version,
      timestamp: Date.now(),
    });

    this.stats.totalUnloaded++;
    this.stats.activePackageId = null;
    this.stats.activeVersion = null;
    this.stats.loadedAt = null;
    this.stats.activeModulesCount = 0;
    this.activeManifest = null;
    this.currentState = 'UNLOADED';

    return true;
  }

  public getActivePackage(): BrainPackageManifest | null {
    if (!this.activeManifest) {
      return null;
    }

    return {
      ...this.activeManifest,
      runtimeConstraints: { ...this.activeManifest.runtimeConstraints },
      modules: this.activeManifest.modules.map((module) => ({ ...module })),
    };
  }

  public getLifecycleState(): BrainLifecycleState {
    return this.currentState;
  }

  public getLoaderStats(): BrainLoaderStats {
    return {
      state: this.currentState,
      activePackage: this.stats.activePackageId,
      version: this.stats.activeVersion,
      loadedAt: this.stats.loadedAt,
      totalLoaded: this.stats.totalLoaded,
      totalFailed: this.stats.totalFailed,
      totalUnloaded: this.stats.totalUnloaded,
      modulesCount: this.stats.activeModulesCount,
    };
  }
}
