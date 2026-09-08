import type { SymbolName } from '../../../src/types.js';

export interface DerivSymbol {
  /** Deriv WebSocket API code (e.g. "R_75") */
  code: string;
  /** Human-readable display name matching our SymbolName union */
  display: SymbolName;
  /** Movement family — drives strategy module selection */
  group: 'volatility' | 'boom' | 'crash' | 'step';
}

/**
 * Ordered map of all 10 instruments.
 * Codes are confirmed against the Deriv active_symbols API.
 * Crash 100 Index uses code CRASH300 on most server configurations;
 * the profiler will attempt a display-name fallback if the code is absent.
 */
export const SYMBOL_MAP: DerivSymbol[] = [
  { code: 'R_10',     display: 'Volatility 10 Index',       group: 'volatility' },
  { code: 'R_50',     display: 'Volatility 50 Index',       group: 'volatility' },
  { code: 'R_75',     display: 'Volatility 75 Index',       group: 'volatility' },
  { code: 'R_100',    display: 'Volatility 100 Index',      group: 'volatility' },
  { code: '1HZ100V',  display: 'Volatility 100 (1s) Index', group: 'volatility' },
  { code: 'stpRNG',   display: 'Step Index',                group: 'step'       },
  { code: 'BOOM500',  display: 'Boom 500 Index',            group: 'boom'       },
  { code: 'BOOM1000', display: 'Boom 1000 Index',           group: 'boom'       },
  { code: 'CRASH500', display: 'Crash 500 Index',           group: 'crash'      },
  { code: 'CRASH300', display: 'Crash 100 Index',           group: 'crash'      },
];

export const CODE_TO_SYMBOL = new Map<string, DerivSymbol>(
  SYMBOL_MAP.map((s) => [s.code, s]),
);

export const DISPLAY_TO_CODE = new Map<SymbolName, string>(
  SYMBOL_MAP.map((s) => [s.display, s.code]),
);
