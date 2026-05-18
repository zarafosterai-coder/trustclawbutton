import { createResumableStreamContext } from "resumable-stream/ioredis";
import {
  getRedisSubscriber,
  getRedisPublisher,
  isRedisConfigured,
} from "~/server/clients/redis";

type StreamContext = ReturnType<typeof createResumableStreamContext>;

let _streamContext: StreamContext | null = null;

export function getStreamContext(): StreamContext | null {
  if (!isRedisConfigured()) return null;
  if (!_streamContext) {
    const subscriber = getRedisSubscriber();
    const publisher = getRedisPublisher();
    if (!subscriber || !publisher) return null;
    _streamContext = createResumableStreamContext({
      waitUntil: null,
      subscriber,
      publisher,
    });
  }
  return _streamContext;
}
