export interface FormattedTimestamp {
  relative: string;
  absolute: string;
  groupLabel: string;
}

// Module-level pre-instantiated Intl formatters for maximum execution speed (<0.01ms)
const absoluteFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

export function getGroupLabel(date: Date, daysDiff: number): string {
  if (daysDiff === 0) return 'TODAY';
  if (daysDiff === 1) return 'YESTERDAY';
  if (daysDiff > 1 && daysDiff < 7) return weekdayFormatter.format(date).toUpperCase();
  return shortDateFormatter.format(date).toUpperCase();
}

export function formatMessageTimestamp(
  createdAt: Date | string,
  now: Date = new Date()
): FormattedTimestamp {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const timeMs = date.getTime();
  const nowMs = now.getTime();
  const diffSec = Math.max(0, Math.floor((nowMs - timeMs) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);

  const absolute = absoluteFormatter.format(date);
  const timeStr = timeFormatter.format(date);

  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysDiff = Math.round((startOfNow - startOfDate) / (1000 * 60 * 60 * 24));

  const groupLabel = getGroupLabel(date, daysDiff);

  let relative: string;
  if (daysDiff === 0) {
    if (diffSec < 60) {
      relative = 'Just now';
    } else if (diffMin === 1) {
      relative = '1 min ago';
    } else if (diffMin < 60) {
      relative = `${diffMin} mins ago`;
    } else if (diffHrs === 1) {
      relative = '1 hour ago';
    } else {
      relative = `${diffHrs} hours ago`;
    }
  } else if (daysDiff === 1) {
    relative = `Yesterday, ${timeStr}`;
  } else if (daysDiff > 1 && daysDiff < 7) {
    const weekday = weekdayFormatter.format(date);
    relative = `${weekday}, ${timeStr}`;
  } else {
    const dateFormatted = shortDateFormatter.format(date);
    relative = `${dateFormatted}, ${timeStr}`;
  }

  return {
    relative,
    absolute,
    groupLabel
  };
}

export interface GroupedMessages<T extends { createdAt: string | Date }> {
  groupLabel: string;
  messages: T[];
}

export function groupMessagesByDate<T extends { createdAt: string | Date }>(
  messages: T[],
  now: Date = new Date()
): GroupedMessages<T>[] {
  if (!messages || messages.length === 0) return [];

  const groups: GroupedMessages<T>[] = [];
  let currentGroupLabel: string | null = null;
  let currentGroupMessages: T[] = [];

  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const date = typeof msg.createdAt === 'string' ? new Date(msg.createdAt) : msg.createdAt;
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysDiff = Math.round((startOfNow - startOfDate) / (1000 * 60 * 60 * 24));
    const groupLabel = getGroupLabel(date, daysDiff);

    if (groupLabel !== currentGroupLabel) {
      if (currentGroupLabel !== null && currentGroupMessages.length > 0) {
        groups.push({
          groupLabel: currentGroupLabel,
          messages: currentGroupMessages
        });
      }
      currentGroupLabel = groupLabel;
      currentGroupMessages = [msg];
    } else {
      currentGroupMessages.push(msg);
    }
  }

  if (currentGroupLabel !== null && currentGroupMessages.length > 0) {
    groups.push({
      groupLabel: currentGroupLabel,
      messages: currentGroupMessages
    });
  }

  return groups;
}
