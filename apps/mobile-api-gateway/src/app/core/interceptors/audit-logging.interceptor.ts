import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs/operators';

function generateCorrelationId(): string {
  return 'cid-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function sanitizeUrl(url: string): string {
  return url.replace(/\/\d{4,}/g, '/***');
}

export const auditLoggingInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId = generateCorrelationId();

  const auditedReq = req.clone({
    headers: req.headers
      .set('X-Correlation-ID', correlationId)
      .set('X-Client-App', 'mobile-api-gateway')
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
