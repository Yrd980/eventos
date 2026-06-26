import type { RealtimeEvent } from "@eventos/contracts";

export type RealtimePublisher = {
  publish(event: RealtimeEvent): Promise<void>;
};

export function createNoopRealtimePublisher(): RealtimePublisher {
  return {
    async publish() {
      return;
    },
  };
}
