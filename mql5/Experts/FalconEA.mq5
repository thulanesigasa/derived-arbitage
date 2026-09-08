//+------------------------------------------------------------------+
//|                                                     FalconEA.mq5 |
//|                                  Copyright 2026, Antigravity AI  |
//|                                          https://deriv.com       |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Antigravity AI"
#property link        "https://deriv.com"
#property version     "1.00"
#property description "Falcon FX & SMC Execution EA with Native Independent Risk Engine"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>
#include "..\Include\RiskEngine.mqh"
#include "..\Include\BridgeClient.mqh"

//+------------------------------------------------------------------+
//| EA Inputs                                                        |
//+------------------------------------------------------------------+
input group "--- Bridge Configuration ---"
input string   InpBridgeUrl         = "http://localhost:4000"; // Server Bridge Base URL
input int      InpSyncIntervalSec   = 1;                      // Sync / Polling Interval (seconds)
input ulong    InpMagicNumber       = 20260908;               // Expert Magic Number

input group "--- Risk Engine Hard Limits ---"
input double   InpEquityFloor       = 15.00;                  // Absolute Equity Floor ($)
input double   InpMaxDailyLoss      = 0.40;                   // Maximum Daily Loss ($)
input int      InpMaxPositions      = 1;                      // Max Simultaneous Open Positions
input double   InpDefaultSLLots     = 0.20;                   // Fallback Lot Size

//+------------------------------------------------------------------+
//| Global Objects                                                   |
//+------------------------------------------------------------------+
CRiskEngine    g_risk;
CBridgeClient  g_bridge;
CTrade         g_trade;
CAccountInfo   g_account;
CPositionInfo  g_position;
CSymbolInfo    g_symbol;

//+------------------------------------------------------------------+
//| Helper: Extract string value by JSON key                         |
//+------------------------------------------------------------------+
string JsonGetString(const string json, const string key)
  {
   string search = "\"" + key + "\":\"";
   int start = StringFind(json, search);
   if(start < 0)
      return "";
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if(end < 0)
      return "";
   return StringSubstr(json, start, end - start);
  }

//+------------------------------------------------------------------+
//| Helper: Extract numeric value by JSON key                        |
//+------------------------------------------------------------------+
double JsonGetDouble(const string json, const string key)
  {
   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start < 0)
      return 0.0;
   start += StringLen(search);
   
   // Skip spaces or quotes
   while(start < StringLen(json) && (StringSubstr(json, start, 1) == " " || StringSubstr(json, start, 1) == "\""))
      start++;

   int end = start;
   while(end < StringLen(json))
     {
      string ch = StringSubstr(json, end, 1);
      if(ch == "," || ch == "}" || ch == "]" || ch == "\"" || ch == "\r" || ch == "\n")
         break;
      end++;
     }
   string val_str = StringSubstr(json, start, end - start);
   return StringToDouble(val_str);
  }

//+------------------------------------------------------------------+
//| Helper: Build JSON telemetry payload                             |
//+------------------------------------------------------------------+
string BuildTelemetryJson()
  {
   double balance     = g_account.Balance();
   double equity      = g_account.Equity();
   double margin      = g_account.Margin();
   double free_margin = g_account.FreeMargin();
   double daily_pnl   = g_risk.GetDailyPnL();
   bool risk_locked   = g_risk.IsRiskLocked();
   bool floor_locked  = g_risk.IsEquityFloorLocked();
   long login         = g_account.Login();

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
      login, balance, equity, margin, free_margin, positions_json, daily_pnl,
      risk_locked ? "true" : "false",
      floor_locked ? "true" : "false",
      TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   );

   return json;
  }

