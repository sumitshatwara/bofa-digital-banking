import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';

export type BfaButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type BfaButtonSize = 'sm' | 'md' | 'lg';

/**
 * BofA Shared UI — Button Component.
 *
 * Angular Material v18 / MD3: ThemePalette color inputs ('primary', 'warn')
 * are replaced with CSS custom properties. Variant styling is applied via
 * BEM classes (bofa-btn--primary, bofa-btn--destructive, etc.).
 */
@Component({
  selector: 'bofa-button',
  template: `
    <button
      [attr.mat-button]="variant === 'ghost' ? '' : null"
      [attr.mat-raised-button]="variant === 'primary' ? '' : null"
      [attr.mat-stroked-button]="variant === 'secondary' ? '' : null"
      [disabled]="disabled || isLoading"
      [class]="'bofa-btn bofa-btn--' + variant + ' bofa-btn--' + size"
      [attr.aria-busy]="isLoading"
      (click)="handleClick($event)"
      type="button">
      <mat-spinner *ngIf="isLoading" diameter="16" class="bofa-btn__spinner"></mat-spinner>
      <ng-content></ng-content>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BfaButtonComponent {
  @Input() variant: BfaButtonVariant = 'primary';
  @Input() size: BfaButtonSize = 'md';
  @Input() disabled = false;
  @Input() isLoading = false;
  @Input() ariaLabel?: string;

  @Output() bfaClick = new EventEmitter<MouseEvent>();

  handleClick(event: MouseEvent): void {
    if (!this.disabled && !this.isLoading) {
      this.bfaClick.emit(event);
    }
  }
}
