export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ai_takes: {
        Row: {
          created_at: string;
          estimated_cost: string | null;
          id: string;
          input_snapshot_json: Json;
          model: string;
          output_markdown: string;
          portfolio_id: string;
          provider: string;
          token_usage_input: number | null;
          token_usage_output: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          estimated_cost?: string | null;
          id?: string;
          input_snapshot_json: Json;
          model: string;
          output_markdown: string;
          portfolio_id: string;
          provider: string;
          token_usage_input?: number | null;
          token_usage_output?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          estimated_cost?: string | null;
          id?: string;
          input_snapshot_json?: Json;
          model?: string;
          output_markdown?: string;
          portfolio_id?: string;
          provider?: string;
          token_usage_input?: number | null;
          token_usage_output?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_takes_portfolio_owner_fk";
            columns: ["portfolio_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "ai_takes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      holdings: {
        Row: {
          id: string;
          portfolio_id: string;
          symbol: string;
          quantity: string;
          average_cost: string;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          symbol: string;
          quantity: string;
          average_cost: string;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          portfolio_id?: string;
          symbol?: string;
          quantity?: string;
          average_cost?: string;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "holdings_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "holdings_symbol_fkey";
            columns: ["symbol"];
            isOneToOne: false;
            referencedRelation: "stocks";
            referencedColumns: ["symbol"];
          },
        ];
      };
      portfolio_cash: {
        Row: {
          amount: string;
          currency: string;
          id: string;
          portfolio_id: string;
          updated_at: string;
        };
        Insert: {
          amount?: string;
          currency?: string;
          id?: string;
          portfolio_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: string;
          currency?: string;
          id?: string;
          portfolio_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_cash_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
        ];
      };
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          base_currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "portfolios_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stocks: {
        Row: {
          symbol: string;
          name: string;
          exchange: string | null;
          sector: string | null;
          industry: string | null;
          country: string;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          symbol: string;
          name: string;
          exchange?: string | null;
          sector?: string | null;
          industry?: string | null;
          country?: string;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          symbol?: string;
          name?: string;
          exchange?: string | null;
          sector?: string | null;
          industry?: string | null;
          country?: string;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_fundamentals: {
        Row: {
          id: string;
          symbol: string;
          fiscal_period: string;
          fiscal_year: number;
          period_type: Database["public"]["Enums"]["fundamental_period_type"];
          eps: string | null;
          book_value_per_share: string | null;
          pe_ratio: string | null;
          pb_ratio: string | null;
          debt_to_equity: string | null;
          current_ratio: string | null;
          dividend_yield: string | null;
          revenue: string | null;
          net_income: string | null;
          free_cash_flow: string | null;
          total_debt: string | null;
          total_equity: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          fiscal_period: string;
          fiscal_year: number;
          period_type: Database["public"]["Enums"]["fundamental_period_type"];
          eps?: string | null;
          book_value_per_share?: string | null;
          pe_ratio?: string | null;
          pb_ratio?: string | null;
          debt_to_equity?: string | null;
          current_ratio?: string | null;
          dividend_yield?: string | null;
          revenue?: string | null;
          net_income?: string | null;
          free_cash_flow?: string | null;
          total_debt?: string | null;
          total_equity?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          fiscal_period?: string;
          fiscal_year?: number;
          period_type?: Database["public"]["Enums"]["fundamental_period_type"];
          eps?: string | null;
          book_value_per_share?: string | null;
          pe_ratio?: string | null;
          pb_ratio?: string | null;
          debt_to_equity?: string | null;
          current_ratio?: string | null;
          dividend_yield?: string | null;
          revenue?: string | null;
          net_income?: string | null;
          free_cash_flow?: string | null;
          total_debt?: string | null;
          total_equity?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_fundamentals_symbol_fkey";
            columns: ["symbol"];
            isOneToOne: false;
            referencedRelation: "stocks";
            referencedColumns: ["symbol"];
          },
        ];
      };
      user_rules: {
        Row: {
          created_at: string;
          id: string;
          max_debt_to_equity: string;
          max_pb: string;
          max_pe: string;
          max_sector_allocation: string;
          max_single_stock_allocation: string;
          min_current_ratio: string;
          min_margin_of_safety: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          max_debt_to_equity?: string;
          max_pb?: string;
          max_pe?: string;
          max_sector_allocation?: string;
          max_single_stock_allocation?: string;
          min_current_ratio?: string;
          min_margin_of_safety?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          max_debt_to_equity?: string;
          max_pb?: string;
          max_pe?: string;
          max_sector_allocation?: string;
          max_single_stock_allocation?: string;
          min_current_ratio?: string;
          min_margin_of_safety?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_rules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      watchlist_items: {
        Row: {
          id: string;
          user_id: string;
          portfolio_id: string;
          symbol: string;
          target_price: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          portfolio_id: string;
          symbol: string;
          target_price?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          portfolio_id?: string;
          symbol?: string;
          target_price?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watchlist_items_portfolio_owner_fk";
            columns: ["portfolio_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "watchlist_items_symbol_fkey";
            columns: ["symbol"];
            isOneToOne: false;
            referencedRelation: "stocks";
            referencedColumns: ["symbol"];
          },
          {
            foreignKeyName: "watchlist_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_prices: {
        Row: {
          id: string;
          symbol: string;
          price_date: string;
          open: string | null;
          high: string | null;
          low: string | null;
          close: string;
          volume: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          price_date: string;
          open?: string | null;
          high?: string | null;
          low?: string | null;
          close: string;
          volume?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          price_date?: string;
          open?: string | null;
          high?: string | null;
          low?: string | null;
          close?: string;
          volume?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_prices_symbol_fkey";
            columns: ["symbol"];
            isOneToOne: false;
            referencedRelation: "stocks";
            referencedColumns: ["symbol"];
          },
        ];
      };
      stock_scores: {
        Row: {
          id: string;
          symbol: string;
          user_id: string | null;
          scored_at: string;
          valuation_score: number | null;
          quality_score: number | null;
          safety_score: number | null;
          market_context_score: number | null;
          overall_label: Database["public"]["Enums"]["stock_label"];
          explanation_json: Json;
        };
        Insert: {
          id?: string;
          symbol: string;
          user_id?: string | null;
          scored_at?: string;
          valuation_score?: number | null;
          quality_score?: number | null;
          safety_score?: number | null;
          market_context_score?: number | null;
          overall_label?: Database["public"]["Enums"]["stock_label"];
          explanation_json?: Json;
        };
        Update: {
          id?: string;
          symbol?: string;
          user_id?: string | null;
          scored_at?: string;
          valuation_score?: number | null;
          quality_score?: number | null;
          safety_score?: number | null;
          market_context_score?: number | null;
          overall_label?: Database["public"]["Enums"]["stock_label"];
          explanation_json?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "stock_scores_symbol_fkey";
            columns: ["symbol"];
            isOneToOne: false;
            referencedRelation: "stocks";
            referencedColumns: ["symbol"];
          },
          {
            foreignKeyName: "stock_scores_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      portfolio_stock_scores: {
        Row: {
          id: string;
          portfolio_id: string;
          symbol: string;
          scored_at: string;
          portfolio_fit_label: Database["public"]["Enums"]["portfolio_fit_label"];
          allocation_warning: string | null;
          sector_warning: string | null;
          cash_warning: string | null;
          explanation_json: Json;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          symbol: string;
          scored_at?: string;
          portfolio_fit_label?: Database["public"]["Enums"]["portfolio_fit_label"];
          allocation_warning?: string | null;
          sector_warning?: string | null;
          cash_warning?: string | null;
          explanation_json?: Json;
        };
        Update: {
          id?: string;
          portfolio_id?: string;
          symbol?: string;
          scored_at?: string;
          portfolio_fit_label?: Database["public"]["Enums"]["portfolio_fit_label"];
          allocation_warning?: string | null;
          sector_warning?: string | null;
          cash_warning?: string | null;
          explanation_json?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "portfolio_stock_scores_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "portfolio_stock_scores_symbol_fkey";
            columns: ["symbol"];
            isOneToOne: false;
            referencedRelation: "stocks";
            referencedColumns: ["symbol"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      fundamental_period_type: "annual" | "quarterly" | "ttm";
      portfolio_fit_label:
        | "Underweight"
        | "Balanced"
        | "Overweight"
        | "Concentration Risk"
        | "Cash Constrained"
        | "Do Not Add"
        | "Review Position"
        | "Insufficient Data";
      stock_label:
        | "Attractive"
        | "Reasonable"
        | "Watch"
        | "Expensive"
        | "Avoid / Review"
        | "Insufficient Data";
      transaction_type:
        | "buy"
        | "sell"
        | "deposit"
        | "withdrawal"
        | "dividend"
        | "fee";
    };
    CompositeTypes: Record<string, never>;
  };
};
