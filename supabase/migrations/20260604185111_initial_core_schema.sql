create extension if not exists pgcrypto with schema extensions;

create type public.transaction_type as enum (
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'dividend',
  'fee'
);

create type public.fundamental_period_type as enum (
  'annual',
  'quarterly',
  'ttm'
);

create type public.stock_label as enum (
  'Attractive',
  'Reasonable',
  'Watch',
  'Expensive',
  'Avoid / Review',
  'Insufficient Data'
);

create type public.portfolio_fit_label as enum (
  'Underweight',
  'Balanced',
  'Overweight',
  'Concentration Risk',
  'Cash Constrained',
  'Do Not Add',
  'Review Position'
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_not_blank check (length(btrim(email)) > 0)
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolios_name_not_blank check (length(btrim(name)) > 0),
  constraint portfolios_base_currency_format check (base_currency ~ '^[A-Z]{3}$'),
  constraint portfolios_id_user_id_key unique (id, user_id)
);

create table public.portfolio_cash (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  amount numeric(20, 4) not null default 0,
  currency text not null default 'USD',
  updated_at timestamptz not null default now(),
  constraint portfolio_cash_amount_non_negative check (amount >= 0),
  constraint portfolio_cash_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint portfolio_cash_portfolio_currency_key unique (portfolio_id, currency)
);

create table public.stocks (
  symbol text primary key,
  name text not null,
  exchange text,
  sector text,
  industry text,
  country text not null default 'US',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stocks_symbol_format check (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  constraint stocks_name_not_blank check (length(btrim(name)) > 0),
  constraint stocks_country_not_blank check (length(btrim(country)) > 0),
  constraint stocks_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  symbol text references public.stocks (symbol) on update cascade,
  transaction_type public.transaction_type not null,
  quantity numeric(20, 6),
  price numeric(20, 6),
  fees numeric(20, 4) not null default 0,
  currency text not null default 'USD',
  transaction_date date not null,
  created_at timestamptz not null default now(),
  constraint transactions_quantity_positive check (quantity is null or quantity > 0),
  constraint transactions_price_non_negative check (price is null or price >= 0),
  constraint transactions_fees_non_negative check (fees >= 0),
  constraint transactions_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  symbol text not null references public.stocks (symbol) on update cascade,
  quantity numeric(20, 6) not null,
  average_cost numeric(20, 6) not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holdings_quantity_positive check (quantity > 0),
  constraint holdings_average_cost_non_negative check (average_cost >= 0),
  constraint holdings_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint holdings_portfolio_symbol_key unique (portfolio_id, symbol)
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  portfolio_id uuid not null,
  symbol text not null references public.stocks (symbol) on update cascade,
  target_price numeric(20, 6),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlist_items_target_price_positive check (
    target_price is null or target_price > 0
  ),
  constraint watchlist_items_portfolio_owner_fk foreign key (portfolio_id, user_id)
    references public.portfolios (id, user_id) on delete cascade,
  constraint watchlist_items_portfolio_symbol_key unique (portfolio_id, symbol)
);

create table public.stock_prices (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.stocks (symbol) on delete cascade on update cascade,
  price_date date not null,
  open numeric(20, 6),
  high numeric(20, 6),
  low numeric(20, 6),
  close numeric(20, 6) not null,
  volume bigint,
  created_at timestamptz not null default now(),
  constraint stock_prices_values_non_negative check (
    (open is null or open >= 0)
    and (high is null or high >= 0)
    and (low is null or low >= 0)
    and close >= 0
  ),
  constraint stock_prices_volume_non_negative check (volume is null or volume >= 0),
  constraint stock_prices_symbol_date_key unique (symbol, price_date)
);

create table public.stock_fundamentals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.stocks (symbol) on delete cascade on update cascade,
  fiscal_period text not null,
  fiscal_year integer not null,
  period_type public.fundamental_period_type not null,
  eps numeric(20, 6),
  book_value_per_share numeric(20, 6),
  pe_ratio numeric(20, 6),
  pb_ratio numeric(20, 6),
  debt_to_equity numeric(20, 6),
  current_ratio numeric(20, 6),
  dividend_yield numeric(20, 6),
  revenue numeric(20, 2),
  net_income numeric(20, 2),
  free_cash_flow numeric(20, 2),
  total_debt numeric(20, 2),
  total_equity numeric(20, 2),
  created_at timestamptz not null default now(),
  constraint stock_fundamentals_period_not_blank check (length(btrim(fiscal_period)) > 0),
  constraint stock_fundamentals_year_reasonable check (fiscal_year between 1900 and 2200),
  constraint stock_fundamentals_symbol_period_key unique (
    symbol,
    fiscal_period,
    fiscal_year,
    period_type
  )
);

create table public.stock_scores (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references public.stocks (symbol) on delete cascade on update cascade,
  scored_at timestamptz not null default now(),
  valuation_score smallint,
  quality_score smallint,
  safety_score smallint,
  market_context_score smallint,
  overall_label public.stock_label not null default 'Insufficient Data',
  explanation_json jsonb not null default '{}'::jsonb,
  constraint stock_scores_valuation_range check (
    valuation_score is null or valuation_score between 0 and 100
  ),
  constraint stock_scores_quality_range check (
    quality_score is null or quality_score between 0 and 100
  ),
  constraint stock_scores_safety_range check (
    safety_score is null or safety_score between 0 and 100
  ),
  constraint stock_scores_market_context_range check (
    market_context_score is null or market_context_score between 0 and 100
  )
);

