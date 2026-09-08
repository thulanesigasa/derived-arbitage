//+------------------------------------------------------------------+
//|                                                   RiskEngine.mqh |
//|                                  Copyright 2026, Antigravity AI  |
//|                                          https://deriv.com       |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Antigravity AI"
#property link      "https://deriv.com"
#property version   "2.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\OrderInfo.mqh>
#include <Trade\HistoryOrderInfo.mqh>

//+------------------------------------------------------------------+
//| Enumerations & Data Structures                                   |
//+------------------------------------------------------------------+

//--- Risk breach violation codes
enum ENUM_RISK_BREACH_REASON
  {
   BREACH_NONE                  = 0,  // No breach detected
   BREACH_EQUITY_FLOOR          = 1,  // Absolute equity floor ($15.00) breached
   BREACH_DAILY_LOSS_LIMIT      = 2,  // Maximum allowable daily loss ($0.40) breached
   BREACH_WEEKLY_LOSS_LIMIT     = 3,  // Maximum allowable weekly loss ($1.00) breached
   BREACH_MAX_DRAWDOWN          = 4,  // Maximum portfolio drawdown ($5.00) breached
   BREACH_MAX_POSITIONS         = 5,  // Maximum simultaneous open positions reached
   BREACH_MARGIN_CEILING        = 6,  // Margin usage percentage exceeds allowed ceiling
   BREACH_SPREAD_SPIKE          = 7,  // Market spread exceeds allowable threshold
   BREACH_VOLATILITY_SPIKE      = 8,  // Abnormal tick volatility detected
   BREACH_STREAK_LIMIT          = 9,  // Consecutive loss streak circuit breaker active
   BREACH_COOLDOWN_ACTIVE       = 10, // System in mandatory post-loss cooldown period
   BREACH_INVALID_SL            = 11, // Mandatory stop loss missing or improperly placed
   BREACH_FREEZE_LEVEL          = 12, // Order price or SL too close to market freeze level
   BREACH_DAILY_TRADE_LIMIT     = 13  // Maximum daily trade count reached
  };

//--- Severity logging levels
enum ENUM_LOG_LEVEL
  {
   LOG_LEVEL_DEBUG    = 0,
   LOG_LEVEL_INFO     = 1,
   LOG_LEVEL_WARNING  = 2,
   LOG_LEVEL_DANGER   = 3,
   LOG_LEVEL_CRITICAL = 4
  };

//--- Risk engine configuration parameters
struct RiskConfig
  {
   double            equity_floor;               // Hard absolute equity floor ($15.00)
   double            equity_floor_warning;       // Warning threshold before floor ($16.00)
   double            max_daily_loss;             // Maximum allowable daily loss ($0.40)
   double            max_weekly_loss;            // Maximum allowable weekly loss ($1.00)
   double            max_total_loss;             // Maximum cumulative drawdown ($5.00)
   double            default_risk_per_trade;     // Target dollar risk per trade ($0.10)
   double            hard_max_risk_per_trade;    // Maximum permitted dollar risk ($0.20)
   int               max_open_positions;         // Max simultaneous open positions (1)
   double            max_margin_usage_percent;   // Maximum margin / balance percentage (20%)
   double            max_spread_points;          // Maximum allowable spread in points (e.g. 500)
   int               max_consecutive_losses;     // Consecutive loss limit before cooldown (3)
   int               cooldown_duration_sec;      // Cooldown duration in seconds (3600 = 1 hr)
   int               max_daily_trades;           // Max trades allowed per day (15)
   bool              require_hard_sl;            // Enforce mandatory stop loss on all entries
   bool              break_even_enabled;         // Enable dynamic break-even protection
   double            break_even_trigger_rr;      // R:R threshold to trigger break-even (1.5 R)
   double            break_even_offset_points;   // Points above/below entry for BE lock (2 pts)
   bool              trailing_stop_enabled;      // Enable dynamic trailing stop defense
   double            trailing_step_points;       // Trailing update step in points (10 pts)
   double            trailing_distance_points;   // Trailing buffer distance in points (30 pts)
   int               emergency_flatten_retries;  // Retries for failed position close (5)
  };

//--- Real-time portfolio risk metrics
struct RiskMetrics
  {
   double            initial_balance;            // Baseline starting balance
   double            current_balance;            // Current terminal balance
   double            current_equity;             // Current terminal equity
   double            peak_equity;                // Highest equity high-water-mark recorded
   double            free_margin;                // Current free margin
   double            margin_used;                // Current margin allocated
   double            margin_usage_percent;       // (margin_used / current_balance) * 100
   double            daily_closed_pnl;           // Net realized P&L from closed trades today
   double            daily_floating_pnl;         // Net unrealized P&L from open positions
   double            daily_net_pnl;              // Total closed + floating P&L today
   double            daily_gross_profit;         // Sum of winning trades today
   double            daily_gross_loss;           // Sum of losing trades today
   double            daily_commissions;          // Total commissions paid today
   double            daily_swaps;                // Total swap charges today
   int               daily_trades_count;         // Total trades closed today
   double            weekly_net_pnl;             // Realized + floating P&L for current week
   double            current_drawdown;           // Drawdown from initial balance
   double            peak_drawdown;              // Drawdown from peak high-water-mark
   int               consecutive_losses;         // Current consecutive losing trade count
   int               consecutive_wins;           // Current consecutive winning trade count
   bool              cooldown_active;            // Cooldown circuit breaker tripped
   datetime          cooldown_expiry;            // Expiration timestamp of cooldown
   bool              risk_locked;                // Daily loss circuit breaker tripped
   bool              equity_floor_locked;        // Equity floor circuit breaker tripped
   datetime          last_daily_reset;           // Timestamp of last daily reset
   datetime          last_weekly_reset;          // Timestamp of last weekly reset
  };

//--- Ring buffer audit log item
struct RiskAuditEntry
  {
   datetime          timestamp;
   ENUM_LOG_LEVEL    level;
   string            component;
   string            message;
   double            equity;
   double            balance;
   double            daily_pnl;
  };

