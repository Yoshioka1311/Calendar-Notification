import type { FinanceCategory, FinanceTransactionType } from './types.ts';

export const SYSTEM_FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 'income-salary', name: 'Salary', iconKey: 'salary', type: 'income', isSystem: true },
  { id: 'income-allowance', name: 'Allowance', iconKey: 'allowance', type: 'income', isSystem: true },
  { id: 'income-refund', name: 'Refund', iconKey: 'refund', type: 'income', isSystem: true },
  { id: 'income-sale', name: 'Sale', iconKey: 'sale', type: 'income', isSystem: true },
  { id: 'income-gift', name: 'Gift', iconKey: 'gift', type: 'income', isSystem: true },
  { id: 'income-transfer', name: 'Transfer Received', iconKey: 'transfer', type: 'income', isSystem: true },
  { id: 'income-investment', name: 'Investment Income', iconKey: 'investment', type: 'income', isSystem: true },
  { id: 'income-other', name: 'Other Income', iconKey: 'other-income', type: 'income', isSystem: true },
  { id: 'expense-food', name: 'Food & Drinks', iconKey: 'food', type: 'expense', isSystem: true },
  { id: 'expense-transport', name: 'Transport', iconKey: 'transport', type: 'expense', isSystem: true },
  { id: 'expense-shopping', name: 'Shopping', iconKey: 'shopping', type: 'expense', isSystem: true },
  { id: 'expense-entertainment', name: 'Entertainment', iconKey: 'entertainment', type: 'expense', isSystem: true },
  { id: 'expense-education', name: 'Education', iconKey: 'education', type: 'expense', isSystem: true },
  { id: 'expense-health', name: 'Health', iconKey: 'health', type: 'expense', isSystem: true },
  { id: 'expense-bills', name: 'Bills', iconKey: 'bills', type: 'expense', isSystem: true },
  { id: 'expense-utilities', name: 'Utilities', iconKey: 'utilities', type: 'expense', isSystem: true },
  { id: 'expense-phone-internet', name: 'Phone / Internet', iconKey: 'phone-internet', type: 'expense', isSystem: true },
  { id: 'expense-subscriptions', name: 'Subscriptions', iconKey: 'subscriptions', type: 'expense', isSystem: true },
  { id: 'expense-housing', name: 'Housing', iconKey: 'housing', type: 'expense', isSystem: true },
  { id: 'expense-travel', name: 'Travel', iconKey: 'travel', type: 'expense', isSystem: true },
  { id: 'expense-personal-care', name: 'Personal Care', iconKey: 'personal-care', type: 'expense', isSystem: true },
  { id: 'expense-gifts', name: 'Gifts', iconKey: 'gifts', type: 'expense', isSystem: true },
  { id: 'expense-gaming', name: 'Gaming', iconKey: 'gaming', type: 'expense', isSystem: true },
  { id: 'expense-family', name: 'Family', iconKey: 'family', type: 'expense', isSystem: true },
  { id: 'expense-fees', name: 'Fees', iconKey: 'fees', type: 'expense', isSystem: true },
  { id: 'expense-misc', name: 'Miscellaneous', iconKey: 'misc', type: 'expense', isSystem: true },
  { id: 'expense-other', name: 'Other', iconKey: 'other-expense', type: 'expense', isSystem: true },
];

export function defaultCategoryId(type: FinanceTransactionType): string {
  return type === 'income' ? 'income-transfer' : 'expense-other';
}

export function categorySupportsType(category: FinanceCategory, type: FinanceTransactionType): boolean {
  return category.type === 'both' || category.type === type;
}
