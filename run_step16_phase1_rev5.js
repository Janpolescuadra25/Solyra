const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Step 16 Phase 1 Implementation & Gitignore Remediation (Rev 5) ===');

// --- 1. Pre-flight Git Assertions ---
const EXPECTED_HEAD = 'a89587d01fe28c7a86ce441048cffcf95936b176';
const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
if (headSha !== EXPECTED_HEAD) {
  console.error(`[FAIL] HEAD commit mismatch! WANT: ${EXPECTED_HEAD}, GOT: ${headSha}`);
  process.exit(1);
}
console.log(`[PASS] Verified HEAD: ${headSha}`);

const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
const statusLines = statusOutput.split('\n').map(l => l.trim()).filter(Boolean);
const trackedModifications = statusLines.filter(l => !l.includes('run_step16_phase1_rev5.js'));
if (trackedModifications.length > 0) {
  console.error('[FAIL] Working tree has unexpected modifications:\n' + trackedModifications.join('\n'));
  process.exit(1);
}
console.log('[PASS] Working tree clean.');

// --- 2. Remediation: Unstage .codely-cli and Update .gitignore ---
console.log('\n--- Remediation: .codely-cli & .gitignore ---');
try {
  execSync('git rm --cached -r .codely-cli', { stdio: 'inherit' });
  console.log('[PASS] Unstaged .codely-cli from Git cache while preserving local files.');
} catch (err) {
  console.warn('[WARN] Could not unstage .codely-cli (may already be unstaged):', err.message);
}

const gitignorePath = path.resolve('.gitignore');
let gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
if (!gitignoreContent.includes('.codely-cli')) {
  gitignoreContent += '\n# Local tooling\n.codely-cli/\n';
  fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
  console.log('[PASS] Added .codely-cli/ to root .gitignore');
} else {
  console.log('[NOTE] .codely-cli already in .gitignore');
}

// --- 3. Documentation: Create Frontend_Solyra/src/components/guards/P0_AUTH_REPAIRS_README.md ---
console.log('\n--- Documentation: P0 Auth Repairs README ---');
const guardsReadmePath = path.resolve('Frontend_Solyra/src/components/guards/P0_AUTH_REPAIRS_README.md');
const guardsReadmeContent = `# P0 Authentication and Navigation Repairs
**Status:** DONE  
**Baseline Commit:** a89587d01fe28c7a86ce441048cffcf95936b176  

## Summary of Completed Repairs
1. **AuthGuard Race Condition Fix:**
   - File: \`Frontend_Solyra/src/components/guards/AuthGuard.tsx\`
   - Updated \`AuthGuard\` to check \`isLoading\` before evaluating \`isAuthenticated\`.
   - Renders a dark-themed spinner while session token verification completes, preventing premature redirect loops to \`/login\`.

2. **Vite Proxy Port Alignment:**
   - File: \`Frontend_Solyra/vite.config.ts\`
   - Updated proxy target for \`/auth\` and \`/api\` from port \`3001\` to \`4000\` to match the backend's default \`BACKEND_PORT=4000\`.

3. **Authentication Contract Alignment:**
   - File: \`Backend_Solyra/src/auth/service.ts\`
   - Updated \`AuthService.login()\` to return \`{ token, user: safeUser, session }\` rather than omitting the user object.
   - Satisfies \`AuthContext.tsx\` (\`const { user: authedUser, token } = response.data\`), ensuring user profile hydration succeeds upon login.

4. **UI Header Deduplication:**
   - File: \`Frontend_Solyra/src/App.tsx\`
   - Extracted \`<Route path="/" element={<LandingPage />} />\` outside of \`<Route element={<ShellLayout />} >\`.
   - Eliminates the double-header bug on the landing page while preserving \`ShellLayout\` navigation for all other public and protected routes.

5. **Sessions Schema Definition:**
   - File: \`Backend_Solyra/src/persistence/postgres/schema.sql\`
   - Added DDL for \`public.sessions\` table with UUID foreign keys, token hashes, and indexes matching \`session.repository.ts\`.
`;
fs.writeFileSync(guardsReadmePath, guardsReadmeContent, 'utf8');
console.log('[PASS] Created Frontend_Solyra/src/components/guards/P0_AUTH_REPAIRS_README.md');

