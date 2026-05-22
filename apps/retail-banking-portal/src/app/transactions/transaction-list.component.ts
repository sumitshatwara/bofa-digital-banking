import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { SharedUiModule, BfaDataTableComponent, SortState } from '@bofa/shared-ui';
import { Transaction, TransactionFilter, TransactionCategory } from './transaction.model';
import { BankingApiService } from '@bofa/shared-data-access';

@Component({
  selector: 'bofa-transaction-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    SharedUiModule
  ],
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

  private bankingApi = inject(BankingApiService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
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
    console.log('[TransactionList] Flagging transaction for review:', transaction.transactionId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
