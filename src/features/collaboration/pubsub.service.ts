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
    | 'mention:new'
    | 'quiz:participant_joined'
    | 'quiz:submitted'
    | 'quiz:expired'
    | 'call:invite'
    | 'call:accept'
    | 'call:decline'
    | 'call:ice_candidate'
    | 'call:end'
    | 'scheduled-call:created'
    | 'scheduled-call:updated'
    | 'scheduled-call:calendar-synced'
    | 'scheduled-call:calendar-failed'
    | 'scheduled-call:cancelled'
    | 'rag:group_conversation_message_created'
    | 'rag:group_ai_response_created'
    | 'rag:group_member_added'
    | 'rag:group_member_removed'
    | 'rag:group_member_role_updated'
    | 'rag:group_source_added'
    | 'rag:group_source_removed'
    | 'rag:group_conversation_updated'
    | 'rag:group_conversation_deleted'
    | 'project:member_joined'
    | 'project:member_left'
    | 'project:message_created'
    | 'project:ai_response_started'
    | 'project:ai_response_completed'
    | 'project:source_updated'
    | 'project:updated';
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
