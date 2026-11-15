-- Billing terms must not silently fall back to a different due date or amount.
ALTER TABLE public.leases
  ADD CONSTRAINT leases_due_day_range_check
    CHECK (due_day_of_month BETWEEN 1 AND 31),
  ADD CONSTRAINT leases_rent_formula_positive_check
    CHECK (rent_formula >= 1),
  ADD CONSTRAINT leases_monthly_amounts_nonnegative_check
    CHECK (monthly_rent >= 0 AND monthly_rent < 'Infinity'::numeric
      AND monthly_charges >= 0 AND monthly_charges < 'Infinity'::numeric),
  ADD CONSTRAINT leases_date_window_check
    CHECK (end_date IS NULL OR end_date >= start_date);
