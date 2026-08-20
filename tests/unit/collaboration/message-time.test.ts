import { describe, it, expect } from '@jest/globals';
import { formatMessageTimestamp, groupMessagesByDate } from '@/features/collaboration/message-time';

describe('Message Time Utility Suite', () => {
  const baseNow = new Date('2026-08-20T12:00:00.000Z');

  it('should format 0–59s diff as "Just now"', () => {
    const t = formatMessageTimestamp('2026-08-20T11:59:35.000Z', baseNow);
    expect(t.relative).toBe('Just now');
    expect(t.groupLabel).toBe('TODAY');
  });

  it('should format 1 minute diff as "1 min ago"', () => {
    const t = formatMessageTimestamp('2026-08-20T11:59:00.000Z', baseNow);
    expect(t.relative).toBe('1 min ago');
  });

  it('should format 5 minutes diff as "5 mins ago"', () => {
    const t = formatMessageTimestamp('2026-08-20T11:55:00.000Z', baseNow);
    expect(t.relative).toBe('5 mins ago');
  });

  it('should format 1 hour diff as "1 hour ago"', () => {
    const t = formatMessageTimestamp('2026-08-20T11:00:00.000Z', baseNow);
    expect(t.relative).toBe('1 hour ago');
  });

  it('should format yesterday date with "Yesterday, ..."', () => {
    const t = formatMessageTimestamp('2026-08-19T14:30:00.000Z', baseNow);
    expect(t.relative).toContain('Yesterday');
    expect(t.groupLabel).toBe('YESTERDAY');
  });

  it('should group messages correctly into calendar date buckets', () => {
    const msgs = [
      { id: 'm1', createdAt: '2026-08-20T10:00:00.000Z' },
      { id: 'm2', createdAt: '2026-08-20T11:00:00.000Z' },
      { id: 'm3', createdAt: '2026-08-19T15:00:00.000Z' },
      { id: 'm4', createdAt: '2026-08-15T09:00:00.000Z' }
    ];

    const groups = groupMessagesByDate(msgs, baseNow);
    expect(groups.length).toBe(3);
    expect(groups[0]?.groupLabel).toBe('TODAY');
    expect(groups[0]?.messages.length).toBe(2);
    expect(groups[1]?.groupLabel).toBe('YESTERDAY');
    expect(groups[1]?.messages.length).toBe(1);
  });
});
