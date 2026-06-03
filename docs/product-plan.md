# Stock Portfolio Intelligence App — Product Plan

## 1. Product Summary

This app is a multi-user stock portfolio intelligence web app focused on US stocks initially.

Users can:

- Track stocks they own.
- Track stocks they want to watch.
- Maintain a manual cash balance.
- View portfolio allocation, exposure, and unrealised gain/loss.
- Click into a stock to see more information.
- Run deterministic Graham-inspired checks.
- Receive soft, educational labels such as `Attractive`, `Reasonable`, `Watch`, `Expensive`, or `Avoid / Review`.
- Generate an optional on-demand AI take based only on the app's current structured portfolio snapshot.

The app is intended to be educational and informative. It should not present itself as a financial adviser or automated trading tool.

The app should say things like:

> Your rules suggest this stock is expensive and your portfolio is already overweight technology.

It should not say things like:

> Buy this stock now.

---

## 2. Core Principle

The deterministic engine is the source of truth.

The AI layer is only an explanation layer.

The user makes the final decision.

```txt
Deterministic engine = facts, calculations, labels, rule checks
AI layer = cautious explanation of those facts
User = final decision maker
```

The AI must not invent market data, financial facts, forecasts, company news, or recommendations.

---

## 3. Initial Scope

The initial prototype should support:

- UK-based user context, but US stocks only initially.
- Manual transactions and manual portfolio tracking.
- Multiple users.
- Daily or weekly market data refresh.
- Deterministic scoring initially.
- Optional on-demand AI take later.
- Low initial cost.

The user will manually execute any real-world buy/sell transactions outside the app.

---

## 4. Recommended Stack

Preferred prototype stack:

```txt
Frontend/backend: Next.js
Language: TypeScript
Auth/database: Supabase
Database: Postgres
Hosting: Vercel
Scheduled jobs: Vercel Cron or Supabase scheduled jobs
Market data: Financial Modeling Prep initially
AI provider: Gemini API initially
Charts: Recharts, Tremor, or lightweight-charts
Styling: Tailwind CSS
```

Why this stack:

- Supabase provides auth, Postgres, and row-level security.
- Postgres fits portfolio data better than NoSQL.
- Next.js keeps frontend, backend routes, and deployment simple.
- Vercel is simple for early deployment.
- This keeps initial cost near zero and allows later upgrades.

---

## 5. Cost Strategy

Initial cost target:

```txt
£0/month if possible
```

Initial services:

- Supabase Free
- Vercel Hobby
- Free market data tier
- Free or cheap AI provider used only on demand

Later budget target:

```txt
£10–£25/month
```

Likely first paid upgrade:

1. Market data provider
2. Supabase
3. Hosting

Cost control rules:

- Cache stock prices and fundamentals.
- Do not fetch market data on every page load.
- Refresh prices daily.
- Refresh fundamentals weekly or monthly.
- Generate AI takes only on demand.
- Store AI takes so users do not regenerate them unnecessarily.
- Add per-user AI rate limits.
- Keep AI prompts compact.

---

## 6. Main User Journeys

### 6.1 Sign up

```txt
User signs up
        ↓
Default portfolio is created
        ↓
User lands on protected dashboard
```

### 6.2 Add an owned stock

```txt
User enters symbol, quantity, average cost, and currency
        ↓
App validates input
        ↓
Holding is added to the user's portfolio
        ↓
Portfolio totals update
```

### 6.3 Add a wanted stock

```txt
User enters stock symbol
        ↓
Stock is added to watchlist
        ↓
App fetches/caches market data if available
        ↓
Watchlist displays score and notes
```

### 6.4 Open stock detail page

```txt
User clicks stock symbol
        ↓
App opens /stocks/[symbol]
        ↓
User sees company, price, fundamentals, score, and portfolio impact
```

### 6.5 Generate AI take

```txt
User clicks "Generate AI Take"
        ↓
Backend builds structured portfolio snapshot
        ↓
Backend sends snapshot to AI provider
        ↓
AI returns cautious educational summary
        ↓
Result is stored and displayed
```

