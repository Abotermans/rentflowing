export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getLeaseStatus(startDate: string, endDate: string): "active" | "expired" | "upcoming" {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now < start) return "upcoming";
  if (now > end) return "expired";
  return "active";
}

export function getPaymentStatus(dueDate: string, paidDate: string | null): "paid" | "pending" | "overdue" {
  if (paidDate) return "paid";
  const now = new Date();
  const due = new Date(dueDate);
  return now > due ? "overdue" : "pending";
}
