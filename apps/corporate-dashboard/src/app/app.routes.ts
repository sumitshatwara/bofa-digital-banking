import { Routes } from '@angular/router';
import { CorporateDashboardComponent } from './corporate-dashboard/corporate-dashboard.component';
import { WireTransferComponent } from './wire-transfer/wire-transfer.component';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'corporate-dashboard', pathMatch: 'full' },
  { path: 'corporate-dashboard', component: CorporateDashboardComponent, canActivate: [authGuard] },
  { path: 'wire-transfer', component: WireTransferComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'corporate-dashboard' }
];
