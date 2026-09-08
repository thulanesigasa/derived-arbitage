//+------------------------------------------------------------------+
//|                                                     FalconEA.mq5 |
//|                                  Copyright 2026, Antigravity AI  |
//|                                          https://deriv.com       |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Antigravity AI"
#property link        "https://deriv.com"
#property version     "2.00"
#property description "Falcon FX & SMC Execution EA with 1000-Line Independent Risk Engine"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>
#include "..\Include\RiskEngine.mqh"
#include "..\Include\BridgeClient.mqh"

//+------------------------------------------------------------------+
//| EA Inputs & User Configuration                                   |
//+------------------------------------------------------------------+
input group "=== Server Bridge Connection ==="
input string   InpBridgeUrl            = "http://localhost:4000"; // Server Bridge Base URL
input string   InpBridgeApiKey         = "falcon-vps-key-2026";  // VPS Bridge API Key
input int      InpSyncIntervalSec      = 1;                      // Sync & Polling Interval (seconds)
input ulong    InpMagicNumber          = 20260908;               // Expert Magic Number

input group "=== Absolute Capital Preservation Limits ==="
input double   InpEquityFloor          = 15.00;                  // Absolute Equity Floor ($15.00)
input double   InpEquityFloorWarning   = 16.00;                  // Pre-warning Threshold ($16.00)
input double   InpMaxDailyLoss         = 0.40;                   // Maximum Daily Loss ($0.40)
input double   InpMaxWeeklyLoss        = 1.00;                   // Maximum Weekly Loss ($1.00)
input double   InpMaxTotalLoss         = 5.00;                   // Maximum Cumulative Loss ($5.00)
input int      InpMaxPositions         = 1;                      // Max Simultaneous Positions (1)

input group "=== Trade Risk & Lot Sizing Model ==="
input double   InpTargetRiskPerTrade   = 0.10;                   // Target Risk per Trade ($0.10)
input double   InpHardMaxRiskPerTrade  = 0.20;                   // Hard Max Risk per Trade ($0.20)
input double   InpMaxMarginPercent     = 20.0;                   // Margin Usage Ceiling (%)
input double   InpMaxSpreadPoints      = 600.0;                  // Max Allowable Spread (points)
input int      InpMaxLossStreak        = 3;                      // Consecutive Loss Circuit Breaker
input int      InpCooldownSec          = 3600;                   // Cooldown Period (seconds)

input group "=== Active Position Defense ==="
input bool     InpBreakEvenEnabled     = true;                   // Enable Break-Even Protection
input double   InpBreakEvenTriggerRR   = 1.5;                    // Break-Even Trigger (R:R Ratio)
input double   InpBreakEvenOffsetPts   = 2.0;                    // Break-Even Profit Buffer (points)
input bool     InpTrailingEnabled      = true;                   // Enable Trailing Stop
input double   InpTrailingStepPts      = 10.0;                   // Trailing Update Step (points)
input double   InpTrailingDistPts      = 30.0;                   // Trailing Distance (points)

input group "=== Visual Interface & Telemetry ==="
input bool     InpShowChartHUD         = true;                   // Display On-Chart HUD
input color    InpHUDColor             = clrDarkOrange;          // HUD Accent Color

//+------------------------------------------------------------------+
//| Global Objects & Subsystems                                      |
//+------------------------------------------------------------------+
CRiskEngine    g_risk;
CBridgeClient  g_bridge;
CTrade         g_trade;
CAccountInfo   g_account;
CPositionInfo  g_position;
CSymbolInfo    g_symbol;

