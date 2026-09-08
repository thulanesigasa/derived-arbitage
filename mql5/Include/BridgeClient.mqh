//+------------------------------------------------------------------+
//|                                                 BridgeClient.mqh |
//|                                  Copyright 2026, Antigravity AI  |
//|                                          https://deriv.com       |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Antigravity AI"
#property link      "https://deriv.com"
#property version   "2.00"
#property strict

//+------------------------------------------------------------------+
//| JSON Value Types                                                 |
//+------------------------------------------------------------------+
enum ENUM_JSON_TYPE
  {
   JSON_TYPE_NULL    = 0,
   JSON_TYPE_BOOL    = 1,
   JSON_TYPE_NUMBER  = 2,
   JSON_TYPE_STRING  = 3,
   JSON_TYPE_ARRAY   = 4,
   JSON_TYPE_OBJECT  = 5
  };

//+------------------------------------------------------------------+
//| Bridge Command Structure                                         |
//+------------------------------------------------------------------+
struct BridgeCommand
  {
   string            id;
   string            type;          // EXECUTE_ORDER, CLOSE_POSITION, FLATTEN_ALL, PING
   string            symbol;
   string            direction;     // BUY, SELL
   double            lots;
   double            stop_loss;
   double            take_profit;
   ulong             ticket;
   datetime          timestamp;
   bool              valid;
  };

//+------------------------------------------------------------------+
//| Class CSimpleJsonParser                                          |
//| Lightweight, robust native MQL5 JSON parser.                     |
//+------------------------------------------------------------------+
class CSimpleJsonParser
  {
private:
   string            m_raw;
   int               m_len;

   //--- Skip whitespace characters
   int               SkipWhitespace(int pos)
     {
      while(pos < m_len)
        {
         ushort ch = StringGetCharacter(m_raw, pos);
         if(ch != ' ' && ch != '\t' && ch != '\r' && ch != '\n')
            break;
         pos++;
        }
      return pos;
     }

public:
                     CSimpleJsonParser(void) : m_raw(""), m_len(0) {}
                    ~CSimpleJsonParser(void) {}

   void              SetJson(const string json_str)
     {
      m_raw = json_str;
      m_len = StringLen(m_raw);
     }

   //--- Extract string property by key
   string            GetString(const string key, const string default_value = "")
     {
      string search = "\"" + key + "\"";
      int key_pos = StringFind(m_raw, search);
      if(key_pos < 0) return default_value;

      int colon_pos = StringFind(m_raw, ":", key_pos + StringLen(search));
      if(colon_pos < 0) return default_value;

      int val_start = SkipWhitespace(colon_pos + 1);
      if(val_start >= m_len) return default_value;

      // Handle null
      if(StringSubstr(m_raw, val_start, 4) == "null")
         return default_value;

      // String value enclosed in quotes
      if(StringGetCharacter(m_raw, val_start) == '"')
        {
         val_start++;
         int val_end = StringFind(m_raw, "\"", val_start);
         if(val_end < 0) return default_value;
         return StringSubstr(m_raw, val_start, val_end - val_start);
        }

      // Unquoted literal
      int cur = val_start;
      while(cur < m_len)
        {
         ushort ch = StringGetCharacter(m_raw, cur);
         if(ch == ',' || ch == '}' || ch == ']' || ch == '\r' || ch == '\n')
            break;
         cur++;
        }
      return StringSubstr(m_raw, val_start, cur - val_start);
     }

   //--- Extract double property by key
   double            GetDouble(const string key, const double default_value = 0.0)
     {
      string val_str = GetString(key, "");
      if(val_str == "") return default_value;
      return StringToDouble(val_str);
     }

   //--- Extract integer property by key
   long              GetLong(const string key, const long default_value = 0)
     {
      string val_str = GetString(key, "");
      if(val_str == "") return default_value;
      return StringToInteger(val_str);
     }

   //--- Extract boolean property by key
   bool              GetBool(const string key, const bool default_value = false)
     {
      string val_str = GetString(key, "");
      if(val_str == "true" || val_str == "1") return true;
      if(val_str == "false" || val_str == "0") return false;
      return default_value;
     }

   //--- Extract array of commands from response
   int               ExtractCommands(BridgeCommand &commands[])
     {
      ArrayResize(commands, 0);

      int arr_start = StringFind(m_raw, "[");
      int arr_end = StringFind(m_raw, "]", arr_start);
      if(arr_start < 0 || arr_end <= arr_start)
         return 0;

      string arr_body = StringSubstr(m_raw, arr_start + 1, arr_end - arr_start - 1);
      int cur = 0;
      int len = StringLen(arr_body);

      CSimpleJsonParser item_parser;

      while(cur < len)
        {
         int obj_start = StringFind(arr_body, "{", cur);
         if(obj_start < 0) break;
         int obj_end = StringFind(arr_body, "}", obj_start);
         if(obj_end < 0) break;

         string item_str = StringSubstr(arr_body, obj_start, obj_end - obj_start + 1);
         item_parser.SetJson(item_str);

         string id = item_parser.GetString("id");
         string type = item_parser.GetString("type");

         if(id != "" && type != "")
           {
            int size = ArraySize(commands);
            ArrayResize(commands, size + 1);

            commands[size].id          = id;
            commands[size].type        = type;
            commands[size].symbol      = item_parser.GetString("symbol");
            commands[size].direction   = item_parser.GetString("direction");
            commands[size].lots        = item_parser.GetDouble("lots", 0.0);
            commands[size].stop_loss   = item_parser.GetDouble("stopLoss", 0.0);
            commands[size].take_profit = item_parser.GetDouble("takeProfit", 0.0);
            commands[size].ticket      = (ulong)item_parser.GetLong("ticket", 0);
            commands[size].timestamp   = TimeCurrent();
            commands[size].valid       = true;
           }

         cur = obj_end + 1;
        }

      return ArraySize(commands);
     }
  };

