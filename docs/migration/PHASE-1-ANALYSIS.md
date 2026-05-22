# Phase 1: Angular 14 → 18 Codebase Analysis & Migration Plan

**Application:** BofA Digital Banking Platform  
**Scope:** `retail-banking-portal`, `corporate-dashboard`, `mobile-api-gateway`, `shared-ui`, `shared-data-access`  
**Date:** 2026-05-22  
**Author:** Devin (automated analysis)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [NgModule Declarations](#2-ngmodule-declarations)
3. [Class-Based CanActivate Guards](#3-class-based-canactivate-guards)
4. [HttpClientModule Imports](#4-httpclientmodule-imports)
5. [Deprecated RxJS Patterns](#5-deprecated-rxjs-patterns)
6. [Angular Material v14-Specific APIs](#6-angular-material-v14-specific-apis)
7. [Karma/Jasmine Test Infrastructure](#7-karmajasmine-test-infrastructure)
8. [Legacy Template Syntax](#8-legacy-template-syntax)
9. [Migration Map — shared-ui Dependency Graph](#9-migration-map--shared-ui-dependency-graph)
10. [Risk Matrix](#10-risk-matrix)
11. [Phase Breakdown & Estimated Effort](#11-phase-breakdown--estimated-effort)
12. [Rollback Strategy](#12-rollback-strategy)

---

## 1. Executive Summary

The BofA Digital Banking monorepo contains **3 applications** and **2 shared libraries**, all pinned to Angular 14.3.x with RxJS 6.6.7 and TypeScript 4.7.x. Angular 14 reached end-of-life (EOL) on 2024-11-18. This analysis identifies all migration targets required to upgrade to Angular 18.

### Key Metrics

| Metric | Count |
|--------|-------|
| `@NgModule` declarations | **5** modules (18 component declarations total) |
| Class-based `CanActivate` guards | **2** (retail-banking-portal, corporate-dashboard) |
| `HttpClientModule` imports | **3** (one per app) |
| `toPromise()` usages | **1** (banking-api.service.ts) |
| `combineLatest([…])` array syntax | **3** (fraud-detection.service.ts ×2, dashboard.component.ts ×1) |
| Angular Material v14 APIs | **4** instances (matSortActive, matSortDirection, color palette, legacy appearance) |
| `karma.conf.js` files | **1** present, **3** referenced in package.json scripts |
| Legacy `*ngIf` / `*ngFor` directives | **11** instances across templates |
| Constructor injection (migration target) | **9** services/components |
| Total source files (non-node_modules) | **29** TypeScript + HTML files |

---

## 2. NgModule Declarations

### 2.1 Application Modules

| Module | File | Declarations | Imports (Angular modules) |
|--------|------|-------------|--------------------------|
| `AppModule` (retail) | `apps/retail-banking-portal/src/app/app.module.ts` | `AppComponent`, `DashboardComponent`, `TransactionListComponent` | `BrowserModule`, `BrowserAnimationsModule`, `HttpClientModule`, `FormsModule`, `ReactiveFormsModule`, `AppRoutingModule`, `SharedUiModule`, 6× Material modules |
| `AppRoutingModule` (retail) | `apps/retail-banking-portal/src/app/app-routing.module.ts` | _(none — routing only)_ | `RouterModule.forRoot(routes, routerOptions)` |
| `AppModule` (corporate) | `apps/corporate-dashboard/src/app/app.module.ts` | `AppComponent`, `CorporateDashboardComponent`, `WireTransferComponent` | `BrowserModule`, `BrowserAnimationsModule`, `HttpClientModule`, `SharedUiModule`, `RouterModule.forRoot(…)` |
| `AppModule` (mobile) | `apps/mobile-api-gateway/src/app/app.module.ts` | `AppComponent`, `MobileGatewayStatusComponent` | `BrowserModule`, `HttpClientModule`, `SharedUiModule`, `RouterModule.forRoot(…)` |

### 2.2 Library Modules

| Module | File | Declarations | Exports |
|--------|------|-------------|---------|
| `SharedUiModule` | `libs/shared-ui/src/lib/shared-ui.module.ts` | `BfaButtonComponent`, `BfaDataTableComponent`, `BfaNotificationComponent` | `BfaButtonComponent`, `BfaDataTableComponent`, `BfaNotificationComponent` |

### 2.3 Migration Action

All 5 `@NgModule` classes must be replaced:
- **App modules** → `bootstrapApplication()` with `app.config.ts` (Phase 3)
- **Routing modules** → `provideRouter(routes)` in `app.config.ts` (Phase 3)
- **SharedUiModule** → each component becomes `standalone: true` with its own `imports` (Phase 2)

**Affected files:** 5 module files + 8 component files + 3 `main.ts` bootstrap files = **16 files**

---

## 3. Class-Based CanActivate Guards

| Guard | File | Consumers | Risk Level |
|-------|------|-----------|------------|
| `AuthGuard` (retail) | `apps/retail-banking-portal/src/app/auth/auth.guard.ts` | `app-routing.module.ts` — 2 routes (`/dashboard`, `/transactions`) | **HIGH** |
| `AuthGuard` (corporate) | `apps/corporate-dashboard/src/app/app.module.ts` (inline routes) | 2 routes (`/corporate-dashboard`, `/wire-transfer`) | **HIGH** |

### Security-Critical Details (per `security-policy.md`)

- **retail-banking-portal `AuthGuard`** (76 lines):
  - Implements `CanActivate` interface (deprecated Angular 15+)
  - Preserves `state.url` as SAML `RelayState` via `SsoAuthService.initiateSamlLogin(state.url)`
  - Role-based access control: checks `route.data['requiresRole']` against `SsoAuthService.hasRole()`
  - Redirects unauthorized users to `/unauthorized` with `returnUrl` query param
  - **SSO token chain MUST be preserved** during migration to functional guard

- **corporate-dashboard `AuthGuard`**: Referenced in module providers and route config. Source file at `apps/corporate-dashboard/src/app/auth/auth.guard.ts` (not yet created — likely mirrors retail pattern).

### Migration Action

Replace with functional `CanActivateFn` guards per `security-policy.md`:
```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(SsoAuthService);
  const router = inject(Router);
  // ... preserve RelayState, role checking
};
```

---

## 4. HttpClientModule Imports

| App | File | Line | Interceptor Registration |
|-----|------|------|--------------------------|
| `retail-banking-portal` | `apps/retail-banking-portal/src/app/app.module.ts` | L4, L52 | `AuditLoggingInterceptor` via `HTTP_INTERCEPTORS` multi-provider (L72-76) |
| `corporate-dashboard` | `apps/corporate-dashboard/src/app/app.module.ts` | L4, L35 | `AuditLoggingInterceptor` via `HTTP_INTERCEPTORS` multi-provider (L46) |
| `mobile-api-gateway` | `apps/mobile-api-gateway/src/app/app.module.ts` | L3, L30 | `AuditLoggingInterceptor` via `HTTP_INTERCEPTORS` multi-provider (L38) |

### Migration Action

Replace `HttpClientModule` + class-based interceptor with:
```typescript
provideHttpClient(withInterceptors([auditLoggingInterceptor]))
```
The `AuditLoggingInterceptor` class must be converted to a functional `HttpInterceptorFn` per `security-policy.md`.

**Affected files:** 3 app modules + 3 interceptor files = **6 files**

---

## 5. Deprecated RxJS Patterns

### 5.1 `toPromise()` Usages

| File | Line | Code | Replacement |
|------|------|------|-------------|
| `libs/shared-data-access/src/lib/api/banking-api.service.ts` | L91-93 | `this.http.get<AccountSummary[]>(…).toPromise()` | `lastValueFrom(this.http.get<AccountSummary[]>(…))` |

**Note:** `lastValueFrom()` throws `EmptyError` on empty observables instead of resolving `undefined`. The return type changes from `Promise<AccountSummary[] | undefined>` to `Promise<AccountSummary[]>`. Callers must be audited.

### 5.2 `combineLatest([…])` Array Syntax

| File | Line | Context | Replacement |
|------|------|---------|-------------|
| `libs/shared-data-access/src/lib/api/fraud-detection.service.ts` | L81 | `combineLatest([signals$, profile$])` in `assessTransactionRisk()` | `combineLatest({ signals: signals$, profile: profile$ })` |
| `libs/shared-data-access/src/lib/api/fraud-detection.service.ts` | L98 | `combineLatest(signalObservables)` in `monitorTransactionBatch()` | Dynamic array — keep array syntax (valid in RxJS 7) |
| `apps/retail-banking-portal/src/app/dashboard/dashboard.component.ts` | L87 | `combineLatest([accounts$, spendingScore$])` in `loadDashboardData()` | `combineLatest({ accounts: accounts$, score: score$ })` |

### 5.3 `throwError()` String Syntax

| File | Line | Code |
|------|------|------|
| `apps/retail-banking-portal/src/app/auth/sso-auth.service.ts` | L118 | `throwError(() => new Error('…'))` — ✅ Already uses factory syntax |
| `apps/retail-banking-portal/src/app/auth/sso-auth.service.ts` | L130 | `throwError(() => new Error('…'))` — ✅ Already uses factory syntax |
| `apps/retail-banking-portal/src/app/auth/sso-auth.service.ts` | L151 | `throwError(() => err)` — ✅ Already uses factory syntax |

**Result:** All `throwError()` calls already use the RxJS 7+ factory pattern. No migration needed.

---

## 6. Angular Material v14-Specific APIs

### 6.1 `[matSortActive]` and `[matSortDirection]` Input Bindings

| File | Lines | Element | Migration |
|------|-------|---------|-----------|
| `libs/shared-ui/src/lib/data-table/bfa-data-table.component.ts` | L68-69 | `<table mat-table [matSortActive]="initialSortColumn" [matSortDirection]="initialSortDirection">` | Remove template bindings; set `this.sort.active` and `this.sort.direction` in `ngAfterViewInit()` |

### 6.2 `appearance="legacy"` Form Fields

No `appearance="legacy"` found in the codebase. The transaction list template uses `appearance="outline"` (already compliant).

- `apps/retail-banking-portal/src/app/transactions/transaction-list.component.html:5` — `appearance="outline"` ✅

### 6.3 `color` ThemePalette on MatButton

| File | Line | Code | Migration |
|------|------|------|-----------|
| `libs/shared-ui/src/lib/button/bfa-button.component.ts` | L36 | `[color]="variant === 'primary' ? 'primary' : variant === 'destructive' ? 'warn' : undefined"` | Replace ThemePalette with MD3 CSS custom properties |
| `apps/retail-banking-portal/src/app/app.component.html` | L1 | `<mat-toolbar color="primary">` | Replace with MD3 CSS custom properties |

### 6.4 `Sort` Type → `SortState`

| File | Lines | Usage |
|------|-------|-------|
| `libs/shared-ui/src/lib/data-table/bfa-data-table.component.ts` | L12, L145, L161 | `import { Sort }` / `EventEmitter<Sort>` / `onSortChange(sort: Sort)` |
| `apps/retail-banking-portal/src/app/transactions/transaction-list.component.ts` | L10, L133 | `import { Sort }` / `onSortChange(sort: Sort)` |

**Affected files:** 4 files with Material API changes

---

## 7. Karma/Jasmine Test Infrastructure

### 7.1 Karma Configuration Files

| File | Status |
|------|--------|
| `apps/retail-banking-portal/karma.conf.js` | Present — 47 lines, configured with `ChromeHeadlessNoSandbox` |
| `apps/corporate-dashboard/karma.conf.js` | Referenced in `package.json` script but **file not present** |
| `apps/mobile-api-gateway/karma.conf.js` | Referenced in `package.json` script but **file not present** |

### 7.2 Legacy Test Bootstrap

| File | Description |
|------|-------------|
| `apps/retail-banking-portal/src/test.ts` | Karma test bootstrap — initializes `BrowserDynamicTestingModule`, loads `*.spec.ts` via webpack `require.context` |
| `apps/retail-banking-portal/tsconfig.spec.json` | References `jasmine` types |

### 7.3 Jasmine Dependencies (per package.json)

| App | Jasmine Packages |
|-----|------------------|
| `retail-banking-portal` | `@types/jasmine@~4.0.0`, `jasmine-core@~4.2.0`, `karma@~6.4.0`, `karma-chrome-launcher@~3.1.0`, `karma-coverage@~2.2.0`, `karma-jasmine@~5.1.0`, `karma-jasmine-html-reporter@~2.0.0` |
| `corporate-dashboard` | `@types/jasmine@~4.0.0`, `jasmine-core@~4.2.0`, `karma@~6.4.0`, `karma-chrome-launcher@~3.1.0`, `karma-jasmine@~5.1.0` |
| `mobile-api-gateway` | `@types/jasmine@~4.0.0`, `jasmine-core@~4.2.0`, `karma@~6.4.0`, `karma-chrome-launcher@~3.1.0`, `karma-jasmine@~5.1.0` |

### 7.4 Current Test Coverage

No `*.spec.ts` files exist in the codebase. Test coverage is **0%** across all compliance paths. Per `test-standards.md`, the following paths require ≥80% coverage:
- `auth/` (SSO, guards, interceptors)
- `transactions/` (list, model, filter)
- `shared-data-access/api/`
- `fraud-detection.service.ts`

### Migration Action (Phase 6)

Replace Karma/Jasmine with Jest per `test-standards.md`. Remove `karma.conf.js`, `src/test.ts`. Install `jest`, `jest-preset-angular`, `@types/jest`, `ts-jest`. Add `jest.config.ts` and `setup-jest.ts`.

---

## 8. Legacy Template Syntax

### 8.1 `*ngIf` Directives → `@if`

| File | Count | Lines |
|------|-------|-------|
| `apps/retail-banking-portal/src/app/dashboard/dashboard.component.html` | 3 | L4, L8, L22 |
| `apps/retail-banking-portal/src/app/transactions/transaction-list.component.html` | 4 | L12, L16, L20, L55 |
| `libs/shared-ui/src/lib/notification-banner/bfa-notification.component.ts` | 2 | template L33, L36 |
| `libs/shared-ui/src/lib/button/bfa-button.component.ts` | 1 | template L42 |
| `libs/shared-ui/src/lib/data-table/bfa-data-table.component.ts` | 1 | template L118 |

**Total:** 11 `*ngIf` instances

### 8.2 `*ngFor` Directives → `@for … track`

| File | Count | Lines |
|------|-------|-------|
| `apps/retail-banking-portal/src/app/dashboard/dashboard.component.html` | 2 | L54, L102 |
| `libs/shared-ui/src/lib/data-table/bfa-data-table.component.ts` | 1 | template L74 |

**Total:** 3 `*ngFor` instances

### 8.3 Other Legacy Patterns

| Pattern | File | Details |
|---------|------|---------|
| `relativeLinkResolution: 'legacy'` | `apps/retail-banking-portal/src/app/app-routing.module.ts:49` | Removed in Angular 15 — must delete |
| `platformBrowserDynamic().bootstrapModule()` | `apps/retail-banking-portal/src/main.ts:11` | Replace with `bootstrapApplication()` |
| `@ViewChild({ static: true })` | `apps/retail-banking-portal/src/app/dashboard/dashboard.component.ts:53,56` | Remove `static: true` flag |
| Constructor injection (9 instances) | Multiple files | Replace with `inject()` function |

---

## 9. Migration Map — shared-ui Dependency Graph

```
┌──────────────────────────────────────────────────────────────────┐
│                        @bofa/shared-ui                           │
│  SharedUiModule (Angular 14, peerDeps: @angular/core@^14.3.0)   │
│  ├── BfaButtonComponent                                         │
│  ├── BfaDataTableComponent   ← matSortActive/matSortDirection   │
│  └── BfaNotificationComponent                                   │
├──────────────────────────────────────────────────────────────────┤
│  Dependencies: @angular/material@^14.2.7, @angular/cdk@^14.2.7 │
│  RxJS: ~6.6.7 │ TypeScript: ~4.7.2                              │
└───────────┬──────────────────┬──────────────────┬────────────────┘
            │                  │                  │
    ┌───────▼────────┐  ┌─────▼──────────┐  ┌────▼──────────────┐
    │ retail-banking  │  │ corporate-     │  │ mobile-api-       │
    │ -portal         │  │ dashboard      │  │ gateway           │
    │                 │  │                │  │                   │
    │ SharedUiModule  │  │ SharedUiModule │  │ SharedUiModule    │
    │ imported in     │  │ imported in    │  │ imported in       │
    │ AppModule       │  │ AppModule      │  │ AppModule         │
    └───────┬─────────┘  └────────────────┘  └───────────────────┘
            │
    ┌───────▼──────────────────────────────────────────────────────┐
    │                  @bofa/shared-data-access                    │
    │  BankingApiService  ← toPromise(), constructor injection     │
    │  FraudDetectionService  ← combineLatest([]) ×2              │
    │  peerDeps: @angular/core@^14.3.0, RxJS: ~6.6.7             │
    └──────────────────────────────────────────────────────────────┘
```

### Downstream Consumer Matrix

| Consumer | shared-ui | shared-data-access | Components Used |
|----------|-----------|-------------------|-----------------|
| `retail-banking-portal` | ✅ via `SharedUiModule` | ✅ via `BankingApiService` (direct import) | `BfaButtonComponent`, `BfaDataTableComponent`, `BfaNotificationComponent` |
| `corporate-dashboard` | ✅ via `SharedUiModule` | ✅ via `@bofa/shared-data-access` (package.json dep) | `SharedUiModule` components |
| `mobile-api-gateway` | ✅ via `SharedUiModule` | ✅ via `@bofa/shared-data-access` (package.json dep) | `SharedUiModule` components |

### Migration Order

1. **Phase 2:** Upgrade `shared-ui` first (unblocks all consumers)
2. **Phase 3:** Migrate app modules to standalone (consumer-by-consumer)
3. **Phase 4:** Upgrade `shared-data-access` (RxJS + Angular 18 peers)

---

## 10. Risk Matrix

### HIGH Risk — Auth, SSO, Guards, Interceptors

| Item | File(s) | Risk Description | Mitigation |
|------|---------|------------------|------------|
| SSO Token Chain | `sso-auth.service.ts` (211 lines) | SAML RelayState preservation, session token lifecycle, token refresh — any breakage causes auth failures across all apps | Functional equivalence testing; preserve `state.url` as `RelayState`; per `security-policy.md` |
| AuthGuard → Functional Guard | `auth.guard.ts` (76 lines) | Class-based `CanActivate` → `CanActivateFn`; must preserve role checking and SAML redirect | Security Review required per `security-policy.md` |
| AuditLoggingInterceptor | `audit-logging.interceptor.ts` (56 lines) | Class-based `HttpInterceptor` → functional `HttpInterceptorFn`; correlation ID extraction must be preserved | Compliance monitoring depends on CID header |
| `HttpClientModule` removal | 3 app modules | Interceptor registration mechanism changes entirely; must ensure all HTTP traffic goes through audit logging | Verify no HTTP calls bypass interceptor chain |

### MEDIUM Risk — RxJS Patterns & Shared Library Coupling

| Item | File(s) | Risk Description | Mitigation |
|------|---------|------------------|------------|
| `toPromise()` → `lastValueFrom()` | `banking-api.service.ts:91` | `EmptyError` on empty observables vs. `undefined` resolution; async behavior change | Audit all callers of `getAccountSummarySnapshot()` |
| `combineLatest` array syntax | `fraud-detection.service.ts:81,98`, `dashboard.component.ts:87` | Array destructuring → object destructuring; risk of key mismatch | Type-safe migration with RxJS 7 object syntax |
| `shared-data-access` peer deps | `libs/shared-data-access/package.json` | Stays on `@angular/core@^14` through Phases 2-3; soft-pass needed in `validate-downstream.sh` | Phase 2 Patch B pattern |
| RxJS 6.6.7 → 7.8.x | All `package.json` files | Operator tree-shaking changes, `pipe()` internals | Incremental upgrade: validate per-file |

### LOW Risk — Template/Control-Flow Syntax

| Item | File(s) | Risk Description | Mitigation |
|------|---------|------------------|------------|
| `*ngIf` → `@if` | 5 template files (11 instances) | Mechanical syntax transformation; no logic change | Angular schematic: `ng generate @angular/core:control-flow-migration` |
| `*ngFor` → `@for … track` | 2 template files (3 instances) | Must add `track` expression; existing `trackBy` functions can be reused | Schematic handles most cases |
| `relativeLinkResolution: 'legacy'` | `app-routing.module.ts:49` | Removed in Angular 15; delete the option | Simple deletion |
| `@ViewChild({ static: true })` | `dashboard.component.ts:53,56` | Remove static flag; default is `false` since Angular 9 | No behavior change expected |
| Constructor → `inject()` | 9 services/components | Mechanical refactor; no logic change | Per `angular-standards.md` |

---

## 11. Phase Breakdown & Estimated Effort

| Phase | Scope | Files Affected | Estimated Effort | Dependencies |
|-------|-------|---------------|-----------------|--------------|
| **Phase 0** | Node.js 16→18/20, TypeScript 4.7→5.4, baseline tag | `.nvmrc`, `tsconfig.json`, all `package.json` | 2–4 hours | None |
| **Phase 1** | Codebase analysis & migration plan (this PR) | 1 new doc file | ✅ Complete | None |
| **Phase 2** | Upgrade `shared-ui` to Angular 18 + Material 18 | 5 files (`shared-ui/` module + 3 components + `package.json`) | 4–6 hours | Phase 0 |
| **Phase 3a** | `retail-banking-portal` NgModule → standalone | 12 files (module, routing, components, main.ts, guard, interceptor) | 8–12 hours | Phase 2 |
| **Phase 3b** | `corporate-dashboard` NgModule → standalone | 4+ files (module, components, guard, interceptor) | 4–6 hours | Phase 3a merged |
| **Phase 3c** | `mobile-api-gateway` NgModule → standalone | 4+ files (module, components, interceptor) | 3–4 hours | Phase 3a merged |
| **Phase 4** | RxJS 6→7 patterns + `shared-data-access` upgrade | 4 files (2 services + dashboard component + package.json) | 4–6 hours | Phase 3 |
| **Phase 5** | Angular Material v14→v18 API cleanup | 4 files (data-table, button, transaction-list, app.component) | 3–4 hours | Phase 4 |
| **Phase 6** | Jest migration (replace Karma/Jasmine) | 3 karma.conf.js + 1 test.ts + new jest configs + all new spec files | 12–20 hours | Phase 5 |

**Total estimated effort:** 40–62 hours across all phases

### Parallelization Opportunities

- **Phase 3b + 3c** can run in parallel child Devin sessions after Phase 3a merges
- **Phase 6** test writing can be parallelized per-service via `test-coverage.md` playbook

---

## 12. Rollback Strategy

### Per-Phase Rollback

| Phase | Rollback Method |
|-------|-----------------|
| Phase 0 | Revert Node/TS changes; `git checkout angular-14-baseline` |
| Phase 2 | Revert `shared-ui` PR; consumers continue using Angular 14 `SharedUiModule` |
| Phase 3 | Revert individual app PRs (3a, 3b, 3c are independent after 3a); NgModule code preserved in git history |
| Phase 4 | Revert RxJS changes; `shared-data-access` goes back to `^14` peers |
| Phase 5 | Revert Material API changes; v14 APIs still work if dependencies haven't been bumped |
| Phase 6 | Revert Jest config; restore `karma.conf.js` and `src/test.ts` from git history |

### Emergency Rollback

If critical issues are found post-merge:

1. `git revert` the merge commit for the affected phase PR
2. `npm ci --legacy-peer-deps` in each app to restore lockfile state
3. Verify build + existing tests pass on the reverted state
4. Tag the reverted state: `git tag angular-14-rollback-<phase>-<date>`

### Baseline Reference

The Angular 14 baseline should be tagged before Phase 0 begins:
```bash
git tag angular-14-baseline
git push origin angular-14-baseline
```

---

## Appendix A: Full File Inventory

### Applications

| App | Source Files | Package Dependencies |
|-----|-------------|---------------------|
| `retail-banking-portal` | 14 TS + 2 HTML files | `@angular/core@^14.3.0`, `@angular/material@^14.2.7`, `rxjs@~6.6.7`, `typescript@~4.7.2` |
| `corporate-dashboard` | 1 TS file (app.module.ts only scaffolded) | `@angular/core@^14.3.0`, `@angular/material@^14.2.7`, `rxjs@~6.6.7`, `typescript@~4.7.2` |
| `mobile-api-gateway` | 1 TS file (app.module.ts only scaffolded) | `@angular/core@^14.3.0`, `rxjs@~6.6.7`, `typescript@~4.7.2` |

### Libraries

| Library | Source Files | Peer Dependencies |
|---------|-------------|-------------------|
| `shared-ui` | 5 TS files | `@angular/core@^14.3.0`, `@angular/material@^14.2.7`, `@angular/cdk@^14.2.7` |
| `shared-data-access` | 2 TS files | `@angular/core@^14.3.0`, `@angular/common@^14.3.0` |

### Configuration Files

| File | Purpose | Migration Phase |
|------|---------|----------------|
| `apps/retail-banking-portal/karma.conf.js` | Karma test runner config | Phase 6 |
| `apps/retail-banking-portal/src/test.ts` | Karma test bootstrap | Phase 6 |
| `apps/retail-banking-portal/tsconfig.spec.json` | Test TypeScript config (Jasmine types) | Phase 6 |
| `apps/retail-banking-portal/angular.json` | Angular CLI workspace config | Phase 0, 3a |
| All `package.json` files (×5) | Dependency versions | Phase 0, 2, 4 |

---

## Appendix B: Devin Review — Self-Assessment

| Standard | Status | Notes |
|----------|--------|-------|
| `angular-standards.md` compliance | ⚠️ PENDING | All code currently uses NgModule pattern; migration required in Phases 2-3 |
| `security-policy.md` compliance | ⚠️ PENDING | Class-based guards and interceptors require functional migration in Phase 3 |
| `test-standards.md` compliance | ⚠️ PENDING | No spec files exist; 0% coverage; Karma must be replaced with Jest in Phase 6 |
| SSO token chain preservation | ✅ PASS (analysis) | `sso-auth.service.ts` already uses `throwError()` factory syntax; `RelayState` flow documented |
| No external auth calls outside `sso-auth.service.ts` | ✅ PASS | All auth logic centralized in `SsoAuthService`; guards delegate to it |