//+------------------------------------------------------------------+
//| Class CRiskAuditLogger                                           |
//| Flight-recorder audit logger writing to disk & in-memory buffer. |
//+------------------------------------------------------------------+
class CRiskAuditLogger
  {
private:
   static const int  RING_BUFFER_SIZE = 64;
   RiskAuditEntry    m_ring_buffer[64];
   int               m_ring_head;
   int               m_total_entries;
   string            m_log_filename;
   int               m_file_handle;

   void              RotateFileIfNewDay()
     {
      MqlDateTime dt;
      TimeToStruct(TimeCurrent(), dt);
      string today_filename = StringFormat("falcon_risk_audit_%04d%02d%02d.csv", dt.year, dt.mon, dt.day);
      if(m_log_filename != today_filename)
        {
         if(m_file_handle != INVALID_HANDLE)
           {
            FileClose(m_file_handle);
            m_file_handle = INVALID_HANDLE;
           }
         m_log_filename = today_filename;
         m_file_handle = FileOpen(m_log_filename, FILE_WRITE|FILE_READ|FILE_CSV|FILE_SHARE_READ, ",");
         if(m_file_handle != INVALID_HANDLE)
           {
            // If new file, write CSV header
            if(FileSize(m_file_handle) == 0)
              {
               FileWrite(m_file_handle, "Timestamp", "Level", "Component", "Message", "Equity", "Balance", "DailyPnL");
              }
            else
              {
               FileSeek(m_file_handle, 0, SEEK_END);
              }
           }
        }
     }

public:
                     CRiskAuditLogger(void)
                       : m_ring_head(0),
                         m_total_entries(0),
                         m_log_filename(""),
                         m_file_handle(INVALID_HANDLE)
                       {
                       }

                    ~CRiskAuditLogger(void)
                       {
                        if(m_file_handle != INVALID_HANDLE)
                          {
                           FileClose(m_file_handle);
                           m_file_handle = INVALID_HANDLE;
                          }
                       }

   void              Log(ENUM_LOG_LEVEL level, string component, string message, double equity, double balance, double daily_pnl)
     {
      datetime now = TimeCurrent();
      
      // Store into circular memory buffer
      int idx = m_ring_head;
      m_ring_buffer[idx].timestamp = now;
      m_ring_buffer[idx].level = level;
      m_ring_buffer[idx].component = component;
      m_ring_buffer[idx].message = message;
      m_ring_buffer[idx].equity = equity;
      m_ring_buffer[idx].balance = balance;
      m_ring_buffer[idx].daily_pnl = daily_pnl;

      m_ring_head = (m_ring_head + 1) % RING_BUFFER_SIZE;
      m_total_entries++;

      // Log to terminal console
      string level_tag = "[INFO]";
      switch(level)
        {
         case LOG_LEVEL_DEBUG:    level_tag = "[DEBUG]"; break;
         case LOG_LEVEL_INFO:     level_tag = "[INFO]"; break;
         case LOG_LEVEL_WARNING:  level_tag = "[WARN]"; break;
         case LOG_LEVEL_DANGER:   level_tag = "[DANGER]"; break;
         case LOG_LEVEL_CRITICAL: level_tag = "[CRITICAL]"; break;
        }

      PrintFormat("%s [%s] %s | Eq: $%.2f | Bal: $%.2f | DayPnL: $%.2f",
                  level_tag, component, message, equity, balance, daily_pnl);

      // Write to persistent audit log on disk
      RotateFileIfNewDay();
      if(m_file_handle != INVALID_HANDLE)
        {
         FileWrite(m_file_handle,
                   TimeToString(now, TIME_DATE|TIME_SECONDS),
                   level_tag,
                   component,
                   message,
                   DoubleToString(equity, 2),
                   DoubleToString(balance, 2),
                   DoubleToString(daily_pnl, 2));
         FileFlush(m_file_handle);
        }
     }

   int               GetRecentEntriesCount() const
     {
      return (m_total_entries < RING_BUFFER_SIZE) ? m_total_entries : RING_BUFFER_SIZE;
     }

   bool              GetEntryByIndex(int index, RiskAuditEntry &entry) const
     {
      int count = GetRecentEntriesCount();
      if(index < 0 || index >= count)
         return false;

      int actual_idx = (m_ring_head - 1 - index + RING_BUFFER_SIZE) % RING_BUFFER_SIZE;
      entry = m_ring_buffer[actual_idx];
      return true;
     }
  };