---

## 7. Pages

### 7.1 Dashboard

Show:

- Total portfolio value
- Cash balance
- Holdings count
- Unrealised gain/loss
- Top holdings
- Sector allocation
- Stocks needing review
- Watchlist opportunities
- Latest AI take, if generated

### 7.2 Holdings Page

Table columns:

- Symbol
- Company
- Quantity
- Average cost
- Latest cached price
- Market value
- Unrealised gain/loss
- Portfolio %
- Stock label
- Portfolio fit label

### 7.3 Watchlist Page

Table columns:

- Symbol
- Company
- Current/latest cached price
- Target price
- Graham-style label
- Margin of safety
- Notes

### 7.4 Stock Detail Page

Route:

```txt
/stocks/[symbol]
```

Show:

- Company profile
- Sector and industry
- Latest cached price
- Price chart
- Recent price movement
- 52-week high/low if available
- User holding summary if owned
- Watchlist status if watched
- Key fundamentals
- Graham-inspired score
- Portfolio fit score
- Rule-by-rule explanation

### 7.5 Rules / Settings Page

Allow users to configure:

- Max P/E
- Max P/B
- Minimum margin of safety
- Minimum current ratio
- Max debt/equity
- Max single-stock allocation
- Max sector allocation

Include a reset-to-defaults action.

### 7.6 AI Take Section

Show:

- Generated timestamp
- AI provider/model
- Portfolio snapshot date
- AI narrative
- Underlying deterministic facts
- Disclaimer / limitation text

---

## 8. Data Model

Suggested core tables:

```sql
users
  id
  email
  created_at

portfolios
  id
  user_id
  name
  base_currency
  created_at

portfolio_cash
  id
  portfolio_id
  amount
  currency
  updated_at

transactions
  id
  portfolio_id
  symbol
  transaction_type -- buy, sell, deposit, withdrawal, dividend, fee
  quantity
  price
  fees
  currency
  transaction_date
  created_at

holdings
  id
  portfolio_id
  symbol
  quantity
  average_cost
  currency
  created_at
  updated_at

watchlist_items
  id
  user_id
  portfolio_id
  symbol
  target_price
  notes
  created_at

stocks
  symbol
  name
  exchange
  sector
  industry
  country
  currency
  created_at
  updated_at

stock_prices
  id
  symbol
  price_date
  open
  high
  low
  close
  volume
  created_at

stock_fundamentals
  id
  symbol
  fiscal_period
  fiscal_year
  period_type -- annual, quarterly, ttm
  eps
  book_value_per_share
  pe_ratio
  pb_ratio
  debt_to_equity
  current_ratio
  dividend_yield
  revenue
  net_income
  free_cash_flow
  total_debt
  total_equity
  created_at

stock_scores
  id
  symbol
  scored_at
  valuation_score
  quality_score
  safety_score
  market_context_score
  overall_label
  explanation_json

portfolio_stock_scores
  id
  portfolio_id
  symbol
  scored_at
  portfolio_fit_label
  allocation_warning
  sector_warning
  cash_warning
  explanation_json

user_rules
  id
  user_id
  max_single_stock_allocation
  max_sector_allocation
  min_margin_of_safety
  max_pe
  max_pb
  min_current_ratio
  max_debt_to_equity
  created_at
  updated_at

ai_takes
  id
  user_id
  portfolio_id
  provider
  model
  input_snapshot_json
  output_markdown
  created_at
  token_usage_input
  token_usage_output
  estimated_cost
```

For early milestones, this can be implemented incrementally.

---

## 9. Security and Privacy

Required from v1:

- Use Supabase Row Level Security.
- Users can only access their own portfolios.
- Users can only access their own holdings.
- Users can only access their own watchlist items.
- Users can only access their own AI takes.
- API keys must never be exposed to the browser.
- Market data and AI provider calls must happen server-side.
- Do not send unnecessary personal data to AI providers.

AI privacy rule:

Send only a compact portfolio snapshot to the AI provider.

Do not send:

- User email
- Full name
- Raw transaction history unless strictly needed
- Sensitive personal notes
- Unnecessary account metadata