//+------------------------------------------------------------------+
//| Execute Received Bridge Command                                  |
//+------------------------------------------------------------------+
void ProcessCommand(const string cmd_json)
  {
   string cmd_id   = JsonGetString(cmd_json, "id");
   string cmd_type = JsonGetString(cmd_json, "type");
   
   if(cmd_id == "" || cmd_type == "")
      return;

   PrintFormat("[FalconEA] Received command: %s (ID: %s)", cmd_type, cmd_id);

   // 1. FLATTEN ALL POSITIONS
   if(cmd_type == "FLATTEN_ALL")
     {
      g_risk.EmergencyFlatten("MANUAL_REMOTE_FLATTEN");
      g_bridge.SendOrderResult(0, cmd_id, true, "Emergency flatten executed successfully", 0.0);
      return;
     }

   // 2. CLOSE SPECIFIC POSITION
   if(cmd_type == "CLOSE_POSITION")
     {
      ulong ticket = (ulong)JsonGetDouble(cmd_json, "ticket");
      if(ticket <= 0)
        {
         g_bridge.SendOrderResult(ticket, cmd_id, false, "Invalid ticket for close", 0.0);
         return;
        }

      if(!g_trade.PositionClose(ticket))
        {
         string err_msg = g_trade.ResultRetcodeDescription();
         PrintFormat("[FalconEA] Failed to close ticket #%I64u: %s", ticket, err_msg);
         g_bridge.SendOrderResult(ticket, cmd_id, false, err_msg, 0.0);
        }
      else
        {
         PrintFormat("[FalconEA] Successfully closed ticket #%I64u", ticket);
         g_bridge.SendOrderResult(ticket, cmd_id, true, "Position closed", g_trade.ResultPrice());
        }
      return;
     }

   // 3. EXECUTE NEW ORDER
   if(cmd_type == "EXECUTE_ORDER")
     {
      string symbol      = JsonGetString(cmd_json, "symbol");
      string dir_str     = JsonGetString(cmd_json, "direction");
      double lots        = JsonGetDouble(cmd_json, "lots");
      double sl          = JsonGetDouble(cmd_json, "stopLoss");
      double tp          = JsonGetDouble(cmd_json, "takeProfit");

      if(lots <= 0.0)
         lots = InpDefaultSLLots;

      if(!g_symbol.Name(symbol))
        {
         PrintFormat("[FalconEA] Symbol %s not found in terminal market watch!", symbol);
         g_bridge.SendOrderResult(0, cmd_id, false, "Symbol not found in MT5", 0.0);
         return;
        }

      g_symbol.RefreshRates();
      lots = g_risk.NormalizeVolume(symbol, lots);

      ENUM_ORDER_TYPE ord_type;
      double price = 0.0;

      if(dir_str == "BUY")
        {
         ord_type = ORDER_TYPE_BUY;
         price = g_symbol.Ask();
        }
      else if(dir_str == "SELL")
        {
         ord_type = ORDER_TYPE_SELL;
         price = g_symbol.Bid();
        }
      else
        {
         g_bridge.SendOrderResult(0, cmd_id, false, "Invalid direction (expected BUY or SELL)", 0.0);
         return;
        }

      // STRICT RISK ENGINE VALIDATION
      if(!g_risk.ValidateNewOrder(symbol, ord_type, lots, price, sl, tp))
        {
         PrintFormat("[FalconEA] Order validation rejected by client-side RiskEngine for %s %s", dir_str, symbol);
         g_bridge.SendOrderResult(0, cmd_id, false, "Rejected by MT5 RiskEngine invariant limits", 0.0);
         return;
        }

      // Execute order via CTrade
      bool success = false;
      if(ord_type == ORDER_TYPE_BUY)
        {
         success = g_trade.Buy(lots, symbol, price, sl, tp, "FalconFX_SMC");
        }
      else
        {
         success = g_trade.Sell(lots, symbol, price, sl, tp, "FalconFX_SMC");
        }

      if(!success)
        {
         string err_msg = g_trade.ResultRetcodeDescription();
         PrintFormat("[FalconEA] Order execution failed for %s: %s (Retcode: %u)", symbol, err_msg, g_trade.ResultRetcode());
         g_bridge.SendOrderResult(0, cmd_id, false, err_msg, 0.0);
        }
      else
        {
         ulong deal_ticket = g_trade.ResultOrder();
         double fill_price = g_trade.ResultPrice();
         PrintFormat("[FalconEA] Order executed successfully! Ticket: #%I64u, Fill: %.5f", deal_ticket, fill_price);
         g_bridge.SendOrderResult(deal_ticket, cmd_id, true, "Order executed successfully", fill_price);
        }
      return;
     }

   // 4. PING
   if(cmd_type == "PING")
     {
      g_bridge.SendOrderResult(0, cmd_id, true, "PONG", 0.0);
      return;
     }
  }

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   Print("=================================================");
   Print("       Falcon EA - Deriv SVG MT5 Bridge          ");
   Print("=================================================");

   // Configure trade object
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(10);
   g_trade.SetTypeFilling(ORDER_FILLING_IOC);

   // Initialize Independent Risk Engine
   g_risk.Init(InpEquityFloor, InpMaxDailyLoss, InpMaxPositions);

   // Initialize Bridge Client
   g_bridge.Init(InpBridgeUrl, 3000);

   // Start timer for periodic telemetry and command polling
   if(!EventSetTimer(InpSyncIntervalSec))
     {
      Print("[FalconEA] Failed to create timer!");
      return INIT_FAILED;
     }

   PrintFormat("[FalconEA] Successfully initialized. Timer set to %d sec. Server endpoint: %s", 
               InpSyncIntervalSec, InpBridgeUrl);
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   PrintFormat("[FalconEA] Deinitialized. Reason code: %d", reason);
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//| Enforces invariant protection on every incoming price tick       |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Invariant check on every tick
   g_risk.CheckRiskLimits();
  }

//+------------------------------------------------------------------+
//| Expert timer function                                            |
//| Periodic telemetry broadcast and command polling                 |
//+------------------------------------------------------------------+
void OnTimer()
  {
   // 1. Maintain invariant limits
   g_risk.CheckRiskLimits();

   // 2. Broadcast telemetry to Bridge
   string telemetry = BuildTelemetryJson();
   bool sent = g_bridge.SendTelemetry(telemetry);

   // 3. Poll for pending commands if bridge reachable
   if(sent)
     {
      string cmd_response = "";
      if(g_bridge.PollCommands(cmd_response) && StringLen(cmd_response) > 5)
        {
         // Check if response contains command objects
         // In format: {"commands":[{...}]}
         int arr_start = StringFind(cmd_response, "[");
         int arr_end = StringFind(cmd_response, "]");
         if(arr_start >= 0 && arr_end > arr_start)
           {
            string body = StringSubstr(cmd_response, arr_start + 1, arr_end - arr_start - 1);
            int cur = 0;
            while(cur < StringLen(body))
              {
               int obj_start = StringFind(body, "{", cur);
               if(obj_start < 0)
                  break;
               int obj_end = StringFind(body, "}", obj_start);
               if(obj_end < 0)
                  break;

               string single_cmd = StringSubstr(body, obj_start, obj_end - obj_start + 1);
               ProcessCommand(single_cmd);
               cur = obj_end + 1;
              }
           }
        }
     }
  }
//+------------------------------------------------------------------+
