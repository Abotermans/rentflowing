export type MaintenanceCategory = "plumbing" | "electrical" | "heating" | "cleaning" | "damage" | "general";
export type MaintenancePriority = "low" | "medium" | "high" | "urgent";
export type MaintenanceStatus = "open" | "assigned" | "in-progress" | "completed" | "cancelled";

export interface MaintenanceTicket {
  id: string;
  title: string;
  description: string;
  propertyId: string;
  unitId: string;
  tenantId: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  createdDate: string;
  scheduledDate: string | null;
  completedDate: string | null;
  assignedVendorId: string | null;
  internalNotes: string;
  residentVisibleNotes: string;
}

export type VendorStatus = "active" | "inactive";

export interface Vendor {
  id: string;
  vendorName: string;
  tradeCategory: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  status: VendorStatus;
}

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  heating: "Heating",
  cleaning: "Cleaning",
  damage: "Damage",
  general: "General",
};

export const MAINTENANCE_PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

import type { TranslationKey } from "@/i18n/translations";

export const MAINTENANCE_CATEGORY_KEYS: Record<MaintenanceCategory, TranslationKey> = {
  plumbing: "maintenance.cat.plumbing",
  electrical: "maintenance.cat.electrical",
  heating: "maintenance.cat.heating",
  cleaning: "maintenance.cat.cleaning",
  damage: "maintenance.cat.damage",
  general: "maintenance.cat.general",
};

export const MAINTENANCE_PRIORITY_KEYS: Record<MaintenancePriority, TranslationKey> = {
  low: "status.low",
  medium: "status.medium",
  high: "status.high",
  urgent: "status.urgent",
};

export const MAINTENANCE_STATUS_KEYS: Record<MaintenanceStatus, TranslationKey> = {
  open: "status.open",
  assigned: "status.assigned",
  "in-progress": "status.inProgress",
  completed: "status.completed",
  cancelled: "status.cancelled",
};

export const TRADE_CATEGORIES = [
  "Plumbing", "Electrical", "Heating & HVAC", "Cleaning", "General Maintenance",
  "Painting", "Locksmith", "Carpentry", "Roofing", "Landscaping",
];
