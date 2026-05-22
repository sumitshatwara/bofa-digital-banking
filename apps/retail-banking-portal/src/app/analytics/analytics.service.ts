import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, from } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// Proprietary BofA Analytics SDK — loaded via window global (external bundle)
declare global {
  interface Window {
    BofAAnalyticsSDK: {
      initialize(config: AnalyticsSdkConfig): void;
      trackPageView(page: string, metadata?: Record<string, unknown>): void;
      trackEvent(category: string, action: string, label?: string, value?: number): void;
      getSpendingInsights(accountIds: string[]): Promise<SpendingInsights>;
      setUserId(userId: string): void;
      flush(): Promise<void>;
    };
  }
}

export interface AnalyticsSdkConfig {
  apiKey: string;
  environment: 'production' | 'staging' | 'development';
  sessionSamplingRate: number;
  enablePiiScrubbing: boolean;
  dataCenterRegion: 'us-east' | 'us-west';
}

export interface SpendingInsights {
  spendingScore: number;
  topCategories: Array<{ category: string; totalCents: number; percentOfSpend: number }>;
  monthlyTrend: Array<{ month: string; totalCents: number }>;
  anomalies: Array<{ transactionId: string; reason: string; severity: 'low' | 'medium' | 'high' }>;
}

/**
 * Analytics Service — wraps proprietary BofA Analytics SDK.
 *
 * The SDK is loaded as an external global bundle (window.BofAAnalyticsSDK)
 * to avoid bundling it into the Angular build output.
 * See angular.json scripts[] for the SDK bundle path.
 *
 * MIGRATION NOTE (Devin — Phase 3):
 *   Constructor injection → inject() per angular-standards.md.
 *   Consider wrapping SDK initialization in an APP_INITIALIZER factory.
 *
 * MIGRATION NOTE (Devin — Phase 4):
 *   from(promise).pipe() pattern is correct for Observable wrapping.
 *   No toPromise() usage in this service — already using from() adapter.
 */
@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private sdkInitialized = false;
  private eventQueue: Array<{ category: string; action: string; label?: string }> = [];

  private http = inject(HttpClient);

  constructor() {
    this.initializeSdk();
  }

  private initializeSdk(): void {
    if (typeof window.BofAAnalyticsSDK === 'undefined') {
      console.warn('[AnalyticsService] BofA Analytics SDK not loaded. Events will be queued.');
      return;
    }

    window.BofAAnalyticsSDK.initialize({
      apiKey: environment.analyticsApiKey,
      environment: environment.production ? 'production' : 'development',
      sessionSamplingRate: environment.production ? 0.1 : 1.0,
      enablePiiScrubbing: true,
      dataCenterRegion: 'us-east'
    });

    this.sdkInitialized = true;
    this.flushEventQueue();
  }

  getSpendingScore(): Observable<number> {
    // Falls back to REST API if SDK not available
    if (!this.sdkInitialized) {
      return this.http.get<{ score: number }>(
        `${environment.analyticsApiUrl}/spending-score`
      ).pipe(map(r => r.score));
    }

    return from(
      window.BofAAnalyticsSDK.getSpendingInsights([])
    ).pipe(
      map(insights => insights.spendingScore),
      catchError(() => this.http.get<{ score: number }>(
        `${environment.analyticsApiUrl}/spending-score`
      ).pipe(map(r => r.score)))
    );
  }

  trackPageView(pageName: string, metadata?: Record<string, unknown>): void {
    if (!this.sdkInitialized) {
      this.eventQueue.push({ category: 'pageview', action: pageName });
      return;
    }
    window.BofAAnalyticsSDK.trackPageView(pageName, metadata);
  }

  trackEvent(category: string, action: string, label?: string, value?: number): void {
    if (!this.sdkInitialized) {
      this.eventQueue.push({ category, action, label });
      return;
    }
    window.BofAAnalyticsSDK.trackEvent(category, action, label, value);
  }

  private flushEventQueue(): void {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      window.BofAAnalyticsSDK.trackEvent(event.category, event.action, event.label);
    }
  }
}