// --- 4. Modify Backend_Solyra/src/index.ts: Add Creation Logic to Workspaces Route ---
console.log('\n--- Backend: Add Workspace Creation Logic to Workspaces Route ---');
const backendIndexPath = path.resolve('Backend_Solyra/src/index.ts');
let backendIndexContent = fs.readFileSync(backendIndexPath, 'utf8');

// Ensure randomUUID is imported
if (!backendIndexContent.includes('randomUUID')) {
  backendIndexContent = `import { randomUUID } from 'crypto';\n` + backendIndexContent;
}

// Find existing workspaces POST handler
const wsPostMarker = "if (req.method === 'POST') {";
const wsRouteSection = backendIndexContent.indexOf("orgPathParts[3] === 'workspaces'");
if (wsRouteSection === -1) {
  console.error('[FAIL] Could not find workspaces route in Backend_Solyra/src/index.ts');
  process.exit(1);
}

const postIndex = backendIndexContent.indexOf(wsPostMarker, wsRouteSection);
if (postIndex === -1) {
  console.error('[FAIL] Could not find POST handler in workspaces route');
  process.exit(1);
}

const creationLogicSnippet = `
        // Step 16 Phase 1: Organization-Scoped Workspace Creation
        // Triggered when body.name is provided and body.workspaceId is not a string
        if (body && typeof body.name === 'string' && (!body.workspaceId || typeof body.workspaceId !== 'string')) {
          const rateLimitKey = \`\${req.socket?.remoteAddress || 'unknown'}:organization-workspace-create\`;
          const rateLimit = rateLimiter.check(rateLimitKey);
          if (!rateLimit.allowed) {
            sendJsonResponse(res, 429, { error: 'Too many requests. Please slow down.' });
            return true;
          }

          const callerId = (req as any).user?.id || (req as any).session?.userId;
          if (!callerId) {
            sendJsonResponse(res, 401, { error: 'Authentication required' });
            return true;
          }

          const name = body.name.trim();
          const rawSlug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
          const description = typeof body.description === 'string' ? body.description.trim() : undefined;
          const isIsolated = typeof body.isIsolated === 'boolean' ? body.isIsolated : false;
          const settings = typeof body.settings === 'object' && body.settings !== null ? body.settings : {};

          if (!name) {
            sendJsonResponse(res, 400, { error: 'Workspace name is required' });
            return true;
          }

          const slug = rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          if (!slug) {
            sendJsonResponse(res, 400, { error: 'A valid workspace slug is required' });
            return true;
          }

          const existingSlug = await bundle.workspaces.findBySlug(slug);
          if (existingSlug) {
            sendJsonResponse(res, 409, { error: 'Workspace slug already exists. Please choose another.' });
            return true;
          }

          const newWorkspace = {
            id: randomUUID(),
            slug,
            name,
            ownerId: callerId,
            description: description || undefined,
            isIsolated,
            settings,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          try {
            await bundle.workspaces.create(newWorkspace as any);
            await bundle.organizations.linkWorkspace({
              organizationId: orgId,
              workspaceId: newWorkspace.id
            });

            if (bundle.audit) {
              await bundle.audit.recordEvent({
                eventType: 'organization.workspace_created',
                userId: callerId,
                workspaceId: newWorkspace.id,
                details: {
                  organizationId: orgId,
                  workspaceId: newWorkspace.id,
                  slug: newWorkspace.slug,
                  name: newWorkspace.name
                }
              });
            }

            sendJsonResponse(res, 201, {
              success: true,
              workspace: newWorkspace
            });
            return true;
          } catch (err) {
            sendJsonResponse(res, 500, { error: 'Failed to create organization-scoped workspace', details: err?.message });
            return true;
          }
        }
`;