---

## 10. Deterministic Scoring Engine

The app should not produce one unexplained magic score.

Use separate scoring layers:

```txt
1. Valuation score
2. Business quality score
3. Financial safety score
4. Market context score
5. Portfolio fit score
```

### 10.1 Stock-level labels

Use:

```txt
Attractive
Reasonable
Watch
Expensive
Avoid / Review
Insufficient Data
```

### 10.2 Portfolio-fit labels

Use:

```txt
Underweight
Balanced
Overweight
Concentration Risk
Cash Constrained
Do Not Add
Review Position
```

### 10.3 Combined output examples

```txt
AAPL
Stock label: Expensive
Portfolio fit: Do Not Add
Reason: Valuation above threshold and technology allocation already high.

GOOGL
Stock label: Reasonable
Portfolio fit: Balanced
Reason: Passes quality checks, acceptable valuation, and allocation is within limits.

NVDA
Stock label: Expensive
Portfolio fit: Concentration Risk
Reason: Strong business quality, but valuation and portfolio concentration are both high.
```

---

## 11. Graham-Inspired Rules

Default user rules:

```txt
max_pe = 20
max_pb = 3
min_margin_of_safety = 25%
min_current_ratio = 1.5
max_debt_to_equity = 1.0
max_single_stock_allocation = 10%
max_sector_allocation = 30%
```

These should be configurable by the user.

### 11.1 Graham Number

Formula:

```txt
Graham Number = sqrt(22.5 × EPS × Book Value Per Share)
```

Only calculate this when EPS and book value per share are positive and available.

### 11.2 Margin of Safety

Example:

```txt
margin_of_safety = (estimated_value - current_price) / estimated_value
```

If current price is above estimated value, margin of safety is negative.

### 11.3 Important limitation

Classic Graham checks can be very strict and may not fit all modern companies, especially asset-light software businesses.

The app should say:

```txt
Fails classic Graham valuation checks.
```

It should not say:

```txt
Bad company.
```

---

## 12. Scoring Layers

### 12.1 Valuation Score

Inputs:

- P/E ratio
- P/B ratio
- Graham Number
- Current/latest cached price
- EPS
- Book value per share
- Margin of safety

Example interpretation:

- Price below Graham Number with sufficient margin of safety: attractive.
- Price near Graham Number: reasonable/watch.
- Price above Graham Number: expensive.

### 12.2 Business Quality Score

Inputs:

- Positive EPS
- Positive net income
- Positive free cash flow
- Revenue stability/growth
- Earnings stability
- Optional dividend consistency

### 12.3 Financial Safety Score

Inputs:

- Debt/equity
- Current ratio
- Free cash flow
- Total debt
- Total equity

Example rules:

- Current ratio above 1.5 is good.
- Debt/equity below 1.0 is good.
- Positive free cash flow is good.

### 12.4 Market Context Score

This should provide context, not trading signals.

Inputs:

- 1-week movement
- 1-month movement
- 6-month movement
- 1-year movement
- 52-week high
- 52-week low
- 50-day moving average
- 200-day moving average

Example output:

```txt
Price is down 18% from its 52-week high, but valuation remains above the user's threshold.
```

### 12.5 Portfolio Fit Score

Inputs:

- Holding value
- Portfolio percentage
- Sector percentage
- Cash percentage
- User allocation rules
- Existing exposure

Example rules:

- If stock allocation is above max single-stock allocation: Overweight.
- If sector allocation is above max sector allocation: Concentration Risk.
- If cash is too low to add meaningfully: Cash Constrained.
- If watchlist stock improves diversification and passes checks: Better fit.

---

## 13. AI Take

The AI feature should be on demand only.

Button:

```txt
Generate AI Take
```

### 13.1 AI provider

Initial provider:

```txt
Gemini API
```

Implementation should use a provider abstraction so the app can later support:

- Gemini
- OpenAI
- OpenRouter
- Groq
- Local/open models

### 13.2 AI input

Send a compact structured snapshot, not raw database dumps.

Example:

