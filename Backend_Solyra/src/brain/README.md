# Brain Package Loader

The Brain package loader manages the runtime lifecycle of versioned Brain packages. It validates package manifests against the frozen contracts in `Shared_Sol/src/package.ts`, keeps the active package isolated behind a safe rollback model, and emits runtime telemetry through the shared `globalBus`.

## Role in the Architecture

The loader sits between the shared package contract layer and the runtime execution environment. It is responsible for:

- validating manifest schemas and checksum properties;
- tracking the active package lifecycle state;
- ensuring only one active package remains loaded at a time;
- emitting state transitions into the NeuroBus event stream;
- exposing telemetry through `GET /brain/stats`.

## Lifecycle States

`BrainLifecycleState` is defined as:

- `UNLOADED`
- `VALIDATED`
- `ACTIVE`
- `REJECTED`

The lifecycle is intentionally strict:

1. A new package begins in `UNLOADED`.
2. Validation runs before activation.
3. Successful validation transitions to `ACTIVE`.
4. Failed validation leaves the prior active package intact and reports a `REJECTED` state without mutation.
5. `unloadPackage()` returns the loader to `UNLOADED`.

## Validation Rules

`validateManifest()` verifies the following:

- `schemaVersion === '1.0'`
- `brainId` is a non-empty string
- `version` is present and well-formed
- `runtimeConstraints` contains positive numeric values
- `modules` is an array
- each module has a non-empty `name`, `entryPoint`, valid `sha256`, and a supported `moduleType`

The checksum gate requires exact 64-character lowercase or uppercase hexadecimal strings to satisfy the manifest contract:

```ts
/^[a-fA-F0-9]{64}$/
```

## Rollback Safety

The `loadPackage()` method never mutates the currently active manifest when validation fails. If a package is already active, the state remains active and the invalid package is rejected without replacing the existing manifest.

## Event Stream Integration

The loader emits:

- `brain:package_loaded`
- `brain:package_unloaded`
- `brain:validation_failed`

These events are delivered through `globalBus` so other runtime subsystems can subscribe and react to lifecycle changes.

## Telemetry Endpoint

The runtime exposes:

```http
GET /brain/stats
```

Example response:

```json
{
  "state": "ACTIVE",
  "activePackage": "brain-alpha",
  "version": "1.2.3",
  "loadedAt": 1760000000000,
  "totalLoaded": 3,
  "totalFailed": 1,
  "totalUnloaded": 2,
  "modulesCount": 4
}
```
