import { NgModule } from '@angular/core';
import { RouterModule, Routes, ExtraOptions } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';
import { DashboardComponent } from './dashboard/dashboard.component';
import { TransactionListComponent } from './transactions/transaction-list.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    // MIGRATION TARGET: Replace class-based AuthGuard with functional guard
    // canActivate: [() => inject(SsoAuthService).isAuthenticated()]
    canActivate: [AuthGuard],
    data: { title: 'Dashboard', requiresRole: 'retail-user' }
  },
  {
    path: 'transactions',
    component: TransactionListComponent,
    canActivate: [AuthGuard],
    data: { title: 'Transactions', requiresRole: 'retail-user' }
  },

  {
    path: '**',
    redirectTo: '/dashboard'
  }
];

/**
 * Legacy RouterModule.forRoot with explicit extra options.
 *
 * MIGRATION TARGET (Devin — Phase 3):
 *   Replace this NgModule with provideRouter(routes, withRouterConfig(...))
 *   called inside app.config.ts bootstrapApplication providers array.
 *   enableTracing should be false in production; migrate to withDebugTracing()
 *   only in dev environment.
 */
const routerOptions: ExtraOptions = {
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
  onSameUrlNavigation: 'reload',
  enableTracing: false
};

@NgModule({
  imports: [RouterModule.forRoot(routes, routerOptions)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