//+------------------------------------------------------------------+
//| Class CSyntheticInstrumentSpec                                   |
//| Handles Deriv synthetic index specs, pricing, and lot sizing.    |
//+------------------------------------------------------------------+
class CSyntheticInstrumentSpec
  {
private:
   CSymbolInfo       m_symbol;

public:
                     CSyntheticInstrumentSpec(void) {}
                    ~CSyntheticInstrumentSpec(void) {}

   bool              InitSymbol(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name))
         return false;
      return m_symbol.RefreshRates();
     }

   double            GetMinLot(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 0.01;
      return m_symbol.LotsMin();
     }

   double            GetMaxLot(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 100.0;
      return m_symbol.LotsMax();
     }

   double            GetLotStep(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 0.01;
      return m_symbol.LotsStep();
     }

   double            GetPoint(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 0.001;
      return m_symbol.Point();
     }

   double            GetTickSize(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 0.001;
      return m_symbol.TickSize();
     }

   double            GetTickValue(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 1.0;
      return m_symbol.TickValue();
     }

   double            GetSpreadPoints(string symbol_name)
     {
      if(!m_symbol.Name(symbol_name)) return 0.0;
      m_symbol.RefreshRates();
      return (double)m_symbol.Spread();
     }

   //--- Sizing calculator: calculates exact lot size for a dollar risk amount
   double            CalculateLotFromRisk(string symbol_name, double dollar_risk, double sl_distance_points)
     {
      if(!m_symbol.Name(symbol_name) || sl_distance_points <= 0.0 || dollar_risk <= 0.0)
         return GetMinLot(symbol_name);

      m_symbol.RefreshRates();
      double tick_size = m_symbol.TickSize();
      double tick_value = m_symbol.TickValue();
      double point = m_symbol.Point();

      if(tick_size <= 0.0 || point <= 0.0)
         return GetMinLot(symbol_name);

      // Value of 1 lot moving by sl_distance_points
      double points_per_tick = tick_size / point;
      double ticks_in_sl = sl_distance_points / (points_per_tick > 0 ? points_per_tick : 1.0);
      double sl_value_per_lot = ticks_in_sl * tick_value;

      if(sl_value_per_lot <= 0.0)
         return GetMinLot(symbol_name);

      double calculated_lots = dollar_risk / sl_value_per_lot;
      return NormalizeLot(symbol_name, calculated_lots);
     }

   //--- Normalizes lot size to broker min, max, and step increments
   double            NormalizeLot(string symbol_name, double raw_lots)
     {
      if(!m_symbol.Name(symbol_name)) return raw_lots;

      double min_lot  = m_symbol.LotsMin();
      double max_lot  = m_symbol.LotsMax();
      double lot_step = m_symbol.LotsStep();

      if(raw_lots < min_lot) raw_lots = min_lot;
      if(raw_lots > max_lot) raw_lots = max_lot;

      if(lot_step > 0.0)
        {
         int steps = (int)MathFloor((raw_lots - min_lot) / lot_step + 0.00001);
         raw_lots = min_lot + (steps * lot_step);
        }

      int digits = 2;
      if(lot_step >= 1.0) digits = 0;
      else if(lot_step >= 0.1) digits = 1;
      else if(lot_step >= 0.01) digits = 2;
      else digits = 3;

      return NormalizeDouble(raw_lots, digits);
     }
  };

//+------------------------------------------------------------------+
//| Class CActiveTradeDefender                                       |
//| Manages dynamic Break-Even and trailing stop defense.            |
//+------------------------------------------------------------------+
class CActiveTradeDefender
  {
private:
   CTrade            m_trade;
   CPositionInfo     m_position;
   CSymbolInfo       m_symbol;

public:
                     CActiveTradeDefender(void) {}
                    ~CActiveTradeDefender(void) {}

   //--- Dynamic Break-Even protection
   bool              ApplyBreakEven(ulong ticket, double be_trigger_rr, double be_offset_points)
     {
      if(!m_position.SelectByTicket(ticket))
         return false;

      string symbol = m_position.Symbol();
      if(!m_symbol.Name(symbol))
         return false;
      m_symbol.RefreshRates();

      double open_price = m_position.PriceOpen();
      double current_sl = m_position.StopLoss();
      double current_tp = m_position.TakeProfit();
      double current_price = m_position.PriceCurrent();
      double point = m_symbol.Point();
      ENUM_POSITION_TYPE pos_type = m_position.PositionType();

      if(current_sl <= 0.0)
         return false;

      double initial_sl_dist = MathAbs(open_price - current_sl);
      if(initial_sl_dist <= 0.0)
         return false;

      double required_profit_dist = initial_sl_dist * be_trigger_rr;
      double offset = be_offset_points * point;

      if(pos_type == POSITION_TYPE_BUY)
        {
         // Price moved at least required R:R into profit
         if((current_price - open_price) >= required_profit_dist)
           {
            double new_sl = open_price + offset;
            if(current_sl < new_sl && current_price > new_sl)
              {
               new_sl = NormalizeDouble(new_sl, m_symbol.Digits());
               if(m_trade.PositionModify(ticket, new_sl, current_tp))
                 {
                  PrintFormat("[TradeDefender] Break-Even locked on BUY #%I64u at %.5f (Offset: +%.1f pts)",
                              ticket, new_sl, be_offset_points);
                  return true;
                 }
              }
           }
        }
      else if(pos_type == POSITION_TYPE_SELL)
        {
         if((open_price - current_price) >= required_profit_dist)
           {
            double new_sl = open_price - offset;
            if((current_sl > new_sl || current_sl == 0.0) && current_price < new_sl)
              {
               new_sl = NormalizeDouble(new_sl, m_symbol.Digits());
               if(m_trade.PositionModify(ticket, new_sl, current_tp))
                 {
                  PrintFormat("[TradeDefender] Break-Even locked on SELL #%I64u at %.5f (Offset: -%.1f pts)",
                              ticket, new_sl, be_offset_points);
                  return true;
                 }
              }
           }
        }

      return false;
     }

   //--- Dynamic Trailing Stop Loss defense
   bool              ApplyTrailingStop(ulong ticket, double trailing_step_points, double trailing_distance_points)
     {
      if(!m_position.SelectByTicket(ticket))
         return false;

      string symbol = m_position.Symbol();
      if(!m_symbol.Name(symbol))
         return false;
      m_symbol.RefreshRates();

      double open_price = m_position.PriceOpen();
      double current_sl = m_position.StopLoss();
      double current_tp = m_position.TakeProfit();
      double current_price = m_position.PriceCurrent();
      double point = m_symbol.Point();
      int digits = m_symbol.Digits();
      ENUM_POSITION_TYPE pos_type = m_position.PositionType();

      double step_dist = trailing_step_points * point;
      double trail_dist = trailing_distance_points * point;

      if(pos_type == POSITION_TYPE_BUY)
        {
         double proposed_sl = NormalizeDouble(current_price - trail_dist, digits);
         if(proposed_sl > open_price) // Only trail once position is in profit
           {
            if(current_sl == 0.0 || (proposed_sl - current_sl) >= step_dist)
              {
               if(proposed_sl < current_price)
                 {
                  if(m_trade.PositionModify(ticket, proposed_sl, current_tp))
                    {
                     PrintFormat("[TradeDefender] Trailed BUY #%I64u SL -> %.5f", ticket, proposed_sl);
                     return true;
                    }
                 }
              }
           }
        }
      else if(pos_type == POSITION_TYPE_SELL)
        {
         double proposed_sl = NormalizeDouble(current_price + trail_dist, digits);
         if(proposed_sl < open_price)
           {
            if(current_sl == 0.0 || (current_sl - proposed_sl) >= step_dist)
              {
               if(proposed_sl > current_price)
                 {
                  if(m_trade.PositionModify(ticket, proposed_sl, current_tp))
                    {
                     PrintFormat("[TradeDefender] Trailed SELL #%I64u SL -> %.5f", ticket, proposed_sl);
                     return true;
                    }
                 }
              }
           }
        }

      return false;
     }
  };

