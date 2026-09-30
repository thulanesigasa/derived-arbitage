/**
 * BasketEngine - Martingale Basket Manager for Step Index (and all synthetic indices)
 *
 * Strategy rules (confirmed by user):
 *  - Classic Martingale: fixed pip step, lot multiplier 1.8x on each recovery layer
 *  - Basket closes when NET floating P&L of ALL open layers reaches the profit target
 *  - Immediate re-entry after a winning basket closes (no cooldown)
 *  - Safety: cap at MAX_LAYERS (default 6), equity floor guard on every new layer
 */

import { randomUUID } from "node:crypto";
import type { SymbolName } from "../../../src/types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface BasketConfig {
  profitTargetUsd: number;
  baseLots: number;
  lotMultiplier: number;
  maxLayers: number;
  layerStepPips: number;
  minEquityUsd: number;
}

export const DEFAULT_BASKET_CONFIG: BasketConfig = {
  profitTargetUsd: 1.5,
  baseLots: 0.01,
  lotMultiplier: 1.8,
  maxLayers: 6,
  layerStepPips: 8,
  minEquityUsd: 500,
};

// ─── State ───────────────────────────────────────────────────────────────────

export interface BasketLayer {
  id: string;
  ticket?: number;
  side: "BUY" | "SELL";
  lots: number;
  openPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: string;
  layerIndex: number;
}

export type BasketCloseReason =
  | "PROFIT_TARGET"
  | "MAX_LAYERS_FORCE_CLOSE"
  | "EQUITY_FLOOR"
  | "MANUAL";

export interface BasketState {
  symbol: SymbolName;
  isActive: boolean;
  layers: BasketLayer[];
  direction: "BUY" | "SELL";
  netPnl: number;
  profitTargetUsd: number;
  maxLayers: number;
  anchorPrice: number;
  openedAt: string;
  closedAt?: string;
  closeReason?: BasketCloseReason;
  realizedPnl?: number;
}

// ─── Commands issued to Mt5Bridge ────────────────────────────────────────────

export interface BasketCommand {
  type: "BASKET_OPEN_LAYER" | "BASKET_CLOSE_ALL" | "BASKET_SYNC_TICKET";
  basketId: string;
  symbol: SymbolName;
  layerId?: string;
  layerIndex?: number;
  direction?: "BUY" | "SELL";
  lots?: number;
  ticket?: number;
}

// ─── Internal extended state ──────────────────────────────────────────────────

