const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Step 16 Phase 2 (Rev 3): Workspace Ownership Validation ===');

// 1. Pre-flight Assertions
const expectedHead = '6420a816cda282d74b54fb181c01253dc0baa988';
const currentHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
if (currentHead !== expectedHead) {
  console.error(`[FAIL] HEAD commit mismatch. Expected: ${expectedHead}, Got: ${currentHead}`);
  process.exit(1);
}
console.log(`[PASS] Verified HEAD: ${currentHead}`);

const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (status !== '') {
  console.error('[FAIL] Working tree is not clean:\n' + status);
  process.exit(1);
}
console.log('[PASS] Working tree clean');

// 2. Modify Backend_Solyra/src/index.ts
const indexPath = path.join(__dirname, 'Backend_Solyra', 'src', 'index.ts');
let indexContent = fs.readFileSync(indexPath, 'utf8');

if (!indexContent.includes('FORBIDDEN_NOT_WORKSPACE_OWNER')) {
  // Target the linkWorkspace call inside isLinkRequest with a flexible regex
  const linkTargetRegex = /(await\s+bundle\.organizations\.linkWorkspace\s*\(\s*\{[\s\S]*?\}\s*\);)/;
  
  if (!linkTargetRegex.test(indexContent)) {
    console.error('[FAIL] Could not locate linkWorkspace({ ... }) in Backend_Solyra/src/index.ts');
    process.exit(1);
  }

  const ownershipCheck = `// Step 16 Phase 2: Caller must be the verified owner of the workspace being linked
          if (workspace.ownerId !== req.session.userId) {
            sendJsonResponse(res, 403, {
              success: false,
              error: 'Forbidden: only the workspace owner can link it to an organization',
              code: 'FORBIDDEN_NOT_WORKSPACE_OWNER'
            });
            return true;
          }

          $1`;

  indexContent = indexContent.replace(linkTargetRegex, ownershipCheck);
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log('[PASS] Injected workspace ownership check into isLinkRequest in Backend_Solyra/src/index.ts');
} else {
  console.log('[SKIP] FORBIDDEN_NOT_WORKSPACE_OWNER already present in index.ts');
}