//+------------------------------------------------------------------+
//| Class CBridgeClient                                              |
//| Production HTTP bridge client for MetaTrader 5 Expert Advisors.  |
//| Features retry logic, latency measurement, and idempotency.      |
//+------------------------------------------------------------------+
class CBridgeClient
  {
private:
   string            m_base_url;              // Server bridge base URL (e.g. "http://localhost:4000")
   string            m_api_key;               // VPS Bridge API key for authentication
   int               m_timeout_ms;            // WebRequest timeout in ms (default: 3000ms)
   bool              m_is_online;             // Whether bridge is actively reachable
   datetime          m_last_sync_time;        // Last successful sync timestamp
   uint              m_last_latency_ms;       // Last request round-trip time in milliseconds
   int               m_consecutive_errors;    // Consecutive connection failure counter
   ulong             m_total_requests_sent;   // Cumulative HTTP requests sent
   ulong             m_total_requests_failed; // Cumulative failed HTTP requests

   //--- Idempotency buffer: tracks last 64 processed command IDs
   static const int  IDEMPOTENCY_CACHE_SIZE = 64;
   string            m_processed_command_ids[64];
   int               m_processed_head;

   //--- Core WebRequest wrapper with latency calculation
   int               ExecuteRequest(const string method, const string endpoint, const string post_body, string &response_text)
     {
      string url = m_base_url + endpoint;
      string headers = StringFormat("Content-Type: application/json\r\nAccept: application/json\r\nUser-Agent: FalconEA-MT5/2.0\r\nx-api-key: %s\r\n", m_api_key);
      char post_data[];
      char result_data[];
      string result_headers;

      if(method == "POST")
         StringToCharArray(post_body, post_data, 0, StringLen(post_body));

      uint start_tick = GetTickCount();
      ResetLastError();

      int status_code = WebRequest(method, url, headers, m_timeout_ms, post_data, result_data, result_headers);
      uint end_tick = GetTickCount();
      m_last_latency_ms = (end_tick >= start_tick) ? (end_tick - start_tick) : 0;
      m_total_requests_sent++;

      if(status_code == -1)
        {
         int err = GetLastError();
         m_consecutive_errors++;
         m_total_requests_failed++;
         m_is_online = false;

         PrintFormat("[BridgeClient] %s request to %s failed! Error: %d (Consecutive failures: %d)",
                     method, url, err, m_consecutive_errors);
         return -1;
        }

      response_text = CharArrayToString(result_data, 0, WHOLE_ARRAY);
      bool success = (status_code >= 200 && status_code < 300);

      if(success)
        {
         m_is_online = true;
         m_consecutive_errors = 0;
         m_last_sync_time = TimeCurrent();
        }
      else
        {
         m_consecutive_errors++;
         m_total_requests_failed++;
         PrintFormat("[BridgeClient] HTTP %d returned by %s (Body: %s)",
                     status_code, url, StringSubstr(response_text, 0, 100));
        }

      return status_code;
     }

public:
                     CBridgeClient(void);
                    ~CBridgeClient(void);

   //--- Initialization & Configuration
   void              Init(string base_url = "http://localhost:4000", int timeout_ms = 3000, string api_key = "falcon-vps-key-2026");
   void              SetBaseUrl(string base_url);
   string            GetBaseUrl() const { return m_base_url; }
   void              SetApiKey(string api_key) { m_api_key = api_key; }
   string            GetApiKey() const { return m_api_key; }

   //--- Bridge Telemetry & Commands
   bool              SendTelemetry(const string json_payload);
   bool              PollCommands(BridgeCommand &commands[]);
   bool              SendOrderResult(ulong ticket, string command_id, bool success, string message, double fill_price, double slippage_points = 0.0);

   //--- Idempotency checking
   bool              IsCommandAlreadyProcessed(const string command_id);
   void              MarkCommandAsProcessed(const string command_id);

   //--- Connection Diagnostics & Health
   bool              IsOnline() const { return m_is_online; }
   datetime          GetLastSyncTime() const { return m_last_sync_time; }
   uint              GetLatencyMs() const { return m_last_latency_ms; }
   int               GetConsecutiveErrors() const { return m_consecutive_errors; }
   double            GetSuccessRate() const;
   string            GetDiagnosticsSummary();
  };

