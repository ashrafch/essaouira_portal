# AI Change Guide

## Goal

This guide is for AI-assisted development and for humans reviewing AI-generated changes.

It exists to make changes:
- more precise
- less risky
- easier to review
- easier to split into safe work packages

## 1. Required mindset

- preserve existing behavior first
- treat PMS/Ops and Smart as separate bounded contexts
- do not duplicate business rules across domains
- prefer incremental refactors over rewrites
- always identify source of truth before editing

## 2. Mandatory pre-change checklist

Before changing code, the AI or developer should:

1. identify the domain owner
2. identify source-of-truth model and route
3. inspect existing service / schema / page for the same concern
4. define the minimum file set to touch
5. state risks:
   - tenant isolation
   - RBAC
   - migration need
   - UI route impact
   - legacy behavior impact

## 3. Preferred implementation sequence

### Backend feature
1. inspect models and current routes
2. add/update schema
3. add/update service logic
4. add/update router
5. add tests
6. add migration if schema changes
7. update docs

### Frontend feature
1. inspect route config and existing page
2. add/update API service function
3. create/update reusable component if needed
4. update page
5. wire routes / sidebar / command palette if relevant
6. run lint/build
7. update docs if user-facing

## 4. File targeting rules

### Smart backend changes
Prefer:
- `apps/server/app/domains/smart_building/service.py`
- `apps/server/app/domains/smart_building/router.py`
- `apps/server/app/domains/smart_building/schemas.py`

### PMS/Ops changes
Inspect first:
- `apps/server/app/main.py`
- `apps/server/app/models/...`

### Smart frontend changes
Prefer:
- `apps/web/src/services/api.js`
- `apps/web/src/components/smart/...`
- `apps/web/src/pages/Smart*.jsx`

### Shared UI changes
Prefer:
- `apps/web/src/components/ui/...`

## 5. Review checklist for generated changes

Verify:
- no duplicate business rule was created
- no route lost RBAC
- no tenant filter was bypassed
- no endpoint contract was silently broken
- no page now bypasses `api.js`
- no schema change lacks migration

## 6. Sub-agent usage structure

This section is meant for AI systems that support delegation.

### Use sub-agents only when:
- explicitly available in the runtime
- allowed by the active instructions
- the task can be split into bounded, non-overlapping work

### Good sub-agent split

#### Explorer sub-agent
Use for:
- codebase inspection
- finding source-of-truth logic
- locating route/service/model ownership

Expected output:
- exact files
- exact functions
- risks and constraints

#### Worker sub-agent
Use for:
- bounded implementation in a disjoint file set
- focused test creation
- UI-only or backend-only slices that do not overlap

Expected output:
- files changed
- exact behavior changed
- checks run

### Recommended orchestration pattern

1. main agent defines task boundaries
2. explorer sub-agent maps ownership and risks
3. worker A handles backend slice
4. worker B handles frontend slice
5. main agent integrates, verifies, and finalizes

### Hard rules for sub-agent usage

- never assign the same writable files to multiple workers
- never delegate the unresolved critical-path task if the main agent is blocked on it immediately
- prefer sub-agents for parallelizable reading, QA, or disjoint implementation
- main agent remains responsible for final integration, verification, and reporting

## 7. Definition of done for AI-generated change

A change is not done until:
- implementation is complete
- tests/builds are run
- migrations are included if needed
- docs are updated
- limitations are stated clearly

## 8. Prompting guidance for future work

A good implementation prompt should include:
- exact milestone or scope
- source-of-truth constraints
- explicit do-not-do list
- required checks
- required final report format

Avoid vague prompts such as:
- "refactor everything"
- "improve the backend"
- "make the UI better" without target pages or constraints