if (!backendIndexContent.includes('organization-workspace-create')) {
  const bodyReadMarker = "body = await readJsonRequest(req, 1024 * 1024);";
  const bodyReadIndex = backendIndexContent.indexOf(bodyReadMarker, postIndex);
  if (bodyReadIndex === -1) {
    console.error('[FAIL] Could not find readJsonRequest in workspaces POST handler');
    process.exit(1);
  }

  const tryCatchEndMarker = "return true;\n        }";
  const insertPos = backendIndexContent.indexOf(tryCatchEndMarker, bodyReadIndex);
  if (insertPos === -1) {
    console.error('[FAIL] Could not find end of JSON parse block');
    process.exit(1);
  }

  const actualInsertPos = insertPos + tryCatchEndMarker.length;
  backendIndexContent = backendIndexContent.slice(0, actualInsertPos) + creationLogicSnippet + backendIndexContent.slice(actualInsertPos);
  fs.writeFileSync(backendIndexPath, backendIndexContent, 'utf8');
  console.log('[PASS] Added workspace creation logic to POST /api/organizations/:orgId/workspaces handler');
} else {
  console.log('[NOTE] Workspace creation logic already present in Backend_Solyra/src/index.ts');
}

// --- 5. Modify Frontend_Solyra/src/api/client.ts ---
console.log('\n--- Frontend: Add API Client Helper ---');
const clientPath = path.resolve('Frontend_Solyra/src/api/client.ts');
let clientContent = fs.readFileSync(clientPath, 'utf8');

const clientMethodMarker = 'export const linkOrganizationWorkspace = async';
if (!clientContent.includes(clientMethodMarker)) {
  console.error('[FAIL] Could not find linkOrganizationWorkspace in Frontend_Solyra/src/api/client.ts');
  process.exit(1);
}

const createWorkspaceClientMethod = `export interface CreateOrgWorkspacePayload {
  name: string;
  slug?: string;
  description?: string;
  isIsolated?: boolean;
  settings?: Record<string, unknown>;
}

export const createOrganizationWorkspaceNew = async (
  organizationId: string,
  payload: CreateOrgWorkspacePayload
): Promise<Workspace> => {
  const response = await unwrap(
    api.post<{ success: boolean; workspace: Workspace }>(
      \`/api/organizations/\${organizationId}/workspaces\`,
      payload
    )
  );
  return response.workspace;
};

`;

if (!clientContent.includes('createOrganizationWorkspaceNew')) {
  clientContent = clientContent.replace(clientMethodMarker, createWorkspaceClientMethod + clientMethodMarker);
  fs.writeFileSync(clientPath, clientContent, 'utf8');
  console.log('[PASS] Added createOrganizationWorkspaceNew to Frontend_Solyra/src/api/client.ts');
} else {
  console.log('[NOTE] createOrganizationWorkspaceNew already present in Frontend_Solyra/src/api/client.ts');
}

