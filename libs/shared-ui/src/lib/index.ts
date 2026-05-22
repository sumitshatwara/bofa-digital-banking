/**
 * @bofa/shared-ui — Public API Barrel Export
 *
 * Angular 14 pattern: consumers import SharedUiModule to access all components.
 *
 * MIGRATION TARGET (Devin — Phase 3):
 *   After standalone migration, consumers import individual components directly:
 *     import { BfaButtonComponent } from '@bofa/shared-ui';
 *     import { BfaDataTableComponent } from '@bofa/shared-ui';
 *   SharedUiModule can remain as a convenience re-export barrel during transition.
 */

// Components
export { BfaButtonComponent } from './button/bfa-button.component';
export type { BfaButtonVariant, BfaButtonSize } from './button/bfa-button.component';

export { BfaDataTableComponent } from './data-table/bfa-data-table.component';
export type { TableColumn, SortState } from './data-table/bfa-data-table.component';

export { BfaNotificationComponent } from './notification-banner/bfa-notification.component';
export type { NotificationType } from './notification-banner/bfa-notification.component';

// NgModule (Angular 14 — deprecated post-Phase 3)
export { SharedUiModule } from './shared-ui.module';
