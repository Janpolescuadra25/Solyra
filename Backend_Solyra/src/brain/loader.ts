import { createHash } from 'node:crypto';
import type { AstExecutionResult, AstNode, AstValidationResult } from '@solyra/shared';
import { evaluateAstProgram, evaluateStreamingAstProgram, validateBoundedAstProgram } from '../ast/index.js';
import { globalBus } from '../neurobus/index.js';
import { DiskStorageEngine } from '../persistence/disk/disk-storage.js';

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
  private packageHistory: BrainPackageManifest[] = [];
  private maxHistoryLength = 20;
  private currentState: BrainLifecycleState = 'UNLOADED';
  private readonly diskStorage: DiskStorageEngine;
  private readonly stats = {
    totalLoaded: 0,
    totalFailed: 0,
    totalUnloaded: 0,
    activePackageId: null as string | null,
    activeVersion: null as string | null,
    loadedAt: null as number | null,
    activeModulesCount: 0,
  };

  constructor(options?: { maxHistoryLength?: number }, diskStorage?: DiskStorageEngine) {
    if (options?.maxHistoryLength && Number.isInteger(options.maxHistoryLength) && options.maxHistoryLength > 0) {
      this.maxHistoryLength = options.maxHistoryLength;
    }
    this.diskStorage = diskStorage ?? new DiskStorageEngine();
  }

  private cloneManifest(manifest: BrainPackageManifest): BrainPackageManifest {
    return JSON.parse(JSON.stringify(manifest)) as BrainPackageManifest;
  }

  private updateActiveStats(manifest: BrainPackageManifest | null): void {
    if (!manifest) {
      this.stats.activePackageId = null;
      this.stats.activeVersion = null;
      this.stats.loadedAt = null;
      this.stats.activeModulesCount = 0;
      return;
    }

    this.stats.activePackageId = manifest.brainId;
    this.stats.activeVersion = manifest.version;
    this.stats.loadedAt = Date.now();
    this.stats.activeModulesCount = manifest.modules.length;
  }

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
    globalBus.emit('brain:load_initiated', {
      packageId: manifest?.brainId ?? 'unknown',
      version: manifest?.version ?? 'unknown',
      timestamp: new Date().toISOString(),
    });

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
      this.packageHistory.unshift(this.cloneManifest(this.activeManifest));
      if (this.packageHistory.length > this.maxHistoryLength) {
        this.packageHistory = this.packageHistory.slice(0, this.maxHistoryLength);
      }
      globalBus.emit('brain:package_unloaded', {
        brainId: this.activeManifest.brainId,
        version: this.activeManifest.version,
        timestamp: Date.now(),
      });
    }

    this.activeManifest = this.cloneManifest(manifest);
    this.currentState = 'ACTIVE';
    this.stats.totalLoaded++;
    this.updateActiveStats(this.activeManifest);

    globalBus.emit('brain:package_loaded', {
      brainId: this.activeManifest.brainId,
      version: this.activeManifest.version,
      moduleCount: this.activeManifest.modules.length,
      timestamp: Date.now(),
    });

    return true;
  }

  public getPackageHistory(): Array<{
    id: string;
    version: string;
    name: string;
    moduleCount: number;
    archivedAt?: string;
  }> {
    return this.packageHistory.map((manifest) => ({
      id: manifest.brainId,
      version: manifest.version,
      name: manifest.brainId,
      moduleCount: manifest.modules.length,
      archivedAt: new Date().toISOString(),
    }));
  }

  public rollbackPackage(): { success: boolean; error?: string; rolledBackTo?: { id: string; version: string } } {
    if (this.packageHistory.length === 0) {
      return { success: false, error: 'No previous package in history to rollback to' };
    }

    const currentPackage = this.activeManifest ? this.cloneManifest(this.activeManifest) : null;

    globalBus.emit('brain:package_rollback_initiated', {
      currentPackageId: currentPackage?.brainId ?? null,
      historyDepth: this.packageHistory.length,
      timestamp: Date.now(),
    });

    if (currentPackage) {
      globalBus.emit('brain:package_unloaded', {
        brainId: currentPackage.brainId,
        version: currentPackage.version,
        timestamp: Date.now(),
      });
    }

    const previousManifest = this.packageHistory.pop();
    if (!previousManifest) {
      return { success: false, error: 'No previous package in history to rollback to' };
    }

    this.activeManifest = this.cloneManifest(previousManifest);
    this.currentState = 'ACTIVE';
    this.stats.totalLoaded++;
    this.updateActiveStats(this.activeManifest);

    globalBus.emit('brain:package_rollback_completed', {
      rolledBackTo: { id: this.activeManifest.brainId, version: this.activeManifest.version },
      timestamp: Date.now(),
    });

    globalBus.emit('brain:package_loaded', {
      brainId: this.activeManifest.brainId,
      version: this.activeManifest.version,
      moduleCount: this.activeManifest.modules.length,
      timestamp: Date.now(),
    });

    return {
      success: true,
      rolledBackTo: { id: this.activeManifest.brainId, version: this.activeManifest.version },
    };
  }

  public activatePackage(id: string, version: string): { success: boolean; error?: string; message?: string; activated?: { id: string; version: string } } {
    if (this.activeManifest && this.activeManifest.brainId === id && this.activeManifest.version === version) {
      return { success: true, message: 'Package already active' };
    }

    const matchIndex = this.packageHistory.findIndex((manifest) => manifest.brainId === id && manifest.version === version);
    if (matchIndex === -1) {
      return { success: false, error: 'Package version not found in history' };
    }

    const targetManifest = this.cloneManifest(this.packageHistory[matchIndex]);
    this.packageHistory.splice(matchIndex, 1);

    if (this.activeManifest) {
      this.packageHistory.unshift(this.cloneManifest(this.activeManifest));
      if (this.packageHistory.length > this.maxHistoryLength) {
        this.packageHistory = this.packageHistory.slice(0, this.maxHistoryLength);
      }
    }

    this.activeManifest = targetManifest;
    this.currentState = 'ACTIVE';
    this.updateActiveStats(this.activeManifest);

    globalBus.emit('brain:package_activated', {
      packageId: id,
      version,
      timestamp: Date.now(),
    });

    globalBus.emit('brain:package_loaded', {
      brainId: this.activeManifest.brainId,
      version: this.activeManifest.version,
      moduleCount: this.activeManifest.modules.length,
      timestamp: Date.now(),
    });

    return {
      success: true,
      activated: { id, version },
    };
  }

  public deactivatePackage(): { success: boolean; error?: string; deactivated?: { id: string; version: string } } {
    if (!this.activeManifest) {
      return { success: false, error: 'No package currently active' };
    }

    const current = this.cloneManifest(this.activeManifest);
    this.packageHistory.unshift(current);
    if (this.packageHistory.length > this.maxHistoryLength) {
      this.packageHistory = this.packageHistory.slice(0, this.maxHistoryLength);
    }

    globalBus.emit('brain:package_deactivated', {
      packageId: current.brainId,
      version: current.version,
      timestamp: Date.now(),
    });

    globalBus.emit('brain:package_unloaded', {
      brainId: current.brainId,
      version: current.version,
      timestamp: Date.now(),
    });

    this.stats.totalUnloaded++;
    this.activeManifest = null;
    this.currentState = 'UNLOADED';
    this.updateActiveStats(null);

    return {
      success: true,
      deactivated: { id: current.brainId, version: current.version },
    };
  }

  public exportPackage(id?: string, version?: string): { success: boolean; error?: string; bundle?: BrainPackageManifest } {
    let candidate: BrainPackageManifest | null = null;

    if (id && version) {
      candidate = this.activeManifest && this.activeManifest.brainId === id && this.activeManifest.version === version
        ? this.cloneManifest(this.activeManifest)
        : this.packageHistory.find((manifest) => manifest.brainId === id && manifest.version === version) ?? null;
    } else if (this.activeManifest) {
      candidate = this.cloneManifest(this.activeManifest);
    } else if (id) {
      candidate = this.packageHistory.find((manifest) => manifest.brainId === id) ?? null;
    }

    if (!candidate) {
      return { success: false, error: 'Package not found for export' };
    }

    const bundle = this.cloneManifest(candidate);
    globalBus.emit('brain:package_exported', {
      packageId: bundle.brainId,
      version: bundle.version,
      timestamp: Date.now(),
    });

    return {
      success: true,
      bundle,
    };
  }

  public unloadPackage(): boolean {
    const result = this.deactivatePackage();
    return result.success;
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

  public getModuleByName(name: string): BrainModuleReference | undefined {
    if (!this.activeManifest) {
      return undefined;
    }

    return this.activeManifest.modules.find((module) => module.name === name);
  }

  public getModulesByType(type: BrainModuleReference['moduleType']): BrainModuleReference[] {
    if (!this.activeManifest) {
      return [];
    }

    return this.activeManifest.modules.filter((module) => module.moduleType === type);
  }

  private validateChunkIdentifiers(tenantId: string, brainId: string, version: string, chunkId: string): void {
    const validIdRegex = /^[a-zA-Z0-9_\-\.]+$/;
    const identifiers = { tenantId, brainId, version, chunkId };

    for (const [name, value] of Object.entries(identifiers)) {
      if (typeof value !== 'string' || value.length === 0 || !validIdRegex.test(value)) {
        globalBus.emit('brain:chunk_error', {
          tenantId,
          brainId,
          version,
          chunkId,
          reason: 'invalid_identifier',
          field: name,
        });
        throw new Error('Invalid identifier format');
      }
    }
  }

  public async storeModuleAstChunk(
    tenantId: string,
    brainId: string,
    version: string,
    chunkId: string,
    nodes: AstNode[],
  ): Promise<{ bytesWritten: number; sha256: string }> {
    this.validateChunkIdentifiers(tenantId, brainId, version, chunkId);
    return await this.diskStorage.writeRecord<AstNode[]>(tenantId, 'brain-chunks', `${brainId}-${version}-${chunkId}`, nodes);
  }

  public async loadModuleAstChunk(
    tenantId: string,
    brainId: string,
    version: string,
    chunkId: string,
  ): Promise<AstNode[] | null> {
    this.validateChunkIdentifiers(tenantId, brainId, version, chunkId);

    const chunk = await this.diskStorage.readRecord<AstNode[]>(tenantId, 'brain-chunks', `${brainId}-${version}-${chunkId}`);
    if (chunk === null) {
      globalBus.emit('brain:chunk_error', {
        tenantId,
        brainId,
        version,
        chunkId,
        reason: 'chunk_not_found',
      });
    }

    return chunk;
  }

  public async deleteModuleAstChunk(
    tenantId: string,
    brainId: string,
    version: string,
    chunkId: string,
  ): Promise<boolean> {
    this.validateChunkIdentifiers(tenantId, brainId, version, chunkId);
    return await this.diskStorage.deleteRecord(tenantId, 'brain-chunks', `${brainId}-${version}-${chunkId}`);
  }

  public async executeModuleAstStreaming(
    moduleId: string,
    inputPayload: unknown = {},
    contextOverrides: Record<string, unknown> = {},
    chunkResolver?: (chunkId: string) => Promise<AstNode[]>,
  ): Promise<AstExecutionResult> {
    if (!this.activeManifest) {
      throw new Error('No active brain package loaded');
    }

    const packageId = this.activeManifest.brainId;
    globalBus.emit('brain:streaming_load_initiated', {
      packageId,
      moduleId,
      timestamp: Date.now(),
    });

    const activeModule = this.getModuleByName(moduleId);
    if (!activeModule) {
      throw new Error(`Module '${moduleId}' not found in active package`);
    }

    const moduleData = activeModule as BrainModuleReference & { payload?: unknown; chunkIds?: string[] };
    const rawPayload = moduleData.payload;
    if (rawPayload === undefined || rawPayload === null) {
      throw new Error(`Module '${moduleId}' does not contain an executable AST`);
    }

    const timeoutMs = this.activeManifest.runtimeConstraints?.maxExecutionTimeMs ?? 1000;
    const maxSteps = this.activeManifest.runtimeConstraints?.maxSteps ?? 1000;
    const executionContext = { ...(typeof inputPayload === 'object' && inputPayload !== null ? inputPayload as Record<string, unknown> : {}), ...contextOverrides };

    try {
      let program: { version: '1.0'; programId: string; maxDepth: number; body: AstNode[] };

      if (chunkResolver) {
        const chunkIds = Array.isArray(moduleData.chunkIds) ? moduleData.chunkIds : [`${moduleId}-1`];

        const assembledNodes: AstNode[] = [];
        for (const chunkId of chunkIds) {
          const resolvedChunk = await chunkResolver(chunkId);
          if (Array.isArray(resolvedChunk)) {
            assembledNodes.push(...resolvedChunk);
          }
        }

        program = {
          version: '1.0',
          programId: moduleId,
          maxDepth: this.activeManifest.runtimeConstraints?.boundedAstDepth ?? 10,
          body: assembledNodes,
        };
      } else {
        program = {
          version: '1.0',
          programId: moduleId,
          maxDepth: this.activeManifest.runtimeConstraints?.boundedAstDepth ?? 10,
          body: Array.isArray(rawPayload) ? rawPayload as AstNode[] : (rawPayload as Record<string, unknown>).body as AstNode[] ?? [],
        };
      }

      const validation = this.extractAndValidateAst(moduleId, program);
      if (!validation.valid) {
        const message = validation.errors
          .map((entry) => typeof entry === 'string' ? entry : entry.message)
          .join('; ');
        throw new Error(message || `Module '${moduleId}' does not contain a valid executable AST`);
      }

      const result = await evaluateStreamingAstProgram(
        async () => program,
        executionContext,
        { timeoutMs, maxSteps },
      );

      if (!result.success) {
        globalBus.emit('brain:streaming_execution_failed', {
          packageId,
          moduleId,
          reason: result.error ?? 'streaming_execution_failed',
          executionTimeMs: result.executionTimeMs ?? 0,
          stepsExecuted: result.stepsExecuted ?? 0,
          success: false,
          timestamp: Date.now(),
        });
        return result;
      }

      globalBus.emit('brain:streaming_execution_completed', {
        packageId,
        moduleId,
        executionTimeMs: result.executionTimeMs ?? 0,
        stepsExecuted: result.stepsExecuted ?? 0,
        success: true,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runtime execution error';
      globalBus.emit('brain:streaming_execution_failed', {
        packageId,
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
        diagnostic: {
          path: 'root',
          code: 'STREAMING_EXECUTION_FAILED',
          message,
        },
        stepsExecuted: 0,
        events: [],
        executionTimeMs: 0,
        durationMs: 0,
        emittedEvents: [],
      } satisfies AstExecutionResult;
    }
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
  public extractAndValidateAst(
    moduleName: string,
    astProgram: unknown,
    options: { isChunk?: boolean } = {},
  ): AstValidationResult {
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
    const candidateAst = options.isChunk
      ? {
          version: '1.0' as const,
          programId: moduleName,
          maxDepth: 64,
          body: Array.isArray(parsedAst)
            ? parsedAst
            : Array.isArray((parsedAst as Record<string, unknown> | undefined)?.body)
              ? ((parsedAst as Record<string, unknown>).body as unknown[])
              : [parsedAst],
        }
      : (parsedAst && typeof parsedAst === 'object')
        ? { ...parsedAst, maxDepth }
        : parsedAst;

    const result = validateBoundedAstProgram(candidateAst, { maxDepth: options.isChunk ? 64 : maxDepth });

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