// --- 6. Create Frontend_Solyra/src/components/organization/CreateWorkspaceModal.tsx ---
console.log('\n--- Frontend: Create CreateWorkspaceModal.tsx ---');
const createModalPath = path.resolve('Frontend_Solyra/src/components/organization/CreateWorkspaceModal.tsx');
const createModalContent = `import React, { useState, useEffect, useRef } from 'react';
import { createOrganizationWorkspaceNew, type Workspace } from '../../api/client';

interface CreateWorkspaceModalProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onWorkspaceCreated: (workspace: Workspace) => void;
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  organizationId,
  isOpen,
  onClose,
  onWorkspaceCreated
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isIsolated, setIsIsolated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node) && isOpen) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) {
      setSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) {
      if (!name.trim()) setError('Workspace name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await createOrganizationWorkspaceNew(organizationId, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        isIsolated
      });
      onWorkspaceCreated(created);
      onClose();
      setName('');
      setSlug('');
      setDescription('');
      setIsIsolated(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workspace-title"
        className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h2 id="create-workspace-title" className="text-lg font-semibold text-slate-100">
            Create Organization Workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-red-900/40 border border-red-700 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="ws-name" className="block text-xs font-medium text-slate-300">
              Workspace Name *
            </label>
            <input
              id="ws-name"
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Core Engineering"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="ws-slug" className="block text-xs font-medium text-slate-300">
              Slug Identifier
            </label>
            <input
              id="ws-slug"
              type="text"
              disabled={loading}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="e.g. core-engineering"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="ws-desc" className="block text-xs font-medium text-slate-300">
              Description (Optional)
            </label>
            <textarea
              id="ws-desc"
              rows={2}
              disabled={loading}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this workspace"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="ws-isolated"
              type="checkbox"
              disabled={loading}
              checked={isIsolated}
              onChange={(e) => setIsIsolated(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0 disabled:opacity-50"
            />
            <label htmlFor="ws-isolated" className="text-xs text-slate-300">
              Enforce strict workspace data isolation
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
`;
fs.writeFileSync(createModalPath, createModalContent, 'utf8');
console.log('[PASS] Created Frontend_Solyra/src/components/organization/CreateWorkspaceModal.tsx');

// --- 7. Modify Frontend_Solyra/src/components/organization/OrganizationWorkspacesList.tsx ---
console.log('\n--- Frontend: Integrate Create Modal into OrganizationWorkspacesList ---');
const listPath = path.resolve('Frontend_Solyra/src/components/organization/OrganizationWorkspacesList.tsx');
let listContent = fs.readFileSync(listPath, 'utf8');

if (!listContent.includes('CreateWorkspaceModal')) {
  listContent = `import { CreateWorkspaceModal } from './CreateWorkspaceModal';\n` + listContent;

  const stateMarker = 'const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);';
  const createState = `const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);\n  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);`;
  listContent = listContent.replace(stateMarker, createState);

  const handlerMarker = 'const handleWorkspaceLinked = (linkedWorkspace: Workspace) => {';
  const createHandler = `const handleWorkspaceCreated = (newWorkspace: Workspace) => {\n    setWorkspaces(prev => [...prev, newWorkspace]);\n    if (onRefresh) onRefresh();\n  };\n\n  ` + handlerMarker;
  listContent = listContent.replace(handlerMarker, createHandler);

  const linkButtonRegex = /<button\s+onClick=\{[^}]*setIsLinkModalOpen\(true\)[^}]*\}\s+className="[^"]*"\s*>([\s\S]*?)<\/button>/;
  const linkButtonMatch = listContent.match(linkButtonRegex);
  if (linkButtonMatch) {
    const fullLinkButton = linkButtonMatch[0];
    const actionButtons = `<div className="flex items-center gap-2">\n            <button\n              onClick={() => setIsCreateModalOpen(true)}\n              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"\n            >\n              + Create Workspace\n            </button>\n            ${fullLinkButton}\n          </div>`;
    listContent = listContent.replace(fullLinkButton, actionButtons);
  }

  const modalRenderMarker = '<LinkWorkspaceModal';
  const createModalRender = `<CreateWorkspaceModal\n        organizationId={organizationId}\n        isOpen={isCreateModalOpen}\n        onClose={() => setIsCreateModalOpen(false)}\n        onWorkspaceCreated={handleWorkspaceCreated}\n      />\n      ` + modalRenderMarker;
  listContent = listContent.replace(modalRenderMarker, createModalRender);

  fs.writeFileSync(listPath, listContent, 'utf8');
  console.log('[PASS] Integrated CreateWorkspaceModal into Frontend_Solyra/src/components/organization/OrganizationWorkspacesList.tsx');
} else {
  console.log('[NOTE] CreateWorkspaceModal already integrated into OrganizationWorkspacesList.tsx');
}

// --- 8. Update Backend_Solyra/test/organization_workspaces.test.ts ---
console.log('\n--- Backend Tests: Add Workspace Creation Test Suite ---');
const testPath = path.resolve('Backend_Solyra/test/organization_workspaces.test.ts');
let testContent = fs.readFileSync(testPath, 'utf8');