interface InternalBasket extends BasketState {
  id: string;
  config: BasketConfig;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class BasketEngine {
  private baskets = new Map<SymbolName, InternalBasket>();
  private onCommand: (cmd: BasketCommand) => void;

  constructor(onCommand: (cmd: BasketCommand) => void) {
    this.onCommand = onCommand;
  }

  onTick(symbol: SymbolName, currentPrice: number, currentEquityUsd: number): void {
    const basket = this.baskets.get(symbol);
    if (!basket || !basket.isActive) return;

    let netPnl = 0;
    for (const layer of basket.layers) {
      layer.currentPrice = currentPrice;
      const priceDelta = (currentPrice - layer.openPrice) * (layer.side === "BUY" ? 1 : -1);
      layer.unrealizedPnl = Math.round(priceDelta * layer.lots * 100 * 100) / 100;
      netPnl += layer.unrealizedPnl;
    }
    basket.netPnl = Math.round(netPnl * 100) / 100;

    if (basket.netPnl >= basket.profitTargetUsd) {
      this.closeBasket(symbol, "PROFIT_TARGET", basket.netPnl);
      return;
    }

    this.evaluateMartingaleLayer(basket, currentPrice, currentEquityUsd);
  }

  openBasket(
    symbol: SymbolName,
    direction: "BUY" | "SELL",
    anchorPrice: number,
    config: Partial<BasketConfig> = {}
  ): string {
    const existing = this.baskets.get(symbol);
    if (existing?.isActive) return existing.id;

    const mergedConfig: BasketConfig = { ...DEFAULT_BASKET_CONFIG, ...config };
    const basketId = randomUUID();
    const layer = this.makeLayer(0, direction, mergedConfig.baseLots, anchorPrice);

    const state: InternalBasket = {
      id: basketId,
      config: mergedConfig,
      symbol,
      isActive: true,
      layers: [layer],
      direction,
      netPnl: 0,
      profitTargetUsd: mergedConfig.profitTargetUsd,
      maxLayers: mergedConfig.maxLayers,
      anchorPrice,
      openedAt: new Date().toISOString(),
    };

    this.baskets.set(symbol, state);

    this.onCommand({
      type: "BASKET_OPEN_LAYER",
      basketId,
      symbol,
      layerId: layer.id,
      layerIndex: 0,
      direction,
      lots: layer.lots,
    });

    return basketId;
  }

  associateTicket(symbol: SymbolName, layerId: string, ticket: number): void {
    const basket = this.baskets.get(symbol);
    if (!basket) return;
    const layer = basket.layers.find((l) => l.id === layerId);
    if (layer) layer.ticket = ticket;
  }

  forceClose(symbol: SymbolName): void {
    const basket = this.baskets.get(symbol);
    if (!basket?.isActive) return;
    this.closeBasket(symbol, "MANUAL", basket.netPnl);
  }

  getSnapshot(): Record<string, BasketState> {
    const out: Record<string, BasketState> = {};
    for (const [sym, state] of this.baskets) {
      const { config: _config, ...rest } = state;
      out[sym] = rest;
    }
    return out;
  }

  getBasket(symbol: SymbolName): (BasketState & { id: string }) | undefined {
    const b = this.baskets.get(symbol);
    if (!b) return undefined;
    const { config: _config, ...rest } = b;
    return rest;
  }

  private evaluateMartingaleLayer(
    basket: InternalBasket,
    currentPrice: number,
    equityUsd: number
  ): void {
    const { config, layers, direction } = basket;

    if (layers.length >= config.maxLayers) {
      if (basket.netPnl < -(config.profitTargetUsd * 3)) {
        this.closeBasket(basket.symbol, "MAX_LAYERS_FORCE_CLOSE", basket.netPnl);
      }
      return;
    }

    if (equityUsd < config.minEquityUsd) {
      this.closeBasket(basket.symbol, "EQUITY_FLOOR", basket.netPnl);
      return;
    }

    const lastLayer = layers[layers.length - 1];
    if (!lastLayer) return;
    const priceMove = (currentPrice - lastLayer.openPrice) * (direction === "BUY" ? -1 : 1);
    if (priceMove >= config.layerStepPips) {
      const newIndex = layers.length;
      const rawLots = config.baseLots * Math.pow(config.lotMultiplier, newIndex);
      const newLots = Math.max(0.01, Math.min(Math.round(rawLots * 100) / 100, 50));
      const layer = this.makeLayer(newIndex, direction, newLots, currentPrice);
      basket.layers.push(layer);

      this.onCommand({
        type: "BASKET_OPEN_LAYER",
        basketId: basket.id,
        symbol: basket.symbol,
        layerId: layer.id,
        layerIndex: newIndex,
        direction,
        lots: newLots,
      });
    }
  }

  private closeBasket(
    symbol: SymbolName,
    reason: BasketCloseReason,
    realizedPnl: number
  ): void {
    const basket = this.baskets.get(symbol);
    if (!basket || !basket.isActive) return;

    basket.isActive = false;
    basket.closedAt = new Date().toISOString();
    basket.closeReason = reason;
    basket.realizedPnl = Math.round(realizedPnl * 100) / 100;

    this.onCommand({
      type: "BASKET_CLOSE_ALL",
      basketId: basket.id,
      symbol,
    });

    this.baskets.delete(symbol);
  }

  private makeLayer(
    index: number,
    side: "BUY" | "SELL",
    lots: number,
    openPrice: number
  ): BasketLayer {
    return {
      id: randomUUID(),
      side,
      lots,
      openPrice,
      currentPrice: openPrice,
      unrealizedPnl: 0,
      openedAt: new Date().toISOString(),
      layerIndex: index,
    };
  }
}
