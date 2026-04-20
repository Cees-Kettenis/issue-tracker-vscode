export function formatDueDate(dueDate?: string): string {
  if (!dueDate) {
    return 'No due date';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!match) {
    return dueDate;
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year.slice(2)}`;
}
