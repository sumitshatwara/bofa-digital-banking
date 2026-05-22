import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  OnInit,
  AfterViewInit,
  ChangeDetectionStrategy
} from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort, SortDirection } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';

export interface TableColumn<T = any> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  formatter?: (value: any, row: T) => string;
}

export interface SortState {
  active: string;
  direction: SortDirection;
}

/**
 * BofA Shared Data Table — wraps Angular Material mat-table with sort.
 *
 * Angular Material v18: [matSortActive] and [matSortDirection] template
 * bindings removed. Sort state is initialized programmatically in
 * ngAfterViewInit via MatSort instance properties.
 */
@Component({
  selector: 'bofa-data-table',
  template: `
    <div class="bofa-table-wrapper" [class.bofa-table--loading]="isLoading">
      <table
        mat-table
        [dataSource]="dataSource"
        matSort
        (matSortChange)="onSortChange($event)"
        [attr.aria-label]="ariaLabel"
        class="bofa-data-table">

        <ng-container *ngFor="let col of columns" [matColumnDef]="col.key">
          <th
            mat-header-cell
            *matHeaderCellDef
            [mat-sort-header]="col.sortable ? col.key : ''"
            [disabled]="!col.sortable"
            [style.width]="col.width"
            [style.text-align]="col.align || 'left'">
            {{ col.header }}
          </th>
          <td
            mat-cell
            *matCellDef="let row"
            [style.text-align]="col.align || 'left'">
            {{ col.formatter ? col.formatter(row[col.key], row) : row[col.key] }}
          </td>
        </ng-container>

        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef>Actions</th>
          <td mat-cell *matCellDef="let row">
            <ng-container *ngTemplateOutlet="actionsTemplate; context: { $implicit: row }">
            </ng-container>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns; sticky: true"></tr>
        <tr
          mat-row
          *matRowDef="let row; columns: displayedColumns"
          [class.bofa-table__row--selected]="row === selectedRow"
          (click)="selectRow(row)">
        </tr>

        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell bofa-table__empty" [attr.colspan]="displayedColumns.length">
            <div class="bofa-table__empty-state">
              <span>No records found</span>
            </div>
          </td>
        </tr>
      </table>

      <mat-paginator
        *ngIf="showPaginator"
        [length]="totalCount"
        [pageSize]="pageSize"
        [pageSizeOptions]="[10, 25, 50, 100]"
        (page)="onPageChange($event)"
        showFirstLastButtons
        aria-label="Select page">
      </mat-paginator>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BfaDataTableComponent implements OnInit, AfterViewInit {
  @Input() columns: TableColumn[] = [];
  @Input() dataSource = new MatTableDataSource<any>([]);
  @Input() displayedColumns: string[] = [];
  @Input() totalCount = 0;
  @Input() pageSize = 25;
  @Input() isLoading = false;
  @Input() showPaginator = true;
  @Input() ariaLabel = 'Data table';
  @Input() actionsTemplate: any;

  @Input() initialSortColumn = '';
  @Input() initialSortDirection: SortDirection = 'desc';

  @Output() sortChange = new EventEmitter<SortState>();
  @Output() pageChange = new EventEmitter<any>();
  @Output() rowSelect = new EventEmitter<any>();

  @ViewChild(MatSort, { static: false }) sort!: MatSort;
  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;

  selectedRow: any = null;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    if (this.sort) {
      if (this.initialSortColumn) {
        this.sort.active = this.initialSortColumn;
        this.sort.direction = this.initialSortDirection;
      }
      this.dataSource.sort = this.sort;
    }
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  onSortChange(sortState: SortState): void {
    this.sortChange.emit(sortState);
  }

  onPageChange(event: any): void {
    this.pageChange.emit(event);
  }

  selectRow(row: any): void {
    this.selectedRow = this.selectedRow === row ? null : row;
    this.rowSelect.emit(this.selectedRow);
  }
}
