//+------------------------------------------------------------------+
//| BasketEngine.mqh                                                 |
//| Martingale Basket Execution Handler for FalconEA                 |
//|                                                                  |
//| Receives BASKET_OPEN_LAYER and BASKET_CLOSE_ALL commands from    |
//| the Node.js bridge and executes them on the MT5 terminal.        |
//+------------------------------------------------------------------+
#ifndef BASKET_ENGINE_MQH
#define BASKET_ENGINE_MQH

#include <Trade\Trade.mqh>

//--- Maximum concurrent basket layers tracked per symbol
#define MAX_BASKET_LAYERS  10
#define MAX_BASKET_SYMBOLS 20

//+------------------------------------------------------------------+
//| Basket Layer Record                                              |
//+------------------------------------------------------------------+
struct BasketLayer
  {
   string            layer_id;   // Bridge layer UUID
   ulong             ticket;     // MT5 position ticket (0 = not yet filled)
   string            symbol;
   ENUM_ORDER_TYPE   order_type; // ORDER_TYPE_BUY or ORDER_TYPE_SELL
   double            lots;
   double            open_price;
  };

//+------------------------------------------------------------------+
//| Per-symbol Basket                                                |
//+------------------------------------------------------------------+
struct Basket
  {
   string            symbol;
   bool              active;
   string            basket_id;
   BasketLayer       layers[MAX_BASKET_LAYERS];
   int               layer_count;
  };

//+------------------------------------------------------------------+
//| BasketExecutor — handles commands from bridge                    |
//+------------------------------------------------------------------+
class BasketExecutor
  {
private:
   CTrade            m_trade;
   ulong             m_magic;
   Basket            m_baskets[MAX_BASKET_SYMBOLS];
   int               m_basket_count;

   //--- Find or create a basket slot for symbol
   int               FindOrCreateBasket(const string symbol, const string basket_id)
     {
      for(int i = 0; i < m_basket_count; i++)
        {
         if(m_baskets[i].symbol == symbol && m_baskets[i].basket_id == basket_id)
            return i;
        }
      if(m_basket_count >= MAX_BASKET_SYMBOLS)
        {
         Print("[BasketExecutor] ERROR: Max basket slots reached");
         return -1;
        }
      int idx = m_basket_count++;
      m_baskets[idx].symbol       = symbol;
      m_baskets[idx].basket_id    = basket_id;
      m_baskets[idx].active       = true;
      m_baskets[idx].layer_count  = 0;
      return idx;
     }

   //--- Find existing basket slot for symbol+id
   int               FindBasket(const string symbol, const string basket_id)
     {
      for(int i = 0; i < m_basket_count; i++)
        {
         if(m_baskets[i].symbol == symbol && m_baskets[i].basket_id == basket_id && m_baskets[i].active)
            return i;
        }
      return -1;
     }

public:
   void              Init(ulong magic, int slippage_pts)
     {
      m_magic = magic;
      m_trade.SetExpertMagicNumber(magic);
      m_trade.SetDeviationInPoints(slippage_pts);
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
      m_basket_count = 0;
      for(int i = 0; i < MAX_BASKET_SYMBOLS; i++)
        {
         m_baskets[i].symbol = "";
         m_baskets[i].active = false;
         m_baskets[i].basket_id = "";
         m_baskets[i].layer_count = 0;
        }
     }

   //+----------------------------------------------------------------+
   //| Open a single basket layer (ANCHOR or RECOVERY)                |
   //+----------------------------------------------------------------+
   bool              OpenLayer(
      const string basket_id,
      const string symbol,
      const string layer_id,
      const int    layer_index,
      const string direction,
      const double lots)
     {
      int slot = FindOrCreateBasket(symbol, basket_id);
      if(slot < 0) return false;
      if(m_baskets[slot].layer_count >= MAX_BASKET_LAYERS)
        {
         PrintFormat("[BasketExecutor] ERROR: Max layers reached for basket %s on %s", basket_id, symbol);
         return false;
        }

      ENUM_ORDER_TYPE otype = (direction == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      double price  = (otype == ORDER_TYPE_BUY) ? SymbolInfoDouble(symbol, SYMBOL_ASK)
                                                : SymbolInfoDouble(symbol, SYMBOL_BID);
      // No SL/TP on individual layers — the basket engine manages the close
      bool ok = m_trade.PositionOpen(symbol, otype, lots, price, 0.0, 0.0,
                                     StringFormat("FalconBasket L%d", layer_index));
      if(ok)
        {
         int li = m_baskets[slot].layer_count;
         m_baskets[slot].layers[li].layer_id   = layer_id;
         m_baskets[slot].layers[li].ticket      = m_trade.ResultDeal();
         m_baskets[slot].layers[li].symbol      = symbol;
         m_baskets[slot].layers[li].order_type  = otype;
         m_baskets[slot].layers[li].lots        = lots;
         m_baskets[slot].layers[li].open_price  = price;
         m_baskets[slot].layer_count++;
         PrintFormat("[BasketExecutor] Layer %d opened on %s — ticket #%I64u @ %.5f (%.2f lots)",
                     layer_index, symbol, m_trade.ResultDeal(), price, lots);
        }
      else
        {
         PrintFormat("[BasketExecutor] FAILED to open layer %d on %s: %s (%d)",
                     layer_index, symbol, m_trade.ResultComment(), m_trade.ResultRetcode());
        }
      return ok;
     }

   //+----------------------------------------------------------------+
   //| Close all layers in a basket (profit target reached)           |
   //+----------------------------------------------------------------+
   bool              CloseAll(const string basket_id, const string symbol)
     {
      int slot = FindBasket(symbol, basket_id);
      if(slot < 0)
        {
         // Fallback: close ALL positions on this symbol by magic number
         PrintFormat("[BasketExecutor] Basket not found in cache (%s / %s) — closing by symbol", symbol, basket_id);
         return CloseAllBySymbol(symbol);
        }

      bool all_ok = true;
      for(int i = 0; i < m_baskets[slot].layer_count; i++)
        {
         ulong ticket = m_baskets[slot].layers[i].ticket;
         if(ticket == 0) continue;
         if(PositionSelectByTicket(ticket))
           {
            if(!m_trade.PositionClose(ticket, 20))
              {
               PrintFormat("[BasketExecutor] Failed to close ticket #%I64u: %s", ticket, m_trade.ResultComment());
               all_ok = false;
              }
            else
              {
               PrintFormat("[BasketExecutor] Closed ticket #%I64u (layer %d of basket %s)", ticket, i, basket_id);
              }
           }
        }

      m_baskets[slot].active = false;
      m_baskets[slot].layer_count = 0;
      return all_ok;
     }

   //+----------------------------------------------------------------+
   //| Fallback: close all positions on a symbol by magic number      |
   //+----------------------------------------------------------------+
   bool              CloseAllBySymbol(const string symbol)
     {
      bool ok = true;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         ulong ticket = PositionGetTicket(i);
         if(PositionGetString(POSITION_SYMBOL) != symbol) continue;
         if(m_magic > 0 && PositionGetInteger(POSITION_MAGIC) != m_magic) continue;
         if(!m_trade.PositionClose(ticket, 20))
           {
            PrintFormat("[BasketExecutor] CloseAllBySymbol failed ticket #%I64u: %s", ticket, m_trade.ResultComment());
            ok = false;
           }
        }
      return ok;
     }
  };

#endif // BASKET_ENGINE_MQH
