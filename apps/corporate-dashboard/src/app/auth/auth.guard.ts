import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SsoAuthService } from './sso-auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(SsoAuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    authService.initiateSamlLogin(state.url);
    return false;
  }

  const requiredRole: string | undefined = route.data?.['requiresRole'];
  if (requiredRole && !authService.hasRole(requiredRole)) {
    return router.createUrlTree(['/unauthorized'], {
      queryParams: { returnUrl: state.url }
    });
  }

  return true;
};