```json
{
  "portfolio": {
    "total_value": 25000,
    "cash_percentage": 12,
    "largest_positions": [
      {
        "symbol": "NVDA",
        "portfolio_percentage": 24,
        "stock_label": "Expensive",
        "portfolio_fit": "Concentration Risk"
      }
    ],
    "sector_allocation": [
      {
        "sector": "Technology",
        "percentage": 58
      }
    ]
  },
  "rules": {
    "max_single_stock_allocation": 10,
    "max_sector_allocation": 30,
    "min_margin_of_safety": 25
  },
  "watchlist": [
    {
      "symbol": "GOOGL",
      "label": "Reasonable",
      "reason": "Acceptable valuation and strong earnings quality"
    }
  ]
}
```

### 13.3 AI prompt constraints

The prompt must include:

```txt
You are generating an educational portfolio review.

Use only the structured data provided.
Do not invent financial facts, prices, forecasts, news, or company information.
Do not give personalised financial advice.
Do not say "buy", "sell", or "you should".
Use cautious language such as:
- your rules suggest
- consider reviewing
- this may indicate
- this could be worth watching

Explain:
1. Overall portfolio posture
2. Concentration risks
3. Stocks worth reviewing
4. Watchlist opportunities
5. Cash and allocation observations
6. Key limitations

Keep the answer concise, practical, and grounded in the provided data.
```

### 13.4 AI output sections

Preferred output sections:

- Overall take
- Main risks
- Stocks to review
- Watchlist opportunities
- Cash/allocation view
- Limitations

### 13.5 Store AI output

Always store:

- Input snapshot
- Output markdown
- Provider
- Model
- Timestamp
- Token usage if available
- Estimated cost if available

---

## 14. Data Refresh Strategy

Because the app is for mid/long-term investing, daily or weekly data is enough.

Recommended v1 refresh plan:

```txt
Prices: daily
Fundamentals: weekly or monthly
Company profiles: first add, then monthly
Scores: after data refresh and after portfolio changes
AI take: on demand only
```

Avoid:

- Fetching live prices on every page load.
- Running AI automatically.
- Refreshing fundamentals every hour.
- Pretending the data is real-time unless it actually is.

---

## 15. Milestones

### Milestone 0 — Project Foundation

Goal: create the base app skeleton.

Includes:

- Next.js + TypeScript + Tailwind setup
- Supabase client configuration
- Auth flow
- Protected dashboard route
- Initial database migrations
- Row Level Security policies
- README setup instructions

Done when:

```txt
A user can sign up, log in, and see a protected empty dashboard.
```

### Milestone 1 — Manual Portfolio Tracker

Goal: allow users to manually track holdings and cash.

Includes:

- Default portfolio creation
- Holdings CRUD
- Cash balance editing
- Holdings table
- Basic portfolio totals
- Portfolio calculation tests

Done when:

```txt
A user can enter stocks manually and see basic portfolio totals.
```

### Milestone 2 — Market Data Cache

Goal: fetch and cache stock/company data.

Includes:

- Market data provider interface
- Financial Modeling Prep provider
- Cached company profile data
- Cached latest prices
- Historical daily prices
- Manual symbol refresh
- Scheduled refresh endpoint
- Missing-data handling

Done when:

```txt
A user can add a US stock symbol and the app can fetch/cache basic data.
```

### Milestone 3 — Stock Detail Pages

Goal: make stocks clickable and useful.

Includes:

- `/stocks/[symbol]` route
- Company profile
- Latest cached price
- User holding summary
- Price chart
- Recent price movement
- Fundamentals section
- Insufficient-data states

### Milestone 4 — Watchlist

Goal: track wanted stocks separately.

Includes:

- Watchlist CRUD
- Target price
- Notes
- Watchlist table
- Links to stock detail pages
- Watchlist section on dashboard

### Milestone 5 — Deterministic Graham Scoring

Goal: score stocks using explainable rules.

Includes:

- Scoring module structure
- Graham Number calculation
- Valuation score
- Quality score
- Safety score
- Market context score
- Stock labels
- Score snapshots
- Rule-by-rule explanation
- Unit tests