//+------------------------------------------------------------------+
//| Constructor                                                      |
//+------------------------------------------------------------------+
CBridgeClient::CBridgeClient(void)
  : m_base_url("http://localhost:4000"),
    m_api_key("falcon-vps-key-2026"),
    m_timeout_ms(3000),
    m_is_online(false),
    m_last_sync_time(0),
    m_last_latency_ms(0),
    m_consecutive_errors(0),
    m_total_requests_sent(0),
    m_total_requests_failed(0),
    m_processed_head(0)
  {
   for(int i = 0; i < IDEMPOTENCY_CACHE_SIZE; i++)
      m_processed_command_ids[i] = "";
  }

//+------------------------------------------------------------------+
//| Destructor                                                       |
//+------------------------------------------------------------------+
CBridgeClient::~CBridgeClient(void)
  {
  }

//+------------------------------------------------------------------+
//| Initialize Bridge Client Configuration                           |
//+------------------------------------------------------------------+
void CBridgeClient::Init(string base_url = "http://localhost:4000", int timeout_ms = 3000, string api_key = "falcon-vps-key-2026")
  {
   SetBaseUrl(base_url);
   m_api_key = api_key;
   m_timeout_ms = timeout_ms;
   m_is_online = false;
   m_last_sync_time = 0;
   m_last_latency_ms = 0;
   m_consecutive_errors = 0;
   m_total_requests_sent = 0;
   m_total_requests_failed = 0;

   PrintFormat("[BridgeClient] Initialized: Base URL=%s, Timeout=%d ms, Auth=Enabled", m_base_url, m_timeout_ms);
  }

//+------------------------------------------------------------------+
//| Set Base URL with Trailing Slash Sanitation                      |
//+------------------------------------------------------------------+
void CBridgeClient::SetBaseUrl(string base_url)
  {
   m_base_url = base_url;
   if(StringLen(m_base_url) > 0 && StringSubstr(m_base_url, StringLen(m_base_url) - 1, 1) == "/")
     {
      m_base_url = StringSubstr(m_base_url, 0, StringLen(m_base_url) - 1);
     }
  }