//+------------------------------------------------------------------+
//| Class CRiskEngine                                                |
//| Institutional-Grade Independent Native Risk Engine for MT5.      |
//| Runs autonomously in the terminal thread on DerivSVG-Server-03.  |
//+------------------------------------------------------------------+
class CRiskEngine
  {
private:
   RiskConfig                 m_config;
   RiskMetrics                m_metrics;
   CRiskAuditLogger           m_logger;
   CSyntheticInstrumentSpec   m_spec;
   CActiveTradeDefender       m_defender;

   CTrade                     m_trade;
   CPositionInfo              m_position;
   CAccountInfo               m_account;
   CSymbolInfo                m_symbol;

   //--- Internal state recalculation
   void                       RecalculateMetrics();
   void                       CheckAndHandleRollovers();
   bool                       CheckMarginCeiling(string symbol, ENUM_ORDER_TYPE order_type, double volume, double price);
   bool                       CheckSpreadGuard(string symbol);

public:
                              CRiskEngine(void);
                             ~CRiskEngine(void);

   //--- Lifecycle & Configuration
   void                       Init(const RiskConfig &config);
   void                       SetDefaultConfig();
   RiskConfig                 GetConfig() const { return m_config; }
   RiskMetrics                GetMetrics() const { return m_metrics; }

   //--- Invariant checks & validations
   ENUM_RISK_BREACH_REASON    CheckRiskLimits();
   bool                       ValidateNewOrder(string symbol, ENUM_ORDER_TYPE order_type, double volume, double price, double sl, double tp, ENUM_RISK_BREACH_REASON &reject_reason);
   double                     CalculateLots(string symbol, double dollar_risk, double entry_price, double sl_price);
   void                       EmergencyFlatten(string reason);

   //--- Active position defense
   void                       RunPositionDefense();

   //--- Post-trade accounting
   void                       OnDealClosed(ulong deal_ticket);

   //--- Status & Diagnostics
   bool                       IsTradingPermitted();
   bool                       IsRiskLocked() const { return m_metrics.risk_locked; }
   bool                       IsEquityFloorLocked() const { return m_metrics.equity_floor_locked; }
   bool                       IsCooldownActive() const { return m_metrics.cooldown_active; }
   double                     GetDailyPnL() const { return m_metrics.daily_net_pnl; }
   double                     GetWeeklyPnL() const { return m_metrics.weekly_net_pnl; }
   double                     GetDrawdown() const { return m_metrics.current_drawdown; }
   int                        GetOpenPositionsCount() const { return PositionsTotal(); }
   string                     GetDetailedTelemetryJson();
   void                       GetAuditSummary(string &summary_text);
  };

//+------------------------------------------------------------------+
//| Constructor                                                      |
//+------------------------------------------------------------------+
CRiskEngine::CRiskEngine(void)
  {
   SetDefaultConfig();
   ZeroMemory(m_metrics);
   m_metrics.initial_balance = m_account.Balance();
   m_metrics.peak_equity = m_account.Equity();
   m_metrics.last_daily_reset = 0;
   m_metrics.last_weekly_reset = 0;
  }

