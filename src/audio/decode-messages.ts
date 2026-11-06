import type { EngineBank } from './engine.ts';

/** A request from the main thread to the decode Worker. */
export interface DecodeRequest {
  readonly type: 'decode';
  /** An id that the replies of this request repeat. */
  readonly id: number;
  /** The URLs of the SF3 preset files that the synth does not have yet. */
  readonly urls: readonly string[];
}

/** A reply of the decode Worker. */
export type DecodeReply =
  | {
      readonly type: 'progress';
      readonly id: number;
      /** The number of files that are ready. */
      readonly done: number;
      /** The bytes of the SF3 files that arrived, for all files of the request. */
      readonly bytes: number;
    }
  | {
      readonly type: 'decoded';
      readonly id: number;
      /**
       * The banks in the order of the request URLs. The id of a bank is the URL of its SF3 file.
       * The Worker transfers the buffers.
       */
      readonly banks: readonly EngineBank[];
    }
  | {
      readonly type: 'failed';
      readonly id: number;
      readonly message: string;
    };