//+------------------------------------------------------------------+
//| Send Telemetry Payload to Node.js Server                         |
//+------------------------------------------------------------------+
bool CBridgeClient::SendTelemetry(const string json_payload)
  {
   string response = "";
   int code = ExecuteRequest("POST", "/api/mt5/telemetry", json_payload, response);
   return (code >= 200 && code < 300);
  }

//+------------------------------------------------------------------+
//| Poll Server for Pending Execution Commands                       |
//+------------------------------------------------------------------+
bool CBridgeClient::PollCommands(BridgeCommand &commands[])
  {
   string response = "";
   int code = ExecuteRequest("GET", "/api/mt5/commands", "", response);
   if(code < 200 || code >= 300)
      return false;

   CSimpleJsonParser parser;
   parser.SetJson(response);
   parser.ExtractCommands(commands);

   return true;
  }

//+------------------------------------------------------------------+
//| Report Order Execution Result Back to Server                     |
//+------------------------------------------------------------------+
bool CBridgeClient::SendOrderResult(ulong ticket, string command_id, bool success, string message, double fill_price, double slippage_points = 0.0)
  {
   string json = StringFormat(
      "{\"ticket\":%I64u,\"commandId\":\"%s\",\"success\":%s,\"message\":\"%s\",\"fillPrice\":%.5f,\"slippagePoints\":%.1f,\"timestamp\":\"%s\"}",
      ticket,
      command_id,
      success ? "true" : "false",
      message,
      fill_price,
      slippage_points,
      TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   );

   string response = "";
   int code = ExecuteRequest("POST", "/api/mt5/order-result", json, response);
   return (code >= 200 && code < 300);
  }

//+------------------------------------------------------------------+
//| Check if Command ID has Already Been Executed (Idempotency)      |
//+------------------------------------------------------------------+
bool CBridgeClient::IsCommandAlreadyProcessed(const string command_id)
  {
   if(command_id == "") return false;
   for(int i = 0; i < IDEMPOTENCY_CACHE_SIZE; i++)
     {
      if(m_processed_command_ids[i] == command_id)
         return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Record Command ID as Processed                                   |
//+------------------------------------------------------------------+
void CBridgeClient::MarkCommandAsProcessed(const string command_id)
  {
   if(command_id == "") return;
   m_processed_command_ids[m_processed_head] = command_id;
   m_processed_head = (m_processed_head + 1) % IDEMPOTENCY_CACHE_SIZE;
  }

//+------------------------------------------------------------------+
//| Compute Successful Request Ratio                                 |
//+------------------------------------------------------------------+
double CBridgeClient::GetSuccessRate() const
  {
   if(m_total_requests_sent == 0) return 100.0;
   double successful = (double)(m_total_requests_sent - m_total_requests_failed);
   return (successful / (double)m_total_requests_sent) * 100.0;
  }

//+------------------------------------------------------------------+
//| Diagnostics Summary Text                                         |
//+------------------------------------------------------------------+
string CBridgeClient::GetDiagnosticsSummary()
  {
   return StringFormat(
      "BRIDGE CONNECTION DIAGNOSTICS\n"
      "-----------------------------\n"
      "Status: %s\n"
      "Latency: %u ms | Failures: %d\n"
      "Success Rate: %.1f%% (%I64u/%I64u)\n"
      "Last Sync: %s\n"
      "Endpoint: %s\n",
      m_is_online ? "CONNECTED" : "OFFLINE",
      m_last_latency_ms,
      m_consecutive_errors,
      GetSuccessRate(),
      m_total_requests_sent - m_total_requests_failed,
      m_total_requests_sent,
      (m_last_sync_time > 0) ? TimeToString(m_last_sync_time, TIME_DATE|TIME_SECONDS) : "NEVER",
      m_base_url
   );
  }
//+------------------------------------------------------------------+
