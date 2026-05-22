import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BankingApiService, AccountSummary } from '@bofa/shared-data-access';
import { SharedUiModule } from '@bofa/shared-ui';
import { AnalyticsService } from '../analytics/analytics.service';
import { SsoAuthService } from '../auth/sso-auth.service';

export interface DashboardViewModel {
  accounts: AccountSummary[];
  totalBalance: number;
  pendingTransactions: number;
  spendingScore: number;
  alertCount: number;
  isLoading: boolean;
  error: string | null;
}

@Component({
  selector: 'bofa-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
    SharedUiModule
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {

  @ViewChild('balanceSummaryPanel')
  balanceSummaryPanel!: ElementRef<HTMLDivElement>;

  @ViewChild('chartCanvas')
  chartCanvas!: ElementRef<HTMLCanvasElement>;

  viewModel: DashboardViewModel = {
    accounts: [],
    totalBalance: 0,
    pendingTransactions: 0,
    spendingScore: 0,
    alertCount: 0,
    isLoading: true,
    error: null
  };

  private destroy$ = new Subject<void>();

  private bankingApi = inject(BankingApiService);
  private analyticsService = inject(AnalyticsService);
  private authService = inject(SsoAuthService);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.loadDashboardData();
    this.subscribeToRealTimeAlerts();
  }

  private loadDashboardData(): void {
    combineLatest([
      this.bankingApi.getAccountSummaries(),
      this.analyticsService.getSpendingScore()
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([accounts, spendingScore]) => {
          const totalBalance = accounts.reduce((sum, acc) => sum + acc.availableBalance, 0);
          const pendingTransactions = accounts.reduce((sum, acc) => sum + acc.pendingCount, 0);

          this.viewModel = {
            accounts,
            totalBalance,
            pendingTransactions,
            spendingScore,
            alertCount: this.viewModel.alertCount,
            isLoading: false,
            error: null
          };

          this.cdr.markForCheck();
        },
        error: (err) => {
          this.viewModel = {
            ...this.viewModel,
            isLoading: false,
            error: 'Failed to load account data. Please refresh.'
          };
          this.cdr.markForCheck();
        }
      });
  }

  private subscribeToRealTimeAlerts(): void {
    this.bankingApi.getAlertStream()
      .pipe(takeUntil(this.destroy$))
      .subscribe(alertCount => {
        this.viewModel = { ...this.viewModel, alertCount };
        this.cdr.markForCheck();
      });
  }

  trackByAccountId(index: number, account: AccountSummary): string {
    return account.accountId;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
