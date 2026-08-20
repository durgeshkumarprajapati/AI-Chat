import { EventEmitter } from 'events';

export interface CollabEventPayload {
  eventId?: string;
  type:
    | 'message:new'
    | 'message:edit'
    | 'message:delete'
    | 'message:delivered'
    | 'message:read'
    | 'typing:start'
    | 'typing:stop'
    | 'presence:change'
    | 'receipt:update'
    | 'ai:generating'
    | 'member:removed'
    | 'member:left'
    | 'member:owner_changed'
    | 'notification:new'
    | 'notification:read'
    | 'notification:count'
    | 'mention:new';
  channelId: string;
  senderId?: string;
  targetUserId?: string;
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