//+------------------------------------------------------------------+
//| Build Complete Telemetry JSON Payload for Server Bridge          |
//+------------------------------------------------------------------+
string BuildFullTelemetryJson()
  {
   RiskMetrics m = g_risk.GetMetrics();

   string positions_json = "[";
   int total = PositionsTotal();
   int count = 0;

   for(int i = 0; i < total; i++)
     {
      if(g_position.SelectByIndex(i))
        {
         if(count > 0)
            positions_json += ",";

         ulong ticket       = g_position.Ticket();
         string sym         = g_position.Symbol();
         string type_str    = (g_position.PositionType() == POSITION_TYPE_BUY) ? "BUY" : "SELL";
         double volume      = g_position.Volume();
         double open_price  = g_position.PriceOpen();
         double curr_price  = g_position.PriceCurrent();
         double sl          = g_position.StopLoss();
         double tp          = g_position.TakeProfit();
         double profit      = g_position.Profit();
         datetime open_time = (datetime)g_position.Time();

         positions_json += StringFormat(
            "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":\"%s\",\"lots\":%.2f,\"openPrice\":%.5f,\"currentPrice\":%.5f,\"stopLoss\":%.5f,\"takeProfit\":%.5f,\"profitUsd\":%.2f,\"openTime\":\"%s\"}",
            ticket, sym, type_str, volume, open_price, curr_price, sl, tp, profit, TimeToString(open_time, TIME_DATE|TIME_SECONDS)
         );
         count++;
        }
     }
   positions_json += "]";

   string json = StringFormat(
      "{\"account\":%I64d,\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,\"openPositions\":%s,\"dailyPnlUsd\":%.2f,\"riskLocked\":%s,\"equityFloorLocked\":%s,\"terminalTime\":\"%s\"}",
      g_account.Login(),
      m.current_balance,
      m.current_equity,
      m.margin_used,
      m.free_margin,
      positions_json,
      m.daily_net_pnl,
      m.risk_locked ? "true" : "false",
      m.equity_floor_locked ? "true" : "false",
      TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   );

   return json;
  }

//+------------------------------------------------------------------+
//| On-Chart Heads-Up Display (HUD) Formatter                        |
//+------------------------------------------------------------------+
void UpdateChartHUD()
  {
   if(!InpShowChartHUD)
     {
      Comment("");
      return;
     }

   RiskMetrics m = g_risk.GetMetrics();

   string hud = StringFormat(
      "==========================================================\n"
      "   FALCON FX · SMC EXECUTION EA (DERIV SVG-SERVER-03)     \n"
      "==========================================================\n"
      "  ACCOUNT TELEMETRY:\n"
      "    • Account: #%I64d | Server: %s\n"
      "    • Equity: $%.2f | Balance: $%.2f | Free Margin: $%.2f\n"
      "    • Margin Usage: %.1f%% | Peak Equity: $%.2f\n"
      "----------------------------------------------------------\n"
      "  INDEPENDENT RISK ENGINE (1000-LINE NATIVE SUITE):\n"
      "    • Equity Floor ($15.00): %s ($%.2f)\n"
      "    • Daily Loss Lock ($0.40): %s (Today: $%.2f)\n"
      "    • Weekly P&L ($1.00 Limit): $%.2f\n"
      "    • Cumulative Drawdown ($5.00 Limit): $%.2f\n"
      "    • Loss Streak: %d / %d | Cooldown: %s\n"
      "    • Open Positions: %d / %d\n"
      "----------------------------------------------------------\n"
      "  BRIDGE TELEMETRY:\n"
      "    • Bridge Connection: %s\n"
      "    • Round-Trip Latency: %u ms | Failures: %d\n"
      "    • Last Heartbeat: %s\n"
      "==========================================================\n",
      g_account.Login(),
      AccountInfoString(ACCOUNT_SERVER),
      m.current_equity, m.current_balance, m.free_margin,
      m.margin_usage_percent, m.peak_equity,
      m.equity_floor_locked ? "[TRIPPED / LOCKED]" : "[ACTIVE / PROTECTED]", m.current_equity,
      m.risk_locked ? "[TRIPPED / LOCKED]" : "[ACTIVE / PROTECTED]", m.daily_net_pnl,
      m.weekly_net_pnl,
      m.current_drawdown,
      m.consecutive_losses, InpMaxLossStreak,
      m.cooldown_active ? StringFormat("[ACTIVE until %s]", TimeToString(m.cooldown_expiry)) : "[OFF]",
      PositionsTotal(), InpMaxPositions,
      g_bridge.IsOnline() ? "ONLINE (CONNECTED)" : "OFFLINE (WAITING)",
      g_bridge.GetLatencyMs(), g_bridge.GetConsecutiveErrors(),
      (g_bridge.GetLastSyncTime() > 0) ? TimeToString(g_bridge.GetLastSyncTime(), TIME_DATE|TIME_SECONDS) : "NEVER"
   );

   Comment(hud);
  }