//+------------------------------------------------------------------+
//| Destructor                                                       |
//+------------------------------------------------------------------+
CRiskEngine::~CRiskEngine(void)
  {
   m_logger.Log(LOG_LEVEL_INFO, "RiskEngine", "RiskEngine shutting down safely.",
                m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
  }

//+------------------------------------------------------------------+
//| Establish Default Guardrail Configuration                        |
//+------------------------------------------------------------------+
void CRiskEngine::SetDefaultConfig()
  {
   m_config.equity_floor               = 15.00;
   m_config.equity_floor_warning       = 16.00;
   m_config.max_daily_loss             = 0.40;
   m_config.max_weekly_loss            = 1.00;
   m_config.max_total_loss             = 5.00;
   m_config.default_risk_per_trade     = 0.10;
   m_config.hard_max_risk_per_trade    = 0.20;
   m_config.max_open_positions         = 1;
   m_config.max_margin_usage_percent   = 20.0;
   m_config.max_spread_points          = 600.0;
   m_config.max_consecutive_losses     = 3;
   m_config.cooldown_duration_sec      = 3600;
   m_config.max_daily_trades           = 15;
   m_config.require_hard_sl            = true;
   m_config.break_even_enabled         = true;
   m_config.break_even_trigger_rr      = 1.5;
   m_config.break_even_offset_points   = 2.0;
   m_config.trailing_stop_enabled      = true;
   m_config.trailing_step_points       = 10.0;
   m_config.trailing_distance_points   = 30.0;
   m_config.emergency_flatten_retries  = 5;
  }

//+------------------------------------------------------------------+
//| Initialize with Specific Configuration                           |
//+------------------------------------------------------------------+
void CRiskEngine::Init(const RiskConfig &config)
  {
   m_config = config;
   m_metrics.initial_balance = m_account.Balance();
   m_metrics.peak_equity = m_account.Equity();
   m_metrics.risk_locked = false;
   m_metrics.equity_floor_locked = false;
   m_metrics.cooldown_active = false;
   m_metrics.cooldown_expiry = 0;

   RecalculateMetrics();
   m_logger.Log(LOG_LEVEL_INFO, "RiskEngine",
                StringFormat("Initialized: Floor=$%.2f, MaxDailyLoss=$%.2f, MaxWeeklyLoss=$%.2f, MaxPos=%d",
                             m_config.equity_floor, m_config.max_daily_loss, m_config.max_weekly_loss, m_config.max_open_positions),
                m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
  }

//+------------------------------------------------------------------+
//| Daily and Weekly Rollover Management                             |
//+------------------------------------------------------------------+
void CRiskEngine::CheckAndHandleRollovers()
  {
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);

   // Daily boundary: 00:00:00 server time
   datetime today_start = StructToTime(dt) - (dt.hour * 3600 + dt.min * 60 + dt.sec);
   if(m_metrics.last_daily_reset < today_start)
     {
      m_metrics.last_daily_reset = today_start;
      m_metrics.risk_locked = false;
      m_metrics.daily_closed_pnl = 0.0;
      m_metrics.daily_floating_pnl = 0.0;
      m_metrics.daily_net_pnl = 0.0;
      m_metrics.daily_gross_profit = 0.0;
      m_metrics.daily_gross_loss = 0.0;
      m_metrics.daily_commissions = 0.0;
      m_metrics.daily_swaps = 0.0;
      m_metrics.daily_trades_count = 0;

      m_logger.Log(LOG_LEVEL_INFO, "Rollover",
                   StringFormat("Daily risk reset at %s. Balance: $%.2f",
                                TimeToString(now, TIME_DATE|TIME_SECONDS), m_account.Balance()),
                   m_account.Equity(), m_account.Balance(), 0.0);
     }

   // Weekly boundary: Sunday 00:00:00
   datetime week_start = today_start - (dt.day_of_week * 86400);
   if(m_metrics.last_weekly_reset < week_start)
     {
      m_metrics.last_weekly_reset = week_start;
      m_metrics.weekly_net_pnl = 0.0;
      m_logger.Log(LOG_LEVEL_INFO, "Rollover", "Weekly risk reset complete.",
                   m_account.Equity(), m_account.Balance(), 0.0);
     }

   // Check if post-loss cooldown period has expired
   if(m_metrics.cooldown_active && now >= m_metrics.cooldown_expiry)
     {
      m_metrics.cooldown_active = false;
      m_metrics.consecutive_losses = 0;
      m_logger.Log(LOG_LEVEL_INFO, "Cooldown", "Post-loss cooldown expired. Trading unlocked.",
                   m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
     }
  }

//+------------------------------------------------------------------+
//| Comprehensive Portfolio Risk Metric Recalculation                |
//+------------------------------------------------------------------+
void CRiskEngine::RecalculateMetrics()
  {
   CheckAndHandleRollovers();

   m_metrics.current_balance = m_account.Balance();
   m_metrics.current_equity  = m_account.Equity();
   m_metrics.free_margin     = m_account.FreeMargin();
   m_metrics.margin_used     = m_account.Margin();

   // High-water-mark peak tracking
   if(m_metrics.current_equity > m_metrics.peak_equity)
      m_metrics.peak_equity = m_metrics.current_equity;

   // Margin usage percentage
   if(m_metrics.current_balance > 0.0)
      m_metrics.margin_usage_percent = (m_metrics.margin_used / m_metrics.current_balance) * 100.0;
   else
      m_metrics.margin_usage_percent = 0.0;

   // Drawdowns
   m_metrics.current_drawdown = (m_metrics.initial_balance > m_metrics.current_equity) ?
                                (m_metrics.initial_balance - m_metrics.current_equity) : 0.0;
   m_metrics.peak_drawdown    = (m_metrics.peak_equity > m_metrics.current_equity) ?
                                (m_metrics.peak_equity - m_metrics.current_equity) : 0.0;

   // Closed deal accounting for current day
   datetime from_time = m_metrics.last_daily_reset;
   datetime to_time   = TimeCurrent();
   
   double closed_profit = 0.0;
   double gross_win = 0.0;
   double gross_loss = 0.0;
   double comm = 0.0;
   double swap = 0.0;
   int trades = 0;

   if(HistorySelect(from_time, to_time))
     {
      int total_deals = HistoryDealsTotal();
      for(int i = 0; i < total_deals; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
           {
            ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
            if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
              {
               double p = HistoryDealGetDouble(ticket, DEAL_PROFIT);
               double c = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
               double s = HistoryDealGetDouble(ticket, DEAL_SWAP);

               closed_profit += (p + c + s);
               comm += c;
               swap += s;
               trades++;

               if(p >= 0.0) gross_win += p;
               else gross_loss += MathAbs(p);
              }
           }
        }
     }

   m_metrics.daily_closed_pnl    = closed_profit;
   m_metrics.daily_gross_profit  = gross_win;
   m_metrics.daily_gross_loss    = gross_loss;
   m_metrics.daily_commissions   = comm;
   m_metrics.daily_swaps         = swap;
   m_metrics.daily_trades_count  = trades;

   // Floating unrealized P&L across all open positions
   double floating = 0.0;
   int total_pos = PositionsTotal();
   for(int i = 0; i < total_pos; i++)
     {
      if(m_position.SelectByIndex(i))
        {
         floating += m_position.Profit();
         floating += m_position.Swap();
        }
     }

   m_metrics.daily_floating_pnl = floating;
   m_metrics.daily_net_pnl      = closed_profit + floating;
  }

//+------------------------------------------------------------------+
//| Margin Ceiling Check for New Proposed Order                      |
//+------------------------------------------------------------------+
bool CRiskEngine::CheckMarginCeiling(string symbol, ENUM_ORDER_TYPE order_type, double volume, double price)
  {
   double margin_required = 0.0;
   if(!OrderCalcMargin(order_type, symbol, volume, price, margin_required))
     {
      PrintFormat("[RiskEngine] Margin calculation failed for %s %.2f lots", symbol, volume);
      return false;
     }

   double projected_margin = m_metrics.margin_used + margin_required;
   double projected_percent = (m_metrics.current_balance > 0.0) ?
                              (projected_margin / m_metrics.current_balance) * 100.0 : 100.0;

   if(projected_percent > m_config.max_margin_usage_percent)
     {
      m_logger.Log(LOG_LEVEL_WARNING, "MarginGuard",
                   StringFormat("Projected margin usage %.1f%% exceeds ceiling %.1f%% (Req: $%.2f)",
                                projected_percent, m_config.max_margin_usage_percent, margin_required),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }

   return true;
  }

//+------------------------------------------------------------------+
//| Spread Guard Check                                               |
//+------------------------------------------------------------------+
bool CRiskEngine::CheckSpreadGuard(string symbol)
  {
   double spread = m_spec.GetSpreadPoints(symbol);
   if(spread > m_config.max_spread_points)
     {
      m_logger.Log(LOG_LEVEL_WARNING, "SpreadGuard",
                   StringFormat("Spread on %s (%.1f pts) exceeds max allowable (%.1f pts)",
                                symbol, spread, m_config.max_spread_points),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
//| Autonomous Invariant & Circuit Breaker Verification              |
//| Called on every tick and on every timer pulse                    |
//+------------------------------------------------------------------+
ENUM_RISK_BREACH_REASON CRiskEngine::CheckRiskLimits()
  {
   RecalculateMetrics();

   // 1. ABSOLUTE EQUITY FLOOR CIRCUIT BREAKER ($15.00)
   if(m_metrics.current_equity <= m_config.equity_floor)
     {
      if(!m_metrics.equity_floor_locked)
        {
         m_metrics.equity_floor_locked = true;
         m_logger.Log(LOG_LEVEL_CRITICAL, "CircuitBreaker",
                      StringFormat("CRITICAL: Equity floor breached! Equity: $%.2f <= Floor: $%.2f. Triggering emergency flatten.",
                                   m_metrics.current_equity, m_config.equity_floor),
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         EmergencyFlatten("EQUITY_FLOOR_BREACH");
        }
      return BREACH_EQUITY_FLOOR;
     }

   // 2. PRE-WARNING EQUITY FLOOR THRESHOLD ($16.00)
   if(m_metrics.current_equity <= m_config.equity_floor_warning && !m_metrics.equity_floor_locked)
     {
      m_logger.Log(LOG_LEVEL_WARNING, "RiskWarning",
                   StringFormat("WARNING: Equity ($%.2f) approaching absolute floor ($%.2f). Extreme defense active.",
                                m_metrics.current_equity, m_config.equity_floor),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
     }

   // 3. DAILY LOSS LIMIT CIRCUIT BREAKER ($0.40)
   if(m_metrics.daily_net_pnl <= -m_config.max_daily_loss)
     {
      if(!m_metrics.risk_locked)
        {
         m_metrics.risk_locked = true;
         m_logger.Log(LOG_LEVEL_CRITICAL, "CircuitBreaker",
                      StringFormat("CRITICAL: Daily loss limit breached! DayPnL: $%.2f <= Max: -$%.2f. Triggering emergency flatten.",
                                   m_metrics.daily_net_pnl, m_config.max_daily_loss),
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         EmergencyFlatten("DAILY_LOSS_BREACH");
        }
      return BREACH_DAILY_LOSS_LIMIT;
     }

   // 4. CUMULATIVE MAXIMUM DRAWDOWN ($5.00)
   if(m_metrics.current_drawdown >= m_config.max_total_loss)
     {
      if(!m_metrics.risk_locked)
        {
         m_metrics.risk_locked = true;
         m_logger.Log(LOG_LEVEL_CRITICAL, "CircuitBreaker",
                      StringFormat("CRITICAL: Maximum drawdown breached! DD: $%.2f >= Max: $%.2f. Triggering emergency flatten.",
                                   m_metrics.current_drawdown, m_config.max_total_loss),
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         EmergencyFlatten("MAX_DRAWDOWN_BREACH");
        }
      return BREACH_MAX_DRAWDOWN;
     }

   // 5. POST-LOSS CONSECUTIVE STREAK COOLDOWN (3 losses in a row)
   if(m_metrics.consecutive_losses >= m_config.max_consecutive_losses && !m_metrics.cooldown_active)
     {
      m_metrics.cooldown_active = true;
      m_metrics.cooldown_expiry = TimeCurrent() + m_config.cooldown_duration_sec;
      m_logger.Log(LOG_LEVEL_WARNING, "CircuitBreaker",
                   StringFormat("Consecutive loss limit (%d) reached. 1-hour cooldown active until %s.",
                                m_config.max_consecutive_losses, TimeToString(m_metrics.cooldown_expiry, TIME_DATE|TIME_SECONDS)),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return BREACH_STREAK_LIMIT;
     }

   return BREACH_NONE;
  }

//+------------------------------------------------------------------+
//| Rigorous Pre-Trade Order Validation                              |
//+------------------------------------------------------------------+
bool CRiskEngine::ValidateNewOrder(string symbol, ENUM_ORDER_TYPE order_type, double volume, double price, double sl, double tp, ENUM_RISK_BREACH_REASON &reject_reason)
  {
   reject_reason = BREACH_NONE;

   // 1. Check Circuit Breaker Active Status
   if(m_metrics.equity_floor_locked)
     {
      reject_reason = BREACH_EQUITY_FLOOR;
      m_logger.Log(LOG_LEVEL_DANGER, "OrderValidator", "Order rejected: Equity floor ($15.00) locked.",
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }

   if(m_metrics.risk_locked)
     {
      reject_reason = BREACH_DAILY_LOSS_LIMIT;
      m_logger.Log(LOG_LEVEL_DANGER, "OrderValidator", "Order rejected: Daily loss limit ($0.40) locked.",
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }

   if(m_metrics.cooldown_active)
     {
      reject_reason = BREACH_COOLDOWN_ACTIVE;
      m_logger.Log(LOG_LEVEL_DANGER, "OrderValidator",
                   StringFormat("Order rejected: Cooldown active until %s", TimeToString(m_metrics.cooldown_expiry)),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }

   // 2. Active Invariant Check
   ENUM_RISK_BREACH_REASON active_breach = CheckRiskLimits();
   if(active_breach != BREACH_NONE)
     {
      reject_reason = active_breach;
      return false;
     }

   // 3. Max Simultaneous Positions Ceiling (1)
   if(GetOpenPositionsCount() >= m_config.max_open_positions)
     {
      reject_reason = BREACH_MAX_POSITIONS;
      m_logger.Log(LOG_LEVEL_WARNING, "OrderValidator",
                   StringFormat("Order rejected: Position limit (%d) reached.", m_config.max_open_positions),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }

   // 4. Max Daily Trades Ceiling
   if(m_metrics.daily_trades_count >= m_config.max_daily_trades)
     {
      reject_reason = BREACH_DAILY_TRADE_LIMIT;
      m_logger.Log(LOG_LEVEL_WARNING, "OrderValidator",
                   StringFormat("Order rejected: Daily trade count (%d) reached.", m_config.max_daily_trades),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      return false;
     }

   // 5. Mandatory Hard Stop Loss Verification
   if(m_config.require_hard_sl)
     {
      if(sl <= 0.0)
        {
         reject_reason = BREACH_INVALID_SL;
         m_logger.Log(LOG_LEVEL_DANGER, "OrderValidator", "Order rejected: Stop loss is mandatory but was missing.",
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         return false;
        }

      if(order_type == ORDER_TYPE_BUY && sl >= price)
        {
         reject_reason = BREACH_INVALID_SL;
         m_logger.Log(LOG_LEVEL_DANGER, "OrderValidator",
                      StringFormat("Order rejected: Buy SL (%.5f) must be below price (%.5f).", sl, price),
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         return false;
        }

      if(order_type == ORDER_TYPE_SELL && sl <= price)
        {
         reject_reason = BREACH_INVALID_SL;
         m_logger.Log(LOG_LEVEL_DANGER, "OrderValidator",
                      StringFormat("Order rejected: Sell SL (%.5f) must be above price (%.5f).", sl, price),
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         return false;
        }
     }

   // 6. Freeze Level & Stops Level Proximity Check
   if(!m_symbol.Name(symbol))
     {
      PrintFormat("[RiskEngine] Unable to load symbol %s", symbol);
      return false;
     }
   m_symbol.RefreshRates();

   double stops_level = (double)m_symbol.StopsLevel() * m_symbol.Point();
   double freeze_level = (double)m_symbol.FreezeLevel() * m_symbol.Point();
   double min_dist = MathMax(stops_level, freeze_level);

   if(min_dist > 0.0)
     {
      double sl_dist = MathAbs(price - sl);
      if(sl_dist < min_dist)
        {
         reject_reason = BREACH_FREEZE_LEVEL;
         m_logger.Log(LOG_LEVEL_WARNING, "OrderValidator",
                      StringFormat("Order rejected: SL distance (%.5f) is within freeze/stops level (%.5f)", sl_dist, min_dist),
                      m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
         return false;
        }
     }

   // 7. Spread Spike Filter
   if(!CheckSpreadGuard(symbol))
     {
      reject_reason = BREACH_SPREAD_SPIKE;
      return false;
     }

   // 8. Margin Ceiling Guard
   if(!CheckMarginCeiling(symbol, order_type, volume, price))
     {
      reject_reason = BREACH_MARGIN_CEILING;
      return false;
     }

   return true;
  }

//+------------------------------------------------------------------+
//| Calculate Lot Size Based on Strict Dollar Risk                   |
//+------------------------------------------------------------------+
double CRiskEngine::CalculateLots(string symbol, double dollar_risk, double entry_price, double sl_price)
  {
   if(dollar_risk <= 0.0)
      dollar_risk = m_config.default_risk_per_trade;

   // Enforce hard maximum risk per trade ($0.20)
   if(dollar_risk > m_config.hard_max_risk_per_trade)
     {
      m_logger.Log(LOG_LEVEL_WARNING, "LotCalculator",
                   StringFormat("Requested risk $%.2f clamped to hard max $%.2f", dollar_risk, m_config.hard_max_risk_per_trade),
                   m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);
      dollar_risk = m_config.hard_max_risk_per_trade;
     }

   double point = m_spec.GetPoint(symbol);
   if(point <= 0.0) return m_spec.GetMinLot(symbol);

   double sl_distance_points = MathAbs(entry_price - sl_price) / point;
   double lots = m_spec.CalculateLotFromRisk(symbol, dollar_risk, sl_distance_points);

   m_logger.Log(LOG_LEVEL_DEBUG, "LotCalculator",
                StringFormat("Calculated lots for %s: %.2f lots (Risk: $%.2f, SL Dist: %.1f pts)",
                             symbol, lots, dollar_risk, sl_distance_points),
                m_metrics.current_equity, m_metrics.current_balance, m_metrics.daily_net_pnl);

   return lots;
  }

//+------------------------------------------------------------------+
//| Emergency Flatten: Multi-pass position closer with retries       |
//+------------------------------------------------------------------+
void CRiskEngine::EmergencyFlatten(string reason)
  {
   m_logger.Log(LOG_LEVEL_CRITICAL, "EmergencyFlatten",
                StringFormat("EMERGENCY FLATTEN ACTIVATED: %s", reason),
                m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);

   int retries = m_config.emergency_flatten_retries;
   while(PositionsTotal() > 0 && retries > 0)
     {
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
        {
         if(m_position.SelectByIndex(i))
           {
            ulong ticket = m_position.Ticket();
            string sym = m_position.Symbol();
            PrintFormat("[RiskEngine] Closing position #%I64u (%s) due to emergency flatten...", ticket, sym);

            m_trade.SetDeviationInPoints(50); // Generous slippage tolerance during emergency exit
            if(!m_trade.PositionClose(ticket))
              {
               m_logger.Log(LOG_LEVEL_DANGER, "EmergencyFlatten",
                            StringFormat("FAILED to close position #%I64u: %s", ticket, m_trade.ResultRetcodeDescription()),
                            m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
              }
            else
              {
               m_logger.Log(LOG_LEVEL_INFO, "EmergencyFlatten",
                            StringFormat("Closed position #%I64u successfully.", ticket),
                            m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
              }
           }
        }

      if(PositionsTotal() > 0)
        {
         retries--;
         Sleep(200); // 200ms pause before retry pass
        }
     }

   if(PositionsTotal() > 0)
     {
      m_logger.Log(LOG_LEVEL_CRITICAL, "EmergencyFlatten",
                   StringFormat("CRITICAL: %d positions could not be closed after retries!", PositionsTotal()),
                   m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
     }
  }

//+------------------------------------------------------------------+
//| Run Dynamic Position Defense (Break-Even & Trailing SL)          |
//+------------------------------------------------------------------+
void CRiskEngine::RunPositionDefense()
  {
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      if(m_position.SelectByIndex(i))
        {
         ulong ticket = m_position.Ticket();

         // 1. Break-even defense
         if(m_config.break_even_enabled)
           {
            m_defender.ApplyBreakEven(ticket, m_config.break_even_trigger_rr, m_config.break_even_offset_points);
           }

         // 2. Trailing stop defense
         if(m_config.trailing_stop_enabled)
           {
            m_defender.ApplyTrailingStop(ticket, m_config.trailing_step_points, m_config.trailing_distance_points);
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Deal Closure Callback: Track streak and update metrics           |
//+------------------------------------------------------------------+
void CRiskEngine::OnDealClosed(ulong deal_ticket)
  {
   if(!HistoryDealSelect(deal_ticket))
      return;

   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT)
      return;

   double profit = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
   double comm = HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
   double swap = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
   double net_profit = profit + comm + swap;

   if(net_profit < 0.0)
     {
      m_metrics.consecutive_losses++;
      m_metrics.consecutive_wins = 0;
      m_logger.Log(LOG_LEVEL_WARNING, "PostTrade",
                   StringFormat("Losing deal closed: Net $%.2f (Loss streak: %d)", net_profit, m_metrics.consecutive_losses),
                   m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
     }
   else
     {
      m_metrics.consecutive_wins++;
      m_metrics.consecutive_losses = 0;
      m_logger.Log(LOG_LEVEL_INFO, "PostTrade",
                   StringFormat("Winning deal closed: Net +$%.2f (Win streak: %d)", net_profit, m_metrics.consecutive_wins),
                   m_account.Equity(), m_account.Balance(), m_metrics.daily_net_pnl);
     }

   CheckRiskLimits();
  }

//+------------------------------------------------------------------+
//| Check if New Orders are Allowed                                  |
//+------------------------------------------------------------------+
bool CRiskEngine::IsTradingPermitted()
  {
   if(m_metrics.equity_floor_locked || m_metrics.risk_locked || m_metrics.cooldown_active)
      return false;
   return (CheckRiskLimits() == BREACH_NONE);
  }

//+------------------------------------------------------------------+
//| JSON Telemetry Formatter for Bridge Transmission                 |
//+------------------------------------------------------------------+
string CRiskEngine::GetDetailedTelemetryJson()
  {
   RecalculateMetrics();

   string json = StringFormat(
      "{\"account\":%I64d,\"balance\":%.2f,\"equity\":%.2f,\"freeMargin\":%.2f,\"margin\":%.2f,\"marginUsagePercent\":%.1f,\"dailyClosedPnl\":%.2f,\"dailyFloatingPnl\":%.2f,\"dailyNetPnl\":%.2f,\"dailyTrades\":%d,\"currentDrawdown\":%.2f,\"peakDrawdown\":%.2f,\"lossStreak\":%d,\"riskLocked\":%s,\"equityFloorLocked\":%s,\"cooldownActive\":%s,\"cooldownExpiry\":\"%s\",\"terminalTime\":\"%s\"}",
      m_account.Login(),
      m_metrics.current_balance,
      m_metrics.current_equity,
      m_metrics.free_margin,
      m_metrics.margin_used,
      m_metrics.margin_usage_percent,
      m_metrics.daily_closed_pnl,
      m_metrics.daily_floating_pnl,
      m_metrics.daily_net_pnl,
      m_metrics.daily_trades_count,
      m_metrics.current_drawdown,
      m_metrics.peak_drawdown,
      m_metrics.consecutive_losses,
      m_metrics.risk_locked ? "true" : "false",
      m_metrics.equity_floor_locked ? "true" : "false",
      m_metrics.cooldown_active ? "true" : "false",
      m_metrics.cooldown_active ? TimeToString(m_metrics.cooldown_expiry, TIME_DATE|TIME_SECONDS) : "",
      TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   );

   return json;
  }

//+------------------------------------------------------------------+
//| Diagnostics & Audit Summary Formatter                            |
//+------------------------------------------------------------------+
void CRiskEngine::GetAuditSummary(string &summary_text)
  {
   summary_text = StringFormat(
      "FALCON RISK ENGINE STATUS\n"
      "-------------------------\n"
      "Equity: $%.2f | Balance: $%.2f | Free: $%.2f\n"
      "Floor: $%.2f (%s) | Daily Max Loss: $%.2f (%s)\n"
      "Today P&L: $%.2f (Closed: $%.2f, Float: $%.2f)\n"
      "Trades Today: %d | Drawdown: $%.2f\n"
      "Loss Streak: %d | Cooldown: %s\n"
      "Positions: %d / %d | Margin Used: %.1f%%\n",
      m_metrics.current_equity, m_metrics.current_balance, m_metrics.free_margin,
      m_config.equity_floor, m_metrics.equity_floor_locked ? "LOCKED" : "OK",
      m_config.max_daily_loss, m_metrics.risk_locked ? "LOCKED" : "OK",
      m_metrics.daily_net_pnl, m_metrics.daily_closed_pnl, m_metrics.daily_floating_pnl,
      m_metrics.daily_trades_count, m_metrics.current_drawdown,
      m_metrics.consecutive_losses, m_metrics.cooldown_active ? "ACTIVE" : "OFF",
      GetOpenPositionsCount(), m_config.max_open_positions, m_metrics.margin_usage_percent
   );
  }
//+------------------------------------------------------------------+
