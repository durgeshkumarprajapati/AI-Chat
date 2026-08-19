import { EventEmitter } from 'events';

export interface CollabEventPayload {
  type:
    | 'message:new'
    | 'message:edit'
    | 'message:delete'
    | 'typing:start'
    | 'typing:stop'
    | 'presence:change'
    | 'receipt:update'
    | 'ai:generating';
  channelId: string;
  senderId?: string;
  data: unknown;
  timestamp: string;
}

class CollabPubSubService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  public publish(channelId: string, event: CollabEventPayload): void {
    this.emitter.emit(`channel:${channelId}`, event);
    this.emitter.emit('global', event);
  }

  public subscribe(
    channelId: string,
    listener: (_event: CollabEventPayload) => void
  ): () => void {
    const topic = `channel:${channelId}`;
    this.emitter.on(topic, listener);
    return () => {
      this.emitter.off(topic, listener);
    };
  }

  public subscribeGlobal(
    listener: (_event: CollabEventPayload) => void
  ): () => void {
    this.emitter.on('global', listener);
    return () => {
      this.emitter.off('global', listener);
    };
  }
}

export const collabPubSubService = new CollabPubSubService();
