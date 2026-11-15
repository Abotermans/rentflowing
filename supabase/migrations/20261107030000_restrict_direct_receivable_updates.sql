-- Payment balances are changed through client_save_receipt_allocations, whose
-- definer context may call the invoker-rights transaction function. Browser
-- users must not edit a paid receivable directly and bypass its allocations.
REVOKE UPDATE ON public.receivable_items FROM PUBLIC, anon, authenticated;