### Milestone 6 — Portfolio-Aware Scoring

Goal: combine stock quality with portfolio context.

Includes:

- Position allocation %
- Sector allocation %
- Cash %
- Portfolio fit labels
- Portfolio score snapshots
- Combined stock + portfolio label
- Unit tests

### Milestone 7 — User Rules

Goal: users can customise thresholds.

Includes:

- Default user rules
- Settings page
- Editable valuation thresholds
- Editable allocation thresholds
- Reset to defaults
- Recalculate scores after rule changes
- Validation

### Milestone 8 — On-Demand AI Take

Goal: generate a cautious educational portfolio explanation.

Includes:

- AI provider interface
- Gemini provider
- Portfolio snapshot generator
- AI prompt template
- Generate AI Take button
- Store AI take result
- Display latest AI take
- Per-user AI rate limit
- Failure handling

### Milestone 9 — Review Queue and Alerts

Goal: tell the user what needs attention.

Includes:

- Dashboard review queue
- Flag stocks above allocation threshold
- Flag stocks below target price
- Flag score changes
- Flag watchlist opportunities
- Alert preferences

---

## 16. Initial GitHub Issues

### Milestone 0 — Project Foundation

```txt
#1 Set up Next.js app with TypeScript and Tailwind
#2 Configure Supabase client and environment variables
#3 Implement authentication flow
#4 Create protected dashboard route
#5 Add initial database schema migrations
#6 Add Supabase Row Level Security policies
#7 Add README setup instructions
```

### Milestone 1 — Manual Portfolio Tracker

```txt
#8 Create default portfolio for new users
#9 Add holdings CRUD
#10 Add cash balance editing
#11 Build holdings table
#12 Calculate basic portfolio totals
#13 Add portfolio calculation tests
```

### Milestone 2 — Market Data Cache

```txt
#14 Create market data provider interface
#15 Add Financial Modeling Prep provider
#16 Store company profile data
#17 Store latest price data
#18 Store daily historical prices
#19 Add manual symbol refresh action
#20 Add scheduled refresh endpoint
#21 Handle missing/limited market data gracefully
```

---

## 17. Codex Usage Guidelines

Codex should work issue by issue.

Do not ask Codex to build the whole app in one task.

Use this instruction pattern:

```txt
Read docs/product-plan.md first.
Implement only the requested issue.
Keep changes small and reviewable.
Do not add unrelated features.
Add or update tests where practical.
Update README if setup or behavior changes.
Explain assumptions in the final summary.
```

For example:

```txt
Implement issue #9: Add holdings CRUD.

Read docs/product-plan.md first.
Do not implement market data, scoring, watchlist, or AI.
Keep the change small and reviewable.
Add tests where practical.
```

---

## 18. Out of Scope for Early MVP

Do not implement in the early prototype:

- Broker integration
- Automatic trading
- Direct buy/sell recommendations
- UK tax handling
- Dividends
- Options
- Crypto
- ETFs
- Realtime data
- Mobile app
- Complex backtesting
- AI chat over the full portfolio
- News-based recommendations
- Sentiment analysis

These can be considered later only after the deterministic prototype is useful.

---

## 19. Product Language Rules

Use cautious language:

```txt
Your rules suggest...
This may indicate...
Consider reviewing...
This appears expensive under your configured thresholds...
This stock fails classic Graham valuation checks...
This position may create concentration risk...
```

Avoid directive language:

```txt
Buy this.
Sell this.
You should buy.
You should sell.
This will go up.
This will go down.
Guaranteed.
```

---

## 20. Definition of a Successful Prototype

The prototype is successful when a user can:

- Sign up and log in.
- Add 10 owned or watched US stocks.
- See current portfolio value and allocation.
- Click each stock for useful detail.
- See deterministic Graham-inspired checks.
- Understand why each stock has its label.
- Generate one AI take that accurately summarizes the portfolio.
- Use the app to think more clearly before making manual investment decisions.

The app's job is not to make the decision.

The app's job is to make the decision process more structured, visible, and disciplined.
