import { describe, it, expect } from 'vitest';
import { BasketEngine, BasketCommand } from '../src/strategy/basketEngine.js';

describe('BasketEngine', () => {
  it('opens a basket with an anchor layer and emits BASKET_OPEN_LAYER', () => {
    const commands: BasketCommand[] = [];
    const engine = new BasketEngine((cmd) => commands.push(cmd));

    const basketId = engine.openBasket('Step Index', 'BUY', 1000, {
      profitTargetUsd: 1.5,
      baseLots: 0.01,
      minEquityUsd: 500,
    });

    expect(basketId).toBeDefined();
    expect(commands).toHaveLength(1);
    expect(commands[0]!.type).toBe('BASKET_OPEN_LAYER');
    expect(commands[0]!.symbol).toBe('Step Index');
    expect(commands[0]!.layerIndex).toBe(0);
    expect(commands[0]!.lots).toBe(0.01);
    expect(commands[0]!.direction).toBe('BUY');

    const basket = engine.getBasket('Step Index');
    expect(basket?.isActive).toBe(true);
    expect(basket?.layers).toHaveLength(1);
  });

  it('closes basket on profit target reached and emits BASKET_CLOSE_ALL', () => {
    const commands: BasketCommand[] = [];
    const engine = new BasketEngine((cmd) => commands.push(cmd));

    engine.openBasket('Step Index', 'BUY', 1000, {
      profitTargetUsd: 1.5,
      baseLots: 0.01,
      minEquityUsd: 500,
    });

    engine.onTick('Step Index', 1002, 10000);

    expect(commands).toHaveLength(2);
    expect(commands[1]!.type).toBe('BASKET_CLOSE_ALL');
    expect(commands[1]!.symbol).toBe('Step Index');

    const basket = engine.getBasket('Step Index');
    expect(basket).toBeUndefined();
  });

  it('opens recovery layer on adverse move at configurable pip steps', () => {
    const commands: BasketCommand[] = [];
    const engine = new BasketEngine((cmd) => commands.push(cmd));

    engine.openBasket('Step Index', 'BUY', 1000, {
      profitTargetUsd: 1.5,
      baseLots: 0.01,
      lotMultiplier: 1.8,
      layerStepPips: 8,
      minEquityUsd: 500,
    });

    engine.onTick('Step Index', 992, 10000);

    expect(commands).toHaveLength(2);
    const recoveryCmd = commands[1]!;
    expect(recoveryCmd.type).toBe('BASKET_OPEN_LAYER');
    expect(recoveryCmd.layerIndex).toBe(1);
    expect(recoveryCmd.lots).toBe(0.02);
    expect(recoveryCmd.direction).toBe('BUY');

    const basket = engine.getBasket('Step Index');
    expect(basket?.layers).toHaveLength(2);
  });

  it('closes basket on equity floor breach', () => {
    const commands: BasketCommand[] = [];
    const engine = new BasketEngine((cmd) => commands.push(cmd));

    engine.openBasket('Step Index', 'BUY', 1000, {
      minEquityUsd: 8500,
    });

    engine.onTick('Step Index', 995, 8400);

    expect(commands).toHaveLength(2);
    expect(commands[1]!.type).toBe('BASKET_CLOSE_ALL');

    const basket = engine.getBasket('Step Index');
    expect(basket).toBeUndefined();
  });

  it('supports force close and ticket association', () => {
    const commands: BasketCommand[] = [];
    const engine = new BasketEngine((cmd) => commands.push(cmd));

    engine.openBasket('Step Index', 'SELL', 1000);
    const basket = engine.getBasket('Step Index');
    const layerId = basket!.layers[0]!.id;

    engine.associateTicket('Step Index', layerId, 987654);
    const updatedBasket = engine.getBasket('Step Index');
    expect(updatedBasket!.layers[0]!.ticket).toBe(987654);

    engine.forceClose('Step Index');
    expect(commands).toHaveLength(2);
    expect(commands[1]!.type).toBe('BASKET_CLOSE_ALL');
  });
});
