import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuditLoggingInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const auditedReq = req.clone({
      headers: req.headers.set('X-Client-App', 'corporate-dashboard')
    });
    return next.handle(auditedReq);
  }
}
