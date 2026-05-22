import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { SsoAuthService } from '../../auth/sso-auth.service';
import { environment } from '../../../environments/environment';

function extractCorrelationId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sessionIndex || generateCorrelationId();
  } catch {
    return generateCorrelationId();
  }
}

function generateCorrelationId(): string {
  return 'cid-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function sanitizeUrl(url: string): string {
  return url.replace(/\/\d{4,}/g, '/***');
}

export const auditLoggingInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(SsoAuthService);
  const correlationId = authService.getToken()
    ? extractCorrelationId(authService.getToken()!)
    : generateCorrelationId();

  const auditedReq = req.clone({
    headers: req.headers
      .set('X-Correlation-ID', correlationId)
      .set('X-Client-App', environment.appName)
  });

  console.info(`[AUDIT] ${req.method} ${sanitizeUrl(req.url)} — CID: ${correlationId}`);

  return next(auditedReq).pipe(
    tap(event => {
      if (event instanceof HttpResponse) {
        console.info(`[AUDIT] Response ${event.status} for ${req.method} ${sanitizeUrl(req.url)} — CID: ${correlationId}`);
      }
    })
  );
};
