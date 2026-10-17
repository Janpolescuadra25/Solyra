import { createHash } from 'node:crypto';
import type { AstValidationResult } from '@solyra/shared';
import { evaluateAstProgram, validateBoundedAstProgram } from '../ast/index.js';
import { globalBus } from '../neurobus/index.js';

export interface BrainRuntimeConstraints {
  maxMemoryBytes?: number;
  maxMemoryMb?: number;
  maxExecutionTimeMs?: number;
  boundedAstDepth?: number;
  maxSteps?: number;
  allowedExternalCalls?: string[];
}

export interface BrainModuleReference {
  name: string;
  entryPoint: string;
  sha256: string;
  moduleType: 'DSL_RULESET' | 'INDEX_LOOKUP' | 'HEURISTIC' | 'GRAMMAR';
  payload?: unknown;
}

export interface BrainPackageManifest {
  schemaVersion: '1.0';
  brainId: string;
  version: string;
  authorSignature?: string;
  createdAt: number;
  runtimeConstraints: BrainRuntimeConstraints;
  modules: BrainModuleReference[];
}

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

  public validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest payload is required'] };
    }

    const pkg = manifest as Record<string, unknown>;

    if (pkg.schemaVersion !== '1.0') {
      errors.push('schemaVersion must be "1.0"');
    }

    if (typeof pkg.brainId !== 'string' || pkg.brainId.trim().length === 0) {
      errors.push('brainId must be a non-empty string');
    }

    if (typeof pkg.version !== 'string' || pkg.version.trim().length === 0) {
      errors.push('version must be a non-empty string');
    } else {
      const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
      if (!semver.test(pkg.version) && pkg.version.trim().length > 0) {
        // Accept non-empty versions that are not strictly semver to stay compatible with runtime manifests.
      }
    }

    const runtimeConstraints = pkg.runtimeConstraints;
    if (!runtimeConstraints || typeof runtimeConstraints !== 'object') {
      errors.push('runtimeConstraints is required');
    } else {
      const constraints = runtimeConstraints as Record<string, unknown>;
      const positiveNumbers: Array<[string, unknown]> = [
        ['maxMemoryBytes', constraints.maxMemoryBytes ?? constraints.maxMemoryMb],
        ['maxExecutionTimeMs', constraints.maxExecutionTimeMs],
        ['boundedAstDepth', constraints.boundedAstDepth],
      ];

      for (const [name, value] of positiveNumbers) {
        if (value === undefined) {
          continue;
        }
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(`${name} must be a positive number`);
        }
      }

      if (constraints.maxSteps !== undefined) {
        const maxSteps = constraints.maxSteps;
        if (typeof maxSteps !== 'number' || !Number.isInteger(maxSteps) || maxSteps <= 0) {
          errors.push('runtimeConstraints.maxSteps must be a positive integer');
        }
      }
    }

    if (!Array.isArray(pkg.modules)) {
      errors.push('modules must be an array');
    } else {
      const validTypes = new Set(['DSL_RULESET', 'INDEX_LOOKUP', 'HEURISTIC', 'GRAMMAR']);
      for (const module of pkg.modules) {
        if (!module || typeof module !== 'object') {
          errors.push('Each module reference must be an object');
          continue;
        }

        const mod = module as Record<string, unknown>;
        if (typeof mod.name !== 'string' || mod.name.trim().length === 0) {
          errors.push('Each module name must be a non-empty string');
        }

        if (typeof mod.entryPoint !== 'string' || mod.entryPoint.trim().length === 0) {
          errors.push(`Module ${String(mod.name ?? '<unknown>')} has an invalid entryPoint`);
        }

        if (typeof mod.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(mod.sha256)) {
          errors.push(`Module ${String(mod.name ?? '<unknown>')} has an invalid sha256 checksum`);
        }

        if (!validTypes.has(String(mod.moduleType))) {
          errors.push(`Module ${String(mod.name ?? '<unknown>')} has an invalid moduleType`);
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

  public async executeModuleAst(
    moduleId: string,
    inputPayload: Record<string, unknown> = {},
    contextOverrides: Record<string, unknown> = {},
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    metrics: {
      executionTimeMs: number;
      stepsExecuted: number;
    };
  }> {
    if (!this.activeManifest) {
      throw new Error('No active brain package loaded');
    }

    const activeModule = this.activeManifest.modules.find((module) => module.name === moduleId);
    if (!activeModule) {
      throw new Error(`Module '${moduleId}' not found in active package`);
    }

    const rawPayload = ((activeModule as unknown) as Record<string, unknown>).payload;
    if (rawPayload === undefined || rawPayload === null) {
      throw new Error(`Module '${moduleId}' does not contain an executable AST`);
    }

    const validation = this.extractAndValidateAst(moduleId, rawPayload);
    if (!validation.valid) {
      const message = validation.errors
        .map((entry) => typeof entry === 'string' ? entry : entry.message)
        .join('; ');
      throw new Error(message || `Module '${moduleId}' does not contain an executable AST`);
    }

    const timeoutMs = this.activeManifest.runtimeConstraints?.maxExecutionTimeMs ?? 5000;
    const maxSteps = this.activeManifest.runtimeConstraints?.maxSteps ?? 1000;
    const executionContext = { ...inputPayload, ...contextOverrides };

    try {
      const result = evaluateAstProgram(rawPayload as any, executionContext, {
        timeoutMs,
        maxSteps,
      });

      if (!result.success) {
        globalBus.emit('brain:sandbox_violation', {
          packageId: this.activeManifest.brainId,
          moduleId,
          reason: result.error ?? 'Sandbox violation',
          executionTimeMs: result.executionTimeMs ?? 0,
          stepsExecuted: result.stepsExecuted ?? 0,
          success: false,
          timestamp: Date.now(),
        });

        return {
          success: false,
          error: result.error,
          metrics: {
            executionTimeMs: result.executionTimeMs ?? 0,
            stepsExecuted: result.stepsExecuted ?? 0,
          },
        };
      }

      globalBus.emit('brain:execution_completed', {
        packageId: this.activeManifest.brainId,
        moduleId,
        executionTimeMs: result.executionTimeMs ?? 0,
        stepsExecuted: result.stepsExecuted ?? 0,
        success: true,
        timestamp: Date.now(),
      });

      return {
        success: true,
        result: result.result,
        metrics: {
          executionTimeMs: result.executionTimeMs ?? 0,
          stepsExecuted: result.stepsExecuted ?? 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime execution error';
      globalBus.emit('brain:sandbox_violation', {
        packageId: this.activeManifest.brainId,
        moduleId,
        reason: message,
        executionTimeMs: 0,
        stepsExecuted: 0,
        success: false,
        timestamp: Date.now(),
      });

      return {
        success: false,
        error: message,
        metrics: {
          executionTimeMs: 0,
          stepsExecuted: 0,
        },
      };
    }
  }

  public verifyModuleContent(
    moduleName: string,
    content: Buffer | string
  ): { valid: boolean; error?: string } {
    if (!this.activeManifest) {
      throw new Error('No active package to verify module against');
    }

    const mod = this.activeManifest.modules.find((m) => m.name === moduleName);
    if (!mod) {
      throw new Error(`Module ${moduleName} not found in active package manifest`);
    }

    const hash = createHash('sha256');
    if (typeof content === 'string') {
      hash.update(content, 'utf8');
    } else {
      hash.update(content);
    }
    const actualHash = hash.digest('hex').toLowerCase();
    const expectedHash = (mod.sha256 || '').toLowerCase();

    if (actualHash === expectedHash) {
      return { valid: true };
    }

    globalBus.emit('brain:module_hash_mismatch', {
      brainId: this.activeManifest.brainId,
      moduleName,
      expected: expectedHash,
      actual: actualHash,
      timestamp: Date.now(),
    });

    return {
      valid: false,
      error: `Hash mismatch for module ${moduleName}: expected ${expectedHash}, got ${actualHash}`,
    };
  }

  /**
   * Extracts and validates an AST program for a specified package module.
   * Enforces DSL_RULESET module type, parses serialized input if provided,
   * and validates AST structural integrity against package runtimeConstraints.boundedAstDepth.
   * Emits 'brain:ast_validation_failed' on globalBus if validation fails.
   *
   * @param moduleName - The name of the module in the active package manifest
   * @param astProgram - Raw AST object, JSON string, or Buffer containing serialized AST
   * @returns AstValidationResult indicating validity and error details
   */
  public extractAndValidateAst(moduleName: string, astProgram: unknown): AstValidationResult {
    if (!this.activeManifest) {
      throw new Error('Cannot extract and validate AST: No active package loaded');
    }

    const mod = this.activeManifest.modules.find((m) => m.name === moduleName);
    if (!mod) {
      throw new Error(`Module '${moduleName}' not found in active package manifest`);
    }

    if (mod.moduleType !== 'DSL_RULESET') {
      const message = `Module '${moduleName}' is not of type DSL_RULESET (found: ${mod.moduleType})`;
      globalBus.emit('brain:ast_validation_failed', {
        moduleName,
        errors: [message],
        timestamp: Date.now(),
      });
      return {
        valid: false,
        errors: [{
          path: 'module',
          code: 'INVALID_MODULE_TYPE',
          message,
        }],
      };
    }

    let parsedAst = astProgram;
    if (typeof astProgram === 'string' || Buffer.isBuffer(astProgram)) {
      try {
        const rawStr = typeof astProgram === 'string' ? astProgram : astProgram.toString('utf-8');
        parsedAst = JSON.parse(rawStr);
      } catch (err) {
        const parseError = `Failed to parse AST JSON: ${(err as Error).message}`;
        globalBus.emit('brain:ast_validation_failed', {
          moduleName,
          errors: [parseError],
          timestamp: Date.now(),
        });
        return {
          valid: false,
          errors: [{
            path: 'root',
            code: 'INVALID_AST_JSON',
            message: parseError,
          }],
        };
      }
    }

    const maxDepth = this.activeManifest.runtimeConstraints?.boundedAstDepth ?? 10;
    const normalizedAst = (parsedAst && typeof parsedAst === 'object')
      ? { ...parsedAst, maxDepth }
      : parsedAst;

    const result = validateBoundedAstProgram(normalizedAst, { maxDepth });

    if (!result.valid) {
      globalBus.emit('brain:ast_validation_failed', {
        moduleName,
        errors: result.errors.map((entry) => typeof entry === 'string' ? entry : entry.message),
        timestamp: Date.now(),
      });
    }

    return result;
  }
}
