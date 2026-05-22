import { Routes } from '@angular/router';
import { MobileGatewayStatusComponent } from './gateway-status/mobile-gateway-status.component';

export const routes: Routes = [
  { path: '', component: MobileGatewayStatusComponent },
  { path: '**', redirectTo: '' }
];
