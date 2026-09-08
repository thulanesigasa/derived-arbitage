//+------------------------------------------------------------------+
//|                                                 BridgeClient.mqh |
//|                                  Copyright 2026, Antigravity AI  |
//|                                          https://deriv.com       |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Antigravity AI"
#property link      "https://deriv.com"
#property version   "1.00"
#property strict

//+------------------------------------------------------------------+
//| Class CBridgeClient                                              |
//| Communicates with the local Node.js server via HTTP WebRequest.  |
//| Note: MT5 terminal must have server URL added to:                |
//| Tools -> Options -> Expert Advisors -> Allow WebRequest for:    |
//| http://localhost:4000 (or configured server base URL)           |
//+------------------------------------------------------------------+
class CBridgeClient
  {
private:
   string            m_base_url;        // Base URL e.g. "http://localhost:4000"
   int               m_timeout_ms;      // Request timeout in milliseconds
   bool              m_is_online;       // Last request success state
   datetime          m_last_sync_time;  // Timestamp of last successful bridge sync

   //--- Helper for HTTP POST
   int               HttpPost(const string endpoint, const string post_data, string &response_text)
     {
      string url = m_base_url + endpoint;
      string headers = "Content-Type: application/json\r\n";
      char post_char[];
      char result_char[];
      string result_headers;
      
      StringToCharArray(post_data, post_char, 0, StringLen(post_data));
      ResetLastError();
      
      int res = WebRequest("POST", url, headers, m_timeout_ms, post_char, result_char, result_headers);
      if(res == -1)
        {
         int err = GetLastError();
         PrintFormat("[BridgeClient] WebRequest POST failed for %s. Error code: %d", url, err);
         m_is_online = false;
         return -1;
        }

      response_text = CharArrayToString(result_char, 0, WHOLE_ARRAY);
      m_is_online = (res >= 200 && res < 300);
      if(m_is_online)
         m_last_sync_time = TimeCurrent();

      return res;
     }

   //--- Helper for HTTP GET
   int               HttpGet(const string endpoint, string &response_text)
     {
      string url = m_base_url + endpoint;
      string headers = "Accept: application/json\r\n";
      char post_char[];
      char result_char[];
      string result_headers;
      
      ResetLastError();
      int res = WebRequest("GET", url, headers, m_timeout_ms, post_char, result_char, result_headers);
      if(res == -1)
        {
         int err = GetLastError();
         PrintFormat("[BridgeClient] WebRequest GET failed for %s. Error code: %d", url, err);
         m_is_online = false;
         return -1;
        }

      response_text = CharArrayToString(result_char, 0, WHOLE_ARRAY);
      m_is_online = (res >= 200 && res < 300);
      if(m_is_online)
         m_last_sync_time = TimeCurrent();

      return res;
     }

public:
                     CBridgeClient(void);
                    ~CBridgeClient(void);

   void              Init(string base_url = "http://localhost:4000", int timeout_ms = 3000);
   bool              SendTelemetry(const string json_payload);
   bool              PollCommands(string &response_json);
   bool              SendOrderResult(ulong ticket, string command_id, bool success, string message, double fill_price);
   
   bool              IsOnline() const { return m_is_online; }
   datetime          GetLastSyncTime() const { return m_last_sync_time; }
  };

//+------------------------------------------------------------------+
//| Constructor                                                      |
//+------------------------------------------------------------------+
CBridgeClient::CBridgeClient(void)
  : m_base_url("http://localhost:4000"),
    m_timeout_ms(3000),
    m_is_online(false),
    m_last_sync_time(0)
  {
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
void CBridgeClient::Init(string base_url = "http://localhost:4000", int timeout_ms = 3000)
  {
   m_base_url = base_url;
   // Remove trailing slash if provided
   if(StringSubstr(m_base_url, StringLen(m_base_url) - 1, 1) == "/")
     {
      m_base_url = StringSubstr(m_base_url, 0, StringLen(m_base_url) - 1);
     }
   m_timeout_ms = timeout_ms;
   m_is_online = false;
   m_last_sync_time = 0;
   
   PrintFormat("[BridgeClient] Initialized with endpoint: %s (timeout: %d ms)", m_base_url, m_timeout_ms);
  }

//+------------------------------------------------------------------+
//| Send Telemetry Payload to Node.js server                         |
//+------------------------------------------------------------------+
bool CBridgeClient::SendTelemetry(const string json_payload)
  {
   string response;
   int status = HttpPost("/api/mt5/telemetry", json_payload, response);
   return (status >= 200 && status < 300);
  }

//+------------------------------------------------------------------+
//| Poll for Pending Commands from Node.js server                    |
//+------------------------------------------------------------------+
bool CBridgeClient::PollCommands(string &response_json)
  {
   int status = HttpGet("/api/mt5/commands", response_json);
   return (status >= 200 && status < 300);
  }

//+------------------------------------------------------------------+
//| Report Order Execution Result back to Node.js server             |
//+------------------------------------------------------------------+
bool CBridgeClient::SendOrderResult(ulong ticket, string command_id, bool success, string message, double fill_price)
  {
   string json = StringFormat(
      "{\"ticket\":%I64u,\"commandId\":\"%s\",\"success\":%s,\"message\":\"%s\",\"fillPrice\":%.5f,\"timestamp\":\"%s\"}",
      ticket,
      command_id,
      success ? "true" : "false",
      message,
      fill_price,
      TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   );

   string response;
   int status = HttpPost("/api/mt5/order-result", json, response);
   return (status >= 200 && status < 300);
  }
//+------------------------------------------------------------------+