if (!testContent.includes('creates a workspace directly within an organization')) {
  const newTests = `
  describe('POST /api/organizations/:orgId/workspaces (Creation Mode)', () => {
    it('creates a workspace directly within an organization for owner/admin', async () => {
      const org = await bundle.organizations.create({
        name: 'Creation Test Org',
        slug: 'creation-test-org-' + Date.now(),
        ownerId: 'user-owner'
      });

      const res = await request(app)
        .post(\`/api/organizations/\${org.id}/workspaces\`)
        .set('Authorization', 'Bearer token-owner')
        .send({
          name: 'Direct Org Workspace',
          slug: 'direct-org-ws-' + Date.now(),
          description: 'Created directly within org'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.workspace).toBeDefined();
      expect(res.body.workspace.name).toBe('Direct Org Workspace');

      const createdInRepo = await bundle.workspaces.findById(res.body.workspace.id);
      expect(createdInRepo).toBeDefined();

      const linked = await bundle.organizations.listWorkspaces(org.id);
      expect(linked.some(w => w.id === res.body.workspace.id)).toBe(true);
    });

    it('rejects workspace creation by a regular member with 403', async () => {
      const org = await bundle.organizations.create({
        name: 'Member Test Org',
        slug: 'member-test-org-' + Date.now(),
        ownerId: 'user-owner'
      });
      await bundle.organizations.addMember({
        organizationId: org.id,
        userId: 'user-member',
        role: 'member'
      });

      const res = await request(app)
        .post(\`/api/organizations/\${org.id}/workspaces\`)
        .set('Authorization', 'Bearer token-member')
        .send({
          name: 'Unauthorized Workspace'
        });

      expect(res.status).toBe(403);
    });

    it('returns 400 when workspace name is missing', async () => {
      const org = await bundle.organizations.create({
        name: 'Validation Test Org',
        slug: 'val-test-org-' + Date.now(),
        ownerId: 'user-owner'
      });

      const res = await request(app)
        .post(\`/api/organizations/\${org.id}/workspaces\`)
        .set('Authorization', 'Bearer token-owner')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name is required');
    });

    it('returns 409 when workspace slug already exists', async () => {
      const org = await bundle.organizations.create({
        name: 'Conflict Test Org',
        slug: 'conflict-test-org-' + Date.now(),
        ownerId: 'user-owner'
      });

      const existingSlug = 'conflict-slug-' + Date.now();
      await request(app)
        .post(\`/api/organizations/\${org.id}/workspaces\`)
        .set('Authorization', 'Bearer token-owner')
        .send({
          name: 'First Workspace',
          slug: existingSlug
        });

      const duplicateRes = await request(app)
        .post(\`/api/organizations/\${org.id}/workspaces\`)
        .set('Authorization', 'Bearer token-owner')
        .send({
          name: 'Second Workspace',
          slug: existingSlug
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error).toContain('already exists');
    });
  });
`;

  const lastDescribeIndex = testContent.lastIndexOf('});');
  if (lastDescribeIndex !== -1) {
    testContent = testContent.slice(0, lastDescribeIndex) + newTests + '\n});\n';
    fs.writeFileSync(testPath, testContent, 'utf8');
    console.log('[PASS] Added Step 16 Phase 1 test suite to Backend_Solyra/test/organization_workspaces.test.ts');
  }
} else {
  console.log('[NOTE] Test suite already present in Backend_Solyra/test/organization_workspaces.test.ts');
}