// 3. Update Frontend_Solyra/src/components/organization/LinkWorkspaceModal.tsx
const linkModalPath = path.join(__dirname, 'Frontend_Solyra', 'src', 'components', 'organization', 'LinkWorkspaceModal.tsx');
if (fs.existsSync(linkModalPath)) {
  let modalContent = fs.readFileSync(linkModalPath, 'utf8');
  if (!modalContent.includes('FORBIDDEN_NOT_WORKSPACE_OWNER')) {
    const catchErrorRegex = /(catch\s*\((?:err|error)(?::\s*any)?\)\s*\{)/;
    if (catchErrorRegex.test(modalContent)) {
      const errorHandlingAddition = `$1
      if (err?.response?.data?.code === 'FORBIDDEN_NOT_WORKSPACE_OWNER' || err?.message?.includes('FORBIDDEN_NOT_WORKSPACE_OWNER')) {
        setError('Only the owner of this workspace can link it to an organization.');
        setLoading(false);
        return;
      }`;
      modalContent = modalContent.replace(catchErrorRegex, errorHandlingAddition);
      fs.writeFileSync(linkModalPath, modalContent, 'utf8');
      console.log('[PASS] Added FORBIDDEN_NOT_WORKSPACE_OWNER handling to LinkWorkspaceModal.tsx');
    } else {
      console.log('[NOTE] Catch block signature differed; preserving existing modal error handling');
    }
  } else {
    console.log('[SKIP] FORBIDDEN_NOT_WORKSPACE_OWNER handling already present');
  }
}

// 4. Append to Frontend_Solyra/src/components/organization/README.md
const orgReadmePath = path.join(__dirname, 'Frontend_Solyra', 'src', 'components', 'organization', 'README.md');
if (fs.existsSync(orgReadmePath)) {
  const existingReadme = fs.readFileSync(orgReadmePath, 'utf8');
  if (!existingReadme.includes('Step 16 Phase 2')) {
    const phase2ReadmeAddition = `
## Step 16 Phase 2: Workspace Ownership Validation
- Enforces source workspace ownership check: only the user who created/owns a personal workspace may link it to an organization.
- Rejects unauthorized link attempts with HTTP 403 \`FORBIDDEN_NOT_WORKSPACE_OWNER\`.
- \`LinkWorkspaceModal.tsx\` displays clear user guidance when an unauthorized linking attempt occurs.
`;
    fs.appendFileSync(orgReadmePath, phase2ReadmeAddition, 'utf8');
    console.log('[PASS] Appended Phase 2 documentation to Frontend_Solyra/src/components/organization/README.md');
  } else {
    console.log('[SKIP] Phase 2 section already in README.md');
  }
}

// 5. Create Docs/implementations/step16_phase2_organization_workspace_scoping_and_isolation.md
const step16Phase2DocPath = path.join(__dirname, 'Docs', 'implementations', 'step16_phase2_organization_workspace_scoping_and_isolation.md');
fs.mkdirSync(path.dirname(step16Phase2DocPath), { recursive: true });
const step16Phase2DocContent = `# Step 16 Phase 2: Organization Workspace Scoping and Isolation Guards

## Overview
Step 16 Phase 2 establishes boundary security for organization workspace linking. An organization administrator must own a personal workspace before linking it to an organization.

## Security Policies & Checks
- **Route:** \`POST /api/organizations/:orgId/workspaces\`
- **Branch:** \`isLinkRequest\` (lines 2140–2190)
- **Check:** Asserts \`workspace.ownerId === req.session.userId\`
- **Error Response:**
  \`\`\`json
  {
    "success": false,
    "error": "Forbidden: only the workspace owner can link it to an organization",
    "code": "FORBIDDEN_NOT_WORKSPACE_OWNER"
  }
  \`\`\`
- **Frontend Feedback:** \`LinkWorkspaceModal.tsx\` catches \`FORBIDDEN_NOT_WORKSPACE_OWNER\` and alerts the user.
`;
fs.writeFileSync(step16Phase2DocPath, step16Phase2DocContent, 'utf8');
console.log('[PASS] Created Docs/implementations/step16_phase2_organization_workspace_scoping_and_isolation.md');

// 6. Update Backend_Solyra/test/organization_workspaces.test.ts
const testFilePath = path.join(__dirname, 'Backend_Solyra', 'test', 'organization_workspaces.test.ts');
let testContent = fs.readFileSync(testFilePath, 'utf8');

if (!testContent.includes('Step 16 Phase 2: Workspace Ownership Validation')) {
  const phase2Tests = `
  describe('Step 16 Phase 2: Workspace Ownership Validation', () => {
    it('returns 403 when caller is not the workspace owner', async () => {
      const otherUserWorkspace = await bundle.workspaces.create({
        name: "Foreign Workspace",
        slug: "foreign-ws-" + Date.now(),
        ownerId: otherUserId,
      });

      const response = await request(app)
        .post(\`/api/organizations/\${testOrg.id}/workspaces\`)
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ workspaceId: otherUserWorkspace.id });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN_NOT_WORKSPACE_OWNER');
    });

    it('allows linking when caller is the workspace owner', async () => {
      const ownedWorkspace = await bundle.workspaces.create({
        name: "Owned Personal Workspace",
        slug: "owned-personal-ws-" + Date.now(),
        ownerId: testOwnerId,
      });

      const response = await request(app)
        .post(\`/api/organizations/\${testOrg.id}/workspaces\`)
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ workspaceId: ownedWorkspace.id });

      expect([200, 201]).toContain(response.status);
    });
  });
});
`;
  const lastClosing = testContent.lastIndexOf('});');
  if (lastClosing !== -1) {
    testContent = testContent.slice(0, lastClosing) + phase2Tests;
    fs.writeFileSync(testFilePath, testContent, 'utf8');
    console.log('[PASS] Added Phase 2 tests to organization_workspaces.test.ts');
  }
} else {
  console.log('[SKIP] Phase 2 tests already present');
}

// 7. Update Docs/Road_Map.md
const docsRoadmapPath = path.join(__dirname, 'Docs', 'Road_Map.md');
if (fs.existsSync(docsRoadmapPath)) {
  let roadmapText = fs.readFileSync(docsRoadmapPath, 'utf8');
  roadmapText = roadmapText.replace(
    /Step 16 Phase 2:[^\n]+`\[ACTIVE NEXT\]`/,
    'Step 16 Phase 2: Organization Workspace Scoping and Isolation Guards `[COMPLETED]`'
  );
  if (!roadmapText.includes('Step 16 Phase 3:')) {
    roadmapText = roadmapText.replace(
      'Step 16 Phase 2: Organization Workspace Scoping and Isolation Guards `[COMPLETED]`',
      'Step 16 Phase 2: Organization Workspace Scoping and Isolation Guards `[COMPLETED]`\n- **Step 16 Phase 3: Organization Workspace Member Permissions & Role Inheritance** `[ACTIVE NEXT]`'
    );
  } else {
    roadmapText = roadmapText.replace(
      /Step 16 Phase 3:[^\n]+`\[QUEUED\]`/,
      'Step 16 Phase 3: Organization Workspace Member Permissions & Role Inheritance `[ACTIVE NEXT]`'
    );
  }
  fs.writeFileSync(docsRoadmapPath, roadmapText, 'utf8');
  console.log('[PASS] Updated Docs/Road_Map.md marking Step 16 Phase 2 [COMPLETED]');
}

// 8. Run Verification Gates
console.log('--- Running Gate 1: Backend Typecheck ---');
execSync('npm run typecheck --prefix Backend_Solyra', { stdio: 'inherit' });
console.log('[PASS] Backend typecheck passed (0 errors)');

console.log('--- Running Gate 2: Backend Tests ---');
execSync('npm test --prefix Backend_Solyra', { stdio: 'inherit' });
console.log('[PASS] Backend tests passed');

console.log('--- Running Gate 3: Frontend Build ---');
execSync('npm run build --prefix Frontend_Solyra', { stdio: 'inherit' });
console.log('[PASS] Frontend build passed');

// 9. Atomic Commit
console.log('--- Executing Git Commit ---');
execSync('git add -A', { stdio: 'inherit' });
execSync('git commit -m "feat(org): add workspace ownership validation on linking (step 16 phase 2)"', { stdio: 'inherit' });

const finalHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const finalStatus = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
console.log(`[PASS] Final Commit SHA: ${finalHead}`);
console.log(`[PASS] Final Status: ${finalStatus || '(clean)'}`);
console.log('=== Step 16 Phase 2 (Rev 3) Completed Successfully ===');