//+------------------------------------------------------------------+
//| Process Inbound Remote Bridge Command                            |
//+------------------------------------------------------------------+
void ProcessBridgeCommand(const BridgeCommand &cmd)
  {
   if(!cmd.valid || cmd.id == "")
      return;

   // Idempotency check: guard against re-executing identical command
   if(g_bridge.IsCommandAlreadyProcessed(cmd.id))
     {
      PrintFormat("[FalconEA] Command ID %s already processed. Skipping.", cmd.id);
      return;
     }

   PrintFormat("[FalconEA] Executing command %s (ID: %s)", cmd.type, cmd.id);

   // 1. FLATTEN ALL POSITIONS
   if(cmd.type == "FLATTEN_ALL")
     {
      g_risk.EmergencyFlatten("REMOTE_BRIDGE_COMMAND");
      g_bridge.MarkCommandAsProcessed(cmd.id);
      g_bridge.SendOrderResult(0, cmd.id, true, "Emergency flatten executed successfully", 0.0);
      return;
     }

   // 2. CLOSE SPECIFIC POSITION
   if(cmd.type == "CLOSE_POSITION")
     {
      ulong ticket = cmd.ticket;
      if(ticket <= 0)
        {
         g_bridge.MarkCommandAsProcessed(cmd.id);
         g_bridge.SendOrderResult(ticket, cmd.id, false, "Invalid ticket for close", 0.0);
         return;
        }

      if(!g_trade.PositionClose(ticket))
        {
         string err_msg = g_trade.ResultRetcodeDescription();
         PrintFormat("[FalconEA] Failed to close ticket #%I64u: %s", ticket, err_msg);
         g_bridge.SendOrderResult(ticket, cmd.id, false, err_msg, 0.0);
        }
      else
        {
         PrintFormat("[FalconEA] Closed ticket #%I64u successfully.", ticket);
         g_bridge.MarkCommandAsProcessed(cmd.id);
         g_bridge.SendOrderResult(ticket, cmd.id, true, "Position closed", g_trade.ResultPrice());
        }
      return;
     }

   // 3. EXECUTE NEW ORDER
   if(cmd.type == "EXECUTE_ORDER")
     {
      string symbol = cmd.symbol;
      string dir    = cmd.direction;
      double sl     = cmd.stop_loss;
      double tp     = cmd.take_profit;

      if(!g_symbol.Name(symbol))
        {
         g_bridge.MarkCommandAsProcessed(cmd.id);
         g_bridge.SendOrderResult(0, cmd.id, false, StringFormat("Symbol %s not found in terminal", symbol), 0.0);
         return;
        }

      g_symbol.RefreshRates();
      ENUM_ORDER_TYPE order_type;
      double price = 0.0;

      if(dir == "BUY")
        {
         order_type = ORDER_TYPE_BUY;
         price = g_symbol.Ask();
        }
      else if(dir == "SELL")
        {
         order_type = ORDER_TYPE_SELL;
         price = g_symbol.Bid();
        }
      else
        {
         g_bridge.MarkCommandAsProcessed(cmd.id);
         g_bridge.SendOrderResult(0, cmd.id, false, "Invalid order direction", 0.0);
         return;
        }

      // Dynamic Fractional Lot Sizing Calculation
      double calculated_lots = cmd.lots;
      if(calculated_lots <= 0.0)
        {
         calculated_lots = g_risk.CalculateLots(symbol, InpTargetRiskPerTrade, price, sl);
        }

      // Pre-trade Invariant & Circuit Breaker Validation
      ENUM_RISK_BREACH_REASON reject_reason;
      if(!g_risk.ValidateNewOrder(symbol, order_type, calculated_lots, price, sl, tp, reject_reason))
        {
         string reject_msg = StringFormat("Rejected by RiskEngine (Reason Code: %d)", reject_reason);
         PrintFormat("[FalconEA] %s for %s %s", reject_msg, dir, symbol);
         g_bridge.MarkCommandAsProcessed(cmd.id);
         g_bridge.SendOrderResult(0, cmd.id, false, reject_msg, 0.0);
         return;
        }

      // Execute Order via CTrade
      bool placed = false;
      if(order_type == ORDER_TYPE_BUY)
         placed = g_trade.Buy(calculated_lots, symbol, price, sl, tp, "FalconFX_SMC");
      else
         placed = g_trade.Sell(calculated_lots, symbol, price, sl, tp, "FalconFX_SMC");

      g_bridge.MarkCommandAsProcessed(cmd.id);

      if(!placed)
        {
         string err_desc = g_trade.ResultRetcodeDescription();
         PrintFormat("[FalconEA] Execution failed on %s: %s", symbol, err_desc);
         g_bridge.SendOrderResult(0, cmd.id, false, err_desc, 0.0);
        }
      else
        {
         ulong deal_ticket = g_trade.ResultOrder();
         double fill_price = g_trade.ResultPrice();
         double slippage = MathAbs(fill_price - price) / g_symbol.Point();

         PrintFormat("[FalconEA] Order executed successfully! Ticket #%I64u @ %.5f (Slippage: %.1f pts)",
                     deal_ticket, fill_price, slippage);
         g_bridge.SendOrderResult(deal_ticket, cmd.id, true, "Order filled successfully", fill_price, slippage);
        }
      return;
     }

   // 4. PING
   if(cmd.type == "PING")
     {
      g_bridge.MarkCommandAsProcessed(cmd.id);
      g_bridge.SendOrderResult(0, cmd.id, true, "PONG", 0.0);
      return;
     }
  }

