import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SsoAuthService {
  isAuthenticated(): boolean {
    return false;
  }

  hasRole(role: string): boolean {
    return false;
  }

  initiateSamlLogin(returnUrl: string): void {
    window.location.href = `https://sso.bankofamerica.internal/saml/login?RelayState=${encodeURIComponent(returnUrl)}`;
  }

  getToken(): string | null {
    return null;
  }
}
