import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface SsoTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  samlAssertionRef: string;
  sessionIndex: string;
  notOnOrAfter: string;
  iat: number;
  exp: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: SsoTokenPayload | null;
  sessionExpiry: Date | null;
}

/**
 * BofA SSO / SAML Authentication Service.
 *
 * SECURITY POLICY (security-policy.md):
 *   - All HTTP interceptors must include audit logging.
 *   - SSO token chain must be preserved across all auth guard migrations.
 *   - No external auth calls outside this service.
 *   - CanActivate must be migrated to functional guards (Phase 3).
 *
 * MIGRATION NOTE (Devin — Phase 3):
 *   Constructor injection (private http: HttpClient) must be replaced with
 *   inject(HttpClient) per angular-standards.md.
 *   Example: private http = inject(HttpClient);
 *   Remove constructor entirely if no other initialization logic remains.
 */
@Injectable({
  providedIn: 'root'
})
export class SsoAuthService {
  private readonly SSO_ENDPOINT = `${environment.ssoBaseUrl}/saml/authenticate`;
  private readonly TOKEN_VALIDATE_URL = `${environment.ssoBaseUrl}/saml/validate`;

  private authState$ = new BehaviorSubject<AuthState>({
    isAuthenticated: false,
    token: null,
    user: null,
    sessionExpiry: null
  });

  private http = inject(HttpClient);

  constructor() {
    this.restoreSessionFromStorage();
  }

  get authState(): Observable<AuthState> {
    return this.authState$.asObservable();
  }

  isAuthenticated(): boolean {
    const state = this.authState$.getValue();
    if (!state.isAuthenticated || !state.sessionExpiry) {
      return false;
    }
    return new Date() < state.sessionExpiry;
  }

  hasRole(role: string): boolean {
    const state = this.authState$.getValue();
    return state.user?.roles?.includes(role) ?? false;
  }

  /**
   * Initiates SAML SP-initiated SSO flow.
   * Redirects user to BofA Identity Provider for authentication.
   * On success, IdP posts SAML assertion back to /auth/saml/callback.
   */
  initiateSamlLogin(relayState?: string): void {
    const params = new URLSearchParams({
      SAMLRequest: this.buildAuthNRequest(),
      RelayState: relayState ?? window.location.pathname
    });
    window.location.href = `${this.SSO_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Validates the SAML assertion returned by the Identity Provider.
   * Extracts JWT token from assertion and stores in auth state.
   */
  validateSamlAssertion(samlResponse: string, relayState: string): Observable<AuthState> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams({ SAMLResponse: samlResponse, RelayState: relayState });

    return this.http.post<{ token: string; payload: SsoTokenPayload }>(
      this.TOKEN_VALIDATE_URL,
      body.toString(),
      { headers }
    ).pipe(
      map(response => {
        const expiry = new Date(response.payload.notOnOrAfter);
        const newState: AuthState = {
          isAuthenticated: true,
          token: response.token,
          user: response.payload,
          sessionExpiry: expiry
        };
        this.authState$.next(newState);
        // NOTE: sessionStorage used here deliberately (not localStorage) —
        // SAML tokens are session-scoped per BofA security policy.
        sessionStorage.setItem('bofa_sso_token', response.token);
        return newState;
      }),
      catchError(err => {
        console.error('[SsoAuthService] SAML assertion validation failed', err);
        return throwError(() => new Error('Authentication failed. Please try again.'));
      })
    );
  }

  /**
   * Refreshes the SSO token before session expiry.
   * Must be called at least 5 minutes before sessionExpiry.
   */
  refreshToken(): Observable<string> {
    const state = this.authState$.getValue();
    if (!state.token) {
      return throwError(() => new Error('No active session to refresh'));
    }

    return this.http.post<{ token: string }>(
      `${environment.ssoBaseUrl}/saml/refresh`,
      { token: state.token }
    ).pipe(
      tap(response => {
        const decoded = this.decodeToken(response.token);
        const updated: AuthState = {
          ...state,
          token: response.token,
          user: decoded,
          sessionExpiry: new Date(decoded.notOnOrAfter)
        };
        this.authState$.next(updated);
        sessionStorage.setItem('bofa_sso_token', response.token);
      }),
      map(r => r.token),
      catchError(err => {
        this.logout();
        return throwError(() => err);
      })
    );
  }

  logout(): void {
    sessionStorage.removeItem('bofa_sso_token');
    this.authState$.next({
      isAuthenticated: false,
      token: null,
      user: null,
      sessionExpiry: null
    });
    // Initiate SAML Single Log Out
    window.location.href = `${environment.ssoBaseUrl}/saml/logout`;
  }

  getToken(): string | null {
    return this.authState$.getValue().token;
  }

  private restoreSessionFromStorage(): void {
    const storedToken = sessionStorage.getItem('bofa_sso_token');
    if (!storedToken) return;

    try {
      const payload = this.decodeToken(storedToken);
      const expiry = new Date(payload.notOnOrAfter);
      if (new Date() < expiry) {
        this.authState$.next({
          isAuthenticated: true,
          token: storedToken,
          user: payload,
          sessionExpiry: expiry
        });
      } else {
        sessionStorage.removeItem('bofa_sso_token');
      }
    } catch {
      sessionStorage.removeItem('bofa_sso_token');
    }
  }

  private decodeToken(token: string): SsoTokenPayload {
    const base64Payload = token.split('.')[1];
    const decoded = atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as SsoTokenPayload;
  }

  private buildAuthNRequest(): string {
    // Simplified AuthNRequest — real impl would use XML signing (xmldsig)
    const request = {
      issuer: environment.samlServiceProviderId,
      destination: this.SSO_ENDPOINT,
      assertionConsumerServiceURL: `${environment.appBaseUrl}/auth/saml/callback`,
      nameIdPolicy: 'urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress',
      requestedAuthnContext: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport'
    };
    return btoa(JSON.stringify(request));
  }
}
