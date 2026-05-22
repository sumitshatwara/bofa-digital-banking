import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, switchMap } from 'rxjs/operators';
import { FormControl } from '@angular/forms';

import { Transaction, TransactionFilter, TransactionCategory } from './transaction.model';
import { BankingApiService } from '@bofa/shared-data-access';
import { BfaDataTableComponent, SortState } from '@bofa/shared-ui';

/**
 * Transaction List — displays paginated, sortable transaction history.
 *
 * Consumes @bofa/shared-ui BfaDataTableComponent (Angular Material v14).
 *
 * MIGRATION NOTE (Devin — Phase 5):
 *   MatSort binding has changed in Angular Material v18.
 *   Current v14 pattern: [matSortActive] + [matSortDirection] inputs on <mat-table>.
 *   Angular Material v18 pattern uses MatSortModule with matSort directive.
 *   See shared-ui/bfa-data-table migration notes for the full diff.
 *
 * MIGRATION NOTE (Devin — Phase 3):
 *   Add standalone: true; add imports array with MatTableModule, MatSortModule,
 *   MatPaginatorModule, BfaDataTableComponent (standalone export from shared-ui).
 *   Remove from app.module.ts declarations.
 */
@Component({
  selector: 'bofa-transaction-list',
  templateUrl: './transaction-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionListComponent implements OnInit, OnDestroy {

  @ViewChild(MatSort, { static: false }) sort!: MatSort;
  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;
  @ViewChild(BfaDataTableComponent, { static: false }) dataTable!: BfaDataTableComponent;

  displayedColumns: string[] = [
    'transactionDate',
    'merchantName',
    'category',
    'type',
    'amountCents',
    'status',
    'actions'
  ];

  dataSource = new MatTableDataSource<Transaction>([]);
  totalCount = 0;
  isLoading = true;
  error: string | null = null;

  searchControl = new FormControl('');
  activeAccountId: string | null = null;

  readonly categories: TransactionCategory[] = [
    'DINING', 'GROCERIES', 'TRAVEL', 'SHOPPING',
    'UTILITIES', 'HEALTHCARE', 'ENTERTAINMENT', 'TRANSFERS', 'FEES'
  ];

  activeFilter: TransactionFilter = { pageSize: 25, pageIndex: 0 } as any;

  private destroy$ = new Subject<void>();

  // MIGRATION TARGET: Replace constructor injection with inject()
  constructor(
    private bankingApi: BankingApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Read accountId from query params (set by dashboard account card links)
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.activeAccountId = params['accountId'] ?? null;
        this.activeFilter = {
          ...this.activeFilter,
          accountId: this.activeAccountId ?? undefined
        };
        this.loadTransactions();
      });

    // Debounced search
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(searchText => {
        this.activeFilter = { ...this.activeFilter, searchText: searchText ?? undefined };
        this.loadTransactions();
      });
  }

  private loadTransactions(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.bankingApi.getTransactions(this.activeFilter)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.dataSource.data = page.transactions;
          this.totalCount = page.totalCount;
          this.isLoading = false;
          // Wire up sort after data loads (static: false requires this pattern)
          setTimeout(() => {
            if (this.sort) this.dataSource.sort = this.sort;
            if (this.paginator) this.dataSource.paginator = this.paginator;
          });
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Failed to load transactions. Please try again.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onSortChange(sort: SortState): void {
    this.activeFilter = {
      ...this.activeFilter,
      sortField: sort.active,
      sortDirection: sort.direction || undefined
    } as any;
    this.loadTransactions();
  }

  onPageChange(event: any): void {
    this.activeFilter = {
      ...this.activeFilter,
      pageIndex: event.pageIndex,
      pageSize: event.pageSize
    } as any;
    this.loadTransactions();
  }

  flagForReview(transaction: Transaction): void {
    // Opens fraud review modal — delegates to FraudDetectionService
    console.log('[TransactionList] Flagging transaction for review:', transaction.transactionId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