create table public.portfolio_stock_scores (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  symbol text not null references public.stocks (symbol) on delete cascade on update cascade,
  scored_at timestamptz not null default now(),
  portfolio_fit_label public.portfolio_fit_label not null default 'Review Position',
  allocation_warning text,
  sector_warning text,
  cash_warning text,
  explanation_json jsonb not null default '{}'::jsonb
);

create table public.user_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  max_single_stock_allocation numeric(6, 2) not null default 10,
  max_sector_allocation numeric(6, 2) not null default 30,
  min_margin_of_safety numeric(6, 2) not null default 25,
  max_pe numeric(10, 2) not null default 20,
  max_pb numeric(10, 2) not null default 3,
  min_current_ratio numeric(10, 2) not null default 1.5,
  max_debt_to_equity numeric(10, 2) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_rules_user_key unique (user_id),
  constraint user_rules_allocation_ranges check (
    max_single_stock_allocation > 0
    and max_single_stock_allocation <= 100
    and max_sector_allocation > 0
    and max_sector_allocation <= 100
  ),
  constraint user_rules_thresholds_positive check (
    min_margin_of_safety >= 0
    and max_pe > 0
    and max_pb > 0
    and min_current_ratio >= 0
    and max_debt_to_equity >= 0
  )
);

create table public.ai_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  portfolio_id uuid not null,
  provider text not null,
  model text not null,
  input_snapshot_json jsonb not null,
  output_markdown text not null,
  created_at timestamptz not null default now(),
  token_usage_input integer,
  token_usage_output integer,
  estimated_cost numeric(12, 6),
  constraint ai_takes_provider_not_blank check (length(btrim(provider)) > 0),
  constraint ai_takes_model_not_blank check (length(btrim(model)) > 0),
  constraint ai_takes_output_not_blank check (length(btrim(output_markdown)) > 0),
  constraint ai_takes_token_usage_non_negative check (
    (token_usage_input is null or token_usage_input >= 0)
    and (token_usage_output is null or token_usage_output >= 0)
  ),
  constraint ai_takes_estimated_cost_non_negative check (
    estimated_cost is null or estimated_cost >= 0
  ),
  constraint ai_takes_portfolio_owner_fk foreign key (portfolio_id, user_id)
    references public.portfolios (id, user_id) on delete cascade
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_portfolios_updated_at
  before update on public.portfolios
  for each row execute function public.set_updated_at();

create trigger set_portfolio_cash_updated_at
  before update on public.portfolio_cash
  for each row execute function public.set_updated_at();

create trigger set_stocks_updated_at
  before update on public.stocks
  for each row execute function public.set_updated_at();

create trigger set_holdings_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

create trigger set_watchlist_items_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();

create trigger set_user_rules_updated_at
  before update on public.user_rules
  for each row execute function public.set_updated_at();

create index portfolios_user_id_idx on public.portfolios (user_id);
create index transactions_portfolio_id_idx on public.transactions (portfolio_id);
create index transactions_symbol_idx on public.transactions (symbol);
create index holdings_portfolio_id_idx on public.holdings (portfolio_id);
create index holdings_symbol_idx on public.holdings (symbol);
create index watchlist_items_user_id_idx on public.watchlist_items (user_id);
create index watchlist_items_portfolio_id_idx on public.watchlist_items (portfolio_id);
create index watchlist_items_symbol_idx on public.watchlist_items (symbol);
create index stock_prices_symbol_price_date_idx on public.stock_prices (symbol, price_date desc);
create index stock_fundamentals_symbol_period_idx on public.stock_fundamentals (
  symbol,
  period_type,
  fiscal_year desc,
  fiscal_period
);
create index stock_scores_symbol_scored_at_idx on public.stock_scores (symbol, scored_at desc);
create index portfolio_stock_scores_portfolio_symbol_scored_at_idx
  on public.portfolio_stock_scores (portfolio_id, symbol, scored_at desc);
create index user_rules_user_id_idx on public.user_rules (user_id);
create index ai_takes_user_id_created_at_idx on public.ai_takes (user_id, created_at desc);
create index ai_takes_portfolio_id_created_at_idx on public.ai_takes (
  portfolio_id,
  created_at desc
);

alter table public.users enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_cash enable row level security;
alter table public.stocks enable row level security;
alter table public.transactions enable row level security;
alter table public.holdings enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.stock_prices enable row level security;
alter table public.stock_fundamentals enable row level security;
alter table public.stock_scores enable row level security;
alter table public.portfolio_stock_scores enable row level security;
alter table public.user_rules enable row level security;
alter table public.ai_takes enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant usage on type public.transaction_type to authenticated, service_role;
grant usage on type public.fundamental_period_type to authenticated, service_role;
grant usage on type public.stock_label to anon, authenticated, service_role;
grant usage on type public.portfolio_fit_label to authenticated, service_role;

grant select, insert, update, delete on table
  public.users,
  public.portfolios,
  public.portfolio_cash,
  public.transactions,
  public.holdings,
  public.watchlist_items,
  public.user_rules
to authenticated;

grant select on table
  public.stocks,
  public.stock_prices,
  public.stock_fundamentals,
  public.stock_scores
to anon, authenticated;

grant select on table public.portfolio_stock_scores, public.ai_takes to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
