//+------------------------------------------------------------------+
//|                                                   RiskEngine.mqh |
//|                                  Copyright 2026, Antigravity AI  |
//|                                          https://deriv.com       |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Antigravity AI"
#property link      "https://deriv.com"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//+------------------------------------------------------------------+
//| Class CRiskEngine                                                |
//| Independent risk engine running directly in MT5 terminal thread. |
//| Enforces capital preservation invariants without server reliance.|
//+------------------------------------------------------------------+
class CRiskEngine
  {
private:
   double            m_equity_floor;         // Absolute equity floor in USD (default $15.00)
   double            m_max_daily_loss;       // Max allowable loss per day in USD (default $0.40)
   int               m_max_open_positions;   // Max simultaneous open positions (default 1)
   bool              m_require_stop_loss;    // Whether every trade requires hard SL (default true)
   
   double            m_starting_daily_balance; // Starting balance for current trading day
   datetime          m_last_day_reset;         // Timestamp of last daily reset
   bool              m_risk_locked;            // Daily loss circuit breaker tripped
   bool              m_equity_floor_locked;    // Equity floor circuit breaker tripped

   CTrade            m_trade;
   CPositionInfo     m_position;
   CAccountInfo      m_account;
   CSymbolInfo       m_symbol;

   //--- Update daily balance baseline
   void              CheckAndResetDaily()
     {
      MqlDateTime dt;
      TimeToStruct(TimeCurrent(), dt);
      
      datetime today_start = StructToTime(dt) - (dt.hour * 3600 + dt.min * 60 + dt.sec);
      if(m_last_day_reset < today_start)
        {
         m_starting_daily_balance = m_account.Balance();
         m_last_day_reset = today_start;
         m_risk_locked = false;
         PrintFormat("[RiskEngine] Daily risk reset at %s. Baseline balance: $%.2f", 
                     TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS), m_starting_daily_balance);
        }
     }

public:
                     CRiskEngine(void);
                    ~CRiskEngine(void);

   //--- Initialization
   void              Init(double equity_floor = 15.00, double max_daily_loss = 0.40, int max_positions = 1);

   //--- Checks & Invariant validation
   bool              ValidateNewOrder(string symbol, ENUM_ORDER_TYPE order_type, double volume, double price, double sl, double tp);
   bool              CheckRiskLimits();
   void              EmergencyFlatten(string reason);

   //--- Getters
   double            GetDailyPnL();
   bool              IsRiskLocked() const { return m_risk_locked; }
   bool              IsEquityFloorLocked() const { return m_equity_floor_locked; }
   double            GetEquityFloor() const { return m_equity_floor; }
   double            GetMaxDailyLoss() const { return m_max_daily_loss; }
   int               GetOpenPositionsCount();
   double            NormalizeVolume(string symbol, double requested_lots);
  };

//+------------------------------------------------------------------+
//| Constructor                                                      |
//+------------------------------------------------------------------+
CRiskEngine::CRiskEngine(void)
  : m_equity_floor(15.00),
    m_max_daily_loss(0.40),
    m_max_open_positions(1),
    m_require_stop_loss(true),
    m_starting_daily_balance(0.0),
    m_last_day_reset(0),
    m_risk_locked(false),
    m_equity_floor_locked(false)
  {
  }

//+------------------------------------------------------------------+
//| Destructor                                                       |
//+------------------------------------------------------------------+
CRiskEngine::~CRiskEngine(void)
  {
  }

//+------------------------------------------------------------------+
//| Initialize Risk Parameters                                       |
//+------------------------------------------------------------------+
void CRiskEngine::Init(double equity_floor = 15.00, double max_daily_loss = 0.40, int max_positions = 1)
  {
   m_equity_floor = equity_floor;
   m_max_daily_loss = max_daily_loss;
   m_max_open_positions = max_positions;
   m_require_stop_loss = true;
   
   m_starting_daily_balance = m_account.Balance();
   m_last_day_reset = 0;
   m_risk_locked = false;
   m_equity_floor_locked = false;

   CheckAndResetDaily();
   PrintFormat("[RiskEngine] Initialized: Equity Floor=$%.2f, Max Daily Loss=$%.2f, Max Positions=%d",
               m_equity_floor, m_max_daily_loss, m_max_open_positions);
  }

//+------------------------------------------------------------------+
//| Calculate closed + floating PnL for the current day              |
//+------------------------------------------------------------------+
double CRiskEngine::GetDailyPnL()
  {
   CheckAndResetDaily();
   
   datetime from_time = m_last_day_reset;
   datetime to_time = TimeCurrent();
   
   double closed_pnl = 0.0;
   if(HistorySelect(from_time, to_time))
     {
      int deals_total = HistoryDealsTotal();
      for(int i = 0; i < deals_total; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
           {
            ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
            if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
              {
               closed_pnl += HistoryDealGetDouble(ticket, DEAL_PROFIT);
               closed_pnl += HistoryDealGetDouble(ticket, DEAL_SWAP);
               closed_pnl += HistoryDealGetDouble(ticket, DEAL_COMMISSION);
              }
           }
        }
     }

   // Floating profit from open positions
   double floating_pnl = 0.0;
   int pos_total = PositionsTotal();
   for(int i = 0; i < pos_total; i++)
     {
      if(m_position.SelectByIndex(i))
        {
         floating_pnl += m_position.Profit();
        }
     }

   return (closed_pnl + floating_pnl);
  }

//+------------------------------------------------------------------+
//| Count current open positions across all symbols                  |
//+------------------------------------------------------------------+
int CRiskEngine::GetOpenPositionsCount()
  {
   return PositionsTotal();
  }