//+------------------------------------------------------------------+
//| Expert Initialization Function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   Print("=================================================");
   Print("       FALCON EA · DERIV SVG MT5 BRIDGE          ");
   Print("=================================================");

   // Configure CTrade execution properties
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(20);
   g_trade.SetTypeFilling(ORDER_FILLING_IOC);

   // Configure RiskEngine with user guardrails
   RiskConfig config;
   config.equity_floor               = InpEquityFloor;
   config.equity_floor_warning       = InpEquityFloorWarning;
   config.max_daily_loss             = InpMaxDailyLoss;
   config.max_weekly_loss            = InpMaxWeeklyLoss;
   config.max_total_loss             = InpMaxTotalLoss;
   config.default_risk_per_trade     = InpTargetRiskPerTrade;
   config.hard_max_risk_per_trade    = InpHardMaxRiskPerTrade;
   config.max_open_positions         = InpMaxPositions;
   config.max_margin_usage_percent   = InpMaxMarginPercent;
   config.max_spread_points          = InpMaxSpreadPoints;
   config.max_consecutive_losses     = InpMaxLossStreak;
   config.cooldown_duration_sec      = InpCooldownSec;
   config.max_daily_trades           = 15;
   config.require_hard_sl            = true;
   config.break_even_enabled         = InpBreakEvenEnabled;
   config.break_even_trigger_rr      = InpBreakEvenTriggerRR;
   config.break_even_offset_points   = InpBreakEvenOffsetPts;
   config.trailing_stop_enabled      = InpTrailingEnabled;
   config.trailing_step_points       = InpTrailingStepPts;
   config.trailing_distance_points   = InpTrailingDistPts;
   config.emergency_flatten_retries  = 5;

   g_risk.Init(config);

   // Configure Bridge Client with API Key Authentication
   g_bridge.Init(InpBridgeUrl, 3000, InpBridgeApiKey);

   // Establish High-Resolution Sync Timer
   if(!EventSetTimer(InpSyncIntervalSec))
     {
      Print("[FalconEA] Failed to initialize EventSetTimer!");
      return INIT_FAILED;
     }

   UpdateChartHUD();
   PrintFormat("[FalconEA] Initialized successfully. High-resolution timer set to %d sec.", InpSyncIntervalSec);
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
//| Expert Deinitialization Function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
   PrintFormat("[FalconEA] Deinitialized safely. Reason code: %d", reason);
  }

//+------------------------------------------------------------------+
//| Expert Tick Handler                                              |
//| Real-time invariant enforcement and position defense             |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Invariant check on every single incoming price tick
   g_risk.CheckRiskLimits();

   // Dynamic active position defense (Break-Even & Trailing SL)
   g_risk.RunPositionDefense();
  }

//+------------------------------------------------------------------+
//| Expert Timer Handler                                             |
//| 1-second cadence telemetry broadcast and command polling         |
//+------------------------------------------------------------------+
void OnTimer()
  {
   // 1. Maintain invariant limits
   g_risk.CheckRiskLimits();

   // 2. Active position defense
   g_risk.RunPositionDefense();

   // 3. Telemetry broadcast to Node.js bridge
   string telemetry_json = BuildFullTelemetryJson();
   bool sent = g_bridge.SendTelemetry(telemetry_json);

   // 4. Poll and execute pending commands
   if(sent)
     {
      BridgeCommand commands[];
      if(g_bridge.PollCommands(commands))
        {
         int count = ArraySize(commands);
         for(int i = 0; i < count; i++)
           {
            ProcessBridgeCommand(commands[i]);
           }
        }
     }

   // 5. Refresh Visual HUD
   UpdateChartHUD();
  }

//+------------------------------------------------------------------+
//| Trade Transaction Event Handler                                  |
//| Captures closed deals to update win/loss streak metrics          |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
     {
      ulong deal_ticket = trans.deal;
      if(deal_ticket > 0)
        {
         g_risk.OnDealClosed(deal_ticket);
        }
     }
  }
//+------------------------------------------------------------------+
