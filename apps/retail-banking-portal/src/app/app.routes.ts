import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { DashboardComponent } from './dashboard/dashboard.component';
import { TransactionListComponent } from './transactions/transaction-list.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    data: { title: 'Dashboard', requiresRole: 'retail-user' }
  },
  {
    path: 'transactions',
    component: TransactionListComponent,
    canActivate: [authGuard],
    data: { title: 'Transactions', requiresRole: 'retail-user' }
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