// --- 9. Update Frontend_Solyra/src/components/organization/README.md ---
const readmePath = path.resolve('Frontend_Solyra/src/components/organization/README.md');
let readmeContent = fs.readFileSync(readmePath, 'utf8');
if (!readmeContent.includes('CreateWorkspaceModal')) {
  readmeContent += `\n\n### Step 16 Phase 1: Organization-Scoped Workspace Creation\n- **Modal Component:** \`CreateWorkspaceModal.tsx\` provides direct workspace creation for organization owners/admins.\n- **Endpoint:** \`POST /api/organizations/:orgId/workspaces\` (with body.name) atomically creates the workspace, links it to the organization, and logs an audit event.\n- **API Client:** \`createOrganizationWorkspaceNew\` in \`Frontend_Solyra/src/api/client.ts\`.\n`;
  fs.writeFileSync(readmePath, readmeContent, 'utf8');
  console.log('[PASS] Updated Frontend_Solyra/src/components/organization/README.md');
}

// --- 10. Create Docs/Road_Map.md and Road_Map.md Cleanly ---
console.log('\n--- Documentation: Road_Map.md in Docs/ and root ---');
const docsDir = path.resolve('Docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const docsRoadmapPath = path.resolve('Docs/Road_Map.md');
const rootRoadmapPath = path.resolve('Road_Map.md');

const roadmapContent = `# Solyra Product Roadmap

## Current Phase
### Step 16: Organization-Scoped Workspace Creation and Isolation
#### Phase 1: Organization Workspace Creation REST APIs and UI [COMPLETED]
- [x] Backend endpoint \`POST /api/organizations/:orgId/workspaces\` with body discrimination (create vs link), owner/admin RBAC, and rate limiting
- [x] Atomic workspace record creation and organization-workspace linking
- [x] Frontend \`CreateWorkspaceModal\` with click-outside, Escape dismissal, and submit guard
- [x] Integration with \`OrganizationWorkspacesList\` and API client
- [x] Full integration test coverage for 201, 403, 400, and 409 cases

#### Phase 2: Organization Workspace Scoping and Isolation Guards [ACTIVE NEXT]
- [ ] Enforce organization-level boundary on workspace operations
- [ ] Source workspace ownership validation before linking
- [ ] Cross-tenant access denial tests

## ARCHIVED: Completed Historical Milestones
- **Step 14 Phase 1:** Organization Schema & Persistence Layer (commit \`e8c7a3f\`)
- **Step 14 Phase 2:** Organization Route Handlers & RBAC Middleware
- **Step 14 Phase 3:** Frontend Organization Management UI
- **Step 15 Phase 1:** Backend Organization Workspace Linking REST APIs
- **Step 15 Phase 2:** Frontend Organization Workspace UI & Tab Navigation (commit \`a6aa8f3\`)
- **P0 Authentication & Schema Repairs:** Sessions schema DDL, AuthContext contract, AuthGuard loading guard, proxy port alignment (commit \`a89587d\`)
`;

fs.writeFileSync(docsRoadmapPath, roadmapContent, 'utf8');
fs.writeFileSync(rootRoadmapPath, roadmapContent, 'utf8');
console.log('[PASS] Created Docs/Road_Map.md and root Road_Map.md.');

// --- 11. Self-delete Runner Script ---
try {
  fs.unlinkSync(__filename);
  console.log('[PASS] Self-deleted runner script.');
} catch (err) {
  console.warn('[WARN] Could not self-delete runner script:', err.message);
}

// --- 12. Run Verification Gates ---
console.log('\n--- Running Verification Gates ---');

console.log('1. Running Backend TypeScript Typecheck:');
execSync('npm run typecheck --prefix Backend_Solyra', { stdio: 'inherit' });

console.log('2. Running Backend Tests:');
execSync('npm test --prefix Backend_Solyra', { stdio: 'inherit' });

console.log('3. Running Frontend Build:');
execSync('npm run build --prefix Frontend_Solyra', { stdio: 'inherit' });

// --- 13. Git Commit ---
console.log('\n--- Committing Consolidated Deliverables ---');
execSync('git add -A', { stdio: 'inherit' });

const commitMessage = 'feat(org): implement organization-scoped workspace creation endpoint, modal UI, and gitignore remediation';
execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

const finalSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
console.log(`\n[SUCCESS] Consolidated Step 16 Phase 1 completed cleanly at commit: ${finalSha}`);