//+------------------------------------------------------------------+
//| Normalize volume to symbol limits and step                       |
//+------------------------------------------------------------------+
double CRiskEngine::NormalizeVolume(string symbol, double requested_lots)
  {
   if(!m_symbol.Name(symbol))
      return requested_lots;

   double min_vol = m_symbol.LotsMin();
   double max_vol = m_symbol.LotsMax();
   double step_vol = m_symbol.LotsStep();

   if(requested_lots < min_vol)
      requested_lots = min_vol;
   if(requested_lots > max_vol)
      requested_lots = max_vol;

   // Round to step
   if(step_vol > 0)
     {
      int steps = (int)MathRound((requested_lots - min_vol) / step_vol);
      requested_lots = min_vol + steps * step_vol;
     }

   return NormalizeDouble(requested_lots, 2);
  }

//+------------------------------------------------------------------+
//| Check if risk limits are currently breached                      |
//+------------------------------------------------------------------+
bool CRiskEngine::CheckRiskLimits()
  {
   CheckAndResetDaily();

   double current_equity = m_account.Equity();
   double daily_pnl = GetDailyPnL();

   // 1. Check absolute equity floor ($15.00)
   if(current_equity <= m_equity_floor)
     {
      if(!m_equity_floor_locked)
        {
         m_equity_floor_locked = true;
         PrintFormat("[RiskEngine] CRITICAL: Equity floor breached! Equity: $%.2f <= Floor: $%.2f. Triggering emergency flatten.",
                     current_equity, m_equity_floor);
         EmergencyFlatten("EQUITY_FLOOR_BREACH");
        }
      return false;
     }

   // 2. Check max daily loss limit ($0.40)
   if(daily_pnl <= -m_max_daily_loss)
     {
      if(!m_risk_locked)
        {
         m_risk_locked = true;
         PrintFormat("[RiskEngine] CRITICAL: Daily loss limit breached! Daily PnL: $%.2f <= Max Loss: -$%.2f. Triggering emergency flatten.",
                     daily_pnl, m_max_daily_loss);
         EmergencyFlatten("DAILY_LOSS_LIMIT_BREACH");
        }
      return false;
     }

   return true;
  }

//+------------------------------------------------------------------+
//| Validate a new order before placement                            |
//+------------------------------------------------------------------+
bool CRiskEngine::ValidateNewOrder(string symbol, ENUM_ORDER_TYPE order_type, double volume, double price, double sl, double tp)
  {
   // 1. Check circuit breaker state
   if(m_equity_floor_locked)
     {
      PrintFormat("[RiskEngine] Order REJECTED: Equity floor ($%.2f) currently locked!", m_equity_floor);
      return false;
     }

   if(m_risk_locked)
     {
      PrintFormat("[RiskEngine] Order REJECTED: Daily loss limit ($%.2f) currently locked!", m_max_daily_loss);
      return false;
     }

   // 2. Check current limits
   if(!CheckRiskLimits())
     {
      return false;
     }

   // 3. Max simultaneous open positions limit
   if(GetOpenPositionsCount() >= m_max_open_positions)
     {
      PrintFormat("[RiskEngine] Order REJECTED: Max open positions (%d) reached!", m_max_open_positions);
      return false;
     }

   // 4. Mandatory Stop Loss Check
   if(m_require_stop_loss)
     {
      if(sl <= 0.0)
        {
         Print("[RiskEngine] Order REJECTED: Stop Loss is mandatory but was not provided!");
         return false;
        }

      if(order_type == ORDER_TYPE_BUY && sl >= price)
        {
         PrintFormat("[RiskEngine] Order REJECTED: Buy SL ($%.5f) must be below price ($%.5f)!", sl, price);
         return false;
        }

      if(order_type == ORDER_TYPE_SELL && sl <= price)
        {
         PrintFormat("[RiskEngine] Order REJECTED: Sell SL ($%.5f) must be above price ($%.5f)!", sl, price);
         return false;
        }
     }

   // 5. Symbol volume limits
   if(!m_symbol.Name(symbol))
     {
      PrintFormat("[RiskEngine] Order REJECTED: Unable to load symbol info for %s", symbol);
      return false;
     }

   double min_vol = m_symbol.LotsMin();
   double max_vol = m_symbol.LotsMax();

   if(volume < min_vol || volume > max_vol)
     {
      PrintFormat("[RiskEngine] Order REJECTED: Volume %.2f outside symbol range [%.2f, %.2f]", volume, min_vol, max_vol);
      return false;
     }

   return true;
  }

//+------------------------------------------------------------------+
//| Emergency Flatten: Close all open positions immediately          |
//+------------------------------------------------------------------+
void CRiskEngine::EmergencyFlatten(string reason)
  {
   PrintFormat("[RiskEngine] EMERGENCY FLATTEN ACTIVATED: %s", reason);
   
   int total = PositionsTotal();
   for(int i = total - 1; i >= 0; i--)
     {
      if(m_position.SelectByIndex(i))
        {
         ulong ticket = m_position.Ticket();
         string sym = m_position.Symbol();
         PrintFormat("[RiskEngine] Closing position #%d (%s) due to emergency flatten...", ticket, sym);
         
         if(!m_trade.PositionClose(ticket))
           {
            PrintFormat("[RiskEngine] FAILED to close position #%d: %s", ticket, m_trade.ResultRetcodeDescription());
           }
         else
           {
            PrintFormat("[RiskEngine] Successfully closed position #%d", ticket);
           }
        }
     }
  }
//+------------------------------------------------------------------+
