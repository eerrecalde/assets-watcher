alter table public.stock_scores
add column if not exists user_id uuid references public.users (id) on delete cascade;

create index if not exists stock_scores_user_symbol_scored_at_idx
  on public.stock_scores (user_id, symbol, scored_at desc);

grant insert on table public.stock_scores to authenticated;

drop policy if exists "Market stock scores are readable" on public.stock_scores;

create policy "Users can view applicable stock scores"
on public.stock_scores
for select
to anon, authenticated
using (
  user_id is null
  or user_id = (select auth.uid())
);

create policy "Users can create their own stock scores"
on public.stock_scores
for insert
to authenticated
with check (user_id = (select auth.uid()));
