import type { SeatCommand, TransportCommand } from './block-scheduler.ts';
import type { ClockAnchor } from './clock.ts';
import type { EngineBank } from './engine.ts';
import type { SynthEventTable } from './synth-events.ts';

/** The name of the worklet processor in `registerProcessor()`. */
export const PROCESSOR_NAME = 'pawchestra-synth';

/** A message from the `Player` to the worklet processor. */
export type ProcessorCommand =
  | {
      readonly type: 'score';
      readonly table: SynthEventTable;
      readonly durationSec: number;
      /** The gain of each synth channel in dB, from `channelGainsDb()` (design 6.1). */
      readonly channelGainsDb: readonly number[];
    }
  | { readonly type: 'banks'; readonly banks: readonly EngineBank[] }
  | TransportCommand
  | SeatCommand;

/** A message from the worklet processor to the `Player`. */
export type ProcessorReply =
  | {
      readonly type: 'ready';
      /** The number of banks that the processor added. */
      readonly banks: number;
    }
  | { readonly type: 'anchor'; readonly anchor: ClockAnchor }
  | { readonly type: 'error'; readonly message: string };
