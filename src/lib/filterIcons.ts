import {
  Home, Store, Building, Building2, Bed, Briefcase, Car, Package, Box,
  DoorOpen, UserCheck, CalendarClock, Bell, Ban, UserMinus, UserPlus,
  FileEdit, FileCheck, FileX, Clock, CircleDot, CircleCheck, CircleSlash, CircleDashed,
  Loader, Pause, Archive, AlertTriangle,
  Droplet, Zap, Thermometer, Hammer, Paintbrush, Wrench, Sparkles, ShieldAlert,
  ArrowDown, Minus, ArrowUp,
  HardHat, Flag, PiggyBank, ShieldCheck, Wallet, Pencil, Undo2, Receipt, Landmark, Shield, Plug, Users, Tag, CheckCircle, FileText,
  type LucideIcon,
} from "lucide-react";

// ---------- Property ----------
export const PROPERTY_TYPE_ICONS: Record<string, LucideIcon> = {
  residential: Home,
  commercial: Store,
  "mixed-use": Building,
};

export const PROPERTY_STATUS_ICONS: Record<string, LucideIcon> = {
  active: CircleCheck,
  inactive: CircleSlash,
};

export const COUNTRY_ICON: LucideIcon = Flag;
export const PROPERTY_ICON: LucideIcon = Building2;

// ---------- Unit ----------
export const UNIT_TYPE_ICONS: Record<string, LucideIcon> = {
  studio: Bed,
  apartment: Building2,
  house: Home,
  office: Briefcase,
  "commercial-unit": Store,
  parking: Car,
  storage: Package,
  other: Box,
};

export const UNIT_OCCUPANCY_ICONS: Record<string, LucideIcon> = {
  vacant: DoorOpen,
  occupied: UserCheck,
  reserved: CalendarClock,
  "under-notice": Bell,
  "move-in-pending": CalendarClock,
  "move-out-scheduled": Bell,
  unavailable: Ban,
  archived: Archive,
};

// ---------- Lease ----------
export const LEASE_STATUS_ICONS: Record<string, LucideIcon> = {
  draft: FileEdit,
  active: FileCheck,
  "under-notice": Bell,
  "overdue-end": Clock,
  ended: FileX,
  terminated: Ban,
};

// ---------- Tenant ----------
export const TENANT_STATUS_ICONS: Record<string, LucideIcon> = {
  active: UserCheck,
  former: UserMinus,
  applicant: UserPlus,
};

// ---------- Maintenance ----------
export const MAINTENANCE_STATUS_ICONS: Record<string, LucideIcon> = {
  open: CircleDot,
  assigned: UserCheck,
  "in-progress": Loader,
  completed: CircleCheck,
  cancelled: Ban,
};

export const MAINTENANCE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  plumbing: Droplet,
  electrical: Zap,
  heating: Thermometer,
  cleaning: Sparkles,
  damage: ShieldAlert,
  general: Wrench,
};

export const PRIORITY_ICONS: Record<string, LucideIcon> = {
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  urgent: AlertTriangle,
};

export const PRIORITY_CLASSES: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-primary",
  high: "text-warning",
  urgent: "text-destructive",
};

// ---------- Vendor ----------
export const VENDOR_STATUS_ICONS: Record<string, LucideIcon> = {
  active: CircleCheck,
  inactive: CircleSlash,
};
export const VENDOR_ICON: LucideIcon = HardHat;

// ---------- Receivables / Payments ----------
export const RECEIVABLE_STATUS_ICONS: Record<string, LucideIcon> = {
  open: CircleDot,
  paid: CircleCheck,
  "partially-paid": CircleDashed,
  overdue: AlertTriangle,
};

export const RECEIPT_STATUS_ICONS: Record<string, LucideIcon> = {
  matched: CircleCheck,
  "partially-matched": CircleDashed,
  unmatched: CircleDot,
  exception: AlertTriangle,
};

export const RECEIVABLE_TYPE_ICONS: Record<string, LucideIcon> = {
  rent: Home,
  charges: Receipt,
  deposit: PiggyBank,
  guarantee: ShieldCheck,
  "advance-payment": Wallet,
  adjustment: Pencil,
  "late-fee": AlertTriangle,
  "repair-recharge": Wrench,
  "credit-note": Undo2,
  other: Tag,
};

// ---------- Cost ----------
export const COST_NATURE_ICONS: Record<string, LucideIcon> = {
  charge: Receipt,
  tax: Landmark,
};

export const COST_SCOPE_ICONS: Record<string, LucideIcon> = {
  property: Building2,
  unit: Home,
  both: Users,
};

export const COST_ENTRY_STATUS_ICONS: Record<string, LucideIcon> = {
  draft: FileEdit,
  active: CheckCircle,
  cancelled: Ban,
  closed: Archive,
};

export const RECOVERY_TYPE_ICONS: Record<string, LucideIcon> = {
  "owner-only": Shield,
  "tenant-recoverable": Users,
  shared: Users,
  mixed: Plug,
};

export const FILE_ICON: LucideIcon = FileText;
export const ICON_PLUG: LucideIcon = Plug;