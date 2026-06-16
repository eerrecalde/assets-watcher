alter table public.user_rules
  drop constraint if exists user_rules_allocation_ranges,
  drop constraint if exists user_rules_thresholds_positive;

alter table public.user_rules
  add constraint user_rules_threshold_ranges check (
    max_single_stock_allocation > 0
    and max_single_stock_allocation <= 100
    and max_sector_allocation > 0
    and max_sector_allocation <= 100
    and min_margin_of_safety >= 0
    and min_margin_of_safety <= 100
    and max_pe > 0
    and max_pb > 0
    and min_current_ratio > 0
    and max_debt_to_equity >= 0
  );
