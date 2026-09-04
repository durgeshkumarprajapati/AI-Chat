-- Core platform foundation (auth sessions, collaborative chat, calls, scheduled calls, mock test
-- scheduling, voice tutor, chill/focus, meeting intelligence, ClickUp integration, document
-- visuals/translations/lineage/lifecycle/retention, Google Calendar integration).
--
-- Same class of gap as the three migrations already fixed this session
-- (20260828120000_phase75_enterprise_configuration_management, 20260829120000_audit_logging,
-- 20260901015000_collaboration_notifications_base): every one of these 36 tables and 27 enums has
-- existed in schema.prisma and been actively used throughout this codebase's history, but no
-- migration anywhere ever created them — every environment that had them got them via
-- `prisma db push` at some point, never via migration history. This was discovered by
-- systematically cross-referencing every enum/model declared in schema.prisma against everything
-- ever CREATE TYPE/CREATE TABLE'd across the full existing migration history; these 36
-- tables + 27 enums were the entire remaining gap (verified: zero existing migration references
-- any of them, so placement here is not constrained by any pre-existing ALTER TABLE/FK/index —
-- only by this migration's OWN foreign keys to "users"/"documents" (from `init`), "knowledge_bases"
-- (from 20260813063559_knowledge_bases), and "projects" (from 20260817080000_phase36_ai_knowledge_copilot),
-- which is why this migration is timestamped just after phase36 rather than immediately after init).
--
-- Statement order follows Prisma's own generated-migration convention (confirmed by reading this
-- repo's actual `init` migration): all CreateEnum, then all CreateTable, then all CreateIndex, then
-- all AddForeignKey deferred to the very end. Deferring every foreign key to the end means the
-- CREATE TABLE order above has no inter-table dependency constraints to satisfy.
--
-- Content generated from `Prisma.dmmf` (the compiled, tool-accurate model/field/relation/enum
-- metadata already produced by `prisma generate`, requiring no live database connection) plus a
-- raw-text scan of schema.prisma for `@@index(...)` declarations and `@db.*` native-type overrides,
-- which are not exposed by this Prisma version's client-side DMMF. Cross-checked field-by-field
-- against the raw schema.prisma model bodies for every table (columns, defaults, nullability,
-- single-field `@unique` and composite `@@unique`/`@@index`, and `onDelete` behavior on every
-- relation) before being committed here.

-- ===== ENUMS =====
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "SourceType" AS ENUM ('DOCUMENT', 'WEB');
CREATE TYPE "LineageType" AS ENUM ('ORIGINAL', 'NEW_VERSION', 'DERIVED_FROM', 'MERGED_FROM', 'SPLIT_FROM', 'IMPORTED_FROM');
CREATE TYPE "LifecycleEventType" AS ENUM ('DOCUMENT_UPLOADED', 'DOCUMENT_DUPLICATE_DETECTED', 'DOCUMENT_VERSION_CREATED', 'DOCUMENT_VERSION_ACTIVATED', 'DOCUMENT_VERSION_SUPERSEDED', 'DOCUMENT_COMPARED', 'DOCUMENT_REINDEX_STARTED', 'DOCUMENT_REINDEX_COMPLETED', 'DOCUMENT_REINDEX_FAILED', 'DOCUMENT_ARCHIVED', 'DOCUMENT_RESTORED', 'DOCUMENT_SOFT_DELETED', 'DOCUMENT_PERMANENTLY_DELETED', 'DOCUMENT_LINEAGE_CREATED');
CREATE TYPE "CollabChannelType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "CollabMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "CollabReceiptStatus" AS ENUM ('DELIVERED', 'READ');
CREATE TYPE "CollabMessageType" AS ENUM ('TEXT', 'VOICE', 'CALL_EVENT', 'SCHEDULED_CALL');
CREATE TYPE "MockTestStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "MockTestParticipantStatus" AS ENUM ('REGISTERED', 'IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED', 'ABSENT');
CREATE TYPE "CallType" AS ENUM ('VOICE', 'VIDEO');
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'IN_CALL', 'ENDED', 'DECLINED', 'MISSED', 'CANCELLED');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'RETRY_PENDING', 'FAILED', 'REAUTH_REQUIRED', 'NOT_CONNECTED', 'CANCELLED');
CREATE TYPE "ScheduledCallStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ScheduledCallType" AS ENUM ('ONE_TO_ONE', 'GROUP');
CREATE TYPE "ScheduledCallParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'TENTATIVE');
CREATE TYPE "VoiceTutorSessionMode" AS ENUM ('FREE_TUTOR', 'QUIZ_TUTOR', 'INTERVIEW_TUTOR', 'DOCUMENT_TUTOR', 'KNOWLEDGE_GRAPH_TUTOR');
CREATE TYPE "VoiceTutorSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "VoiceTutorRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "ChillFocusMode" AS ENUM ('CHILL', 'FOCUS');
CREATE TYPE "ChillFocusStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "MeetingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "MeetingSourceProvider" AS ENUM ('GOOGLE_MEET', 'MANUAL_PASTE', 'UPLOAD_FILE', 'CONNECTED_SOURCE');
CREATE TYPE "TaskSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'CREATING', 'CREATED', 'FAILED');
CREATE TYPE "ClickUpIntegrationStatus" AS ENUM ('ACTIVE', 'DISCONNECTED');

-- ===== TABLES (CreateTable) =====
-- CreateTable: DocumentVisual -> "document_visuals"
CREATE TABLE "document_visuals" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL DEFAULT 'IMAGE',
    "storage_key" TEXT,
    "content_hash" TEXT,
    "caption" TEXT,
    "ocr_text" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "width" INTEGER,
    "height" INTEGER,
    "confidence" DOUBLE PRECISION DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_visuals_pkey" PRIMARY KEY ("id")
);
-- CreateTable: SarvamDigitisationRun -> "sarvam_digitisation_runs"
CREATE TABLE "sarvam_digitisation_runs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "block_count" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "layout_output" JSONB,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sarvam_digitisation_runs_pkey" PRIMARY KEY ("id")
);
-- CreateTable: DocumentTranslation -> "document_translations"
CREATE TABLE "document_translations" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_version_id" TEXT,
    "source_language" TEXT NOT NULL,
    "target_language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "job_id" TEXT,
    "translated_title" TEXT,
    "storage_key" TEXT,
    "translated_text" TEXT,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "document_translations_pkey" PRIMARY KEY ("id")
);
-- CreateTable: DocumentFamily -> "document_families"
CREATE TABLE "document_families" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active_document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_families_pkey" PRIMARY KEY ("id")
);
-- CreateTable: DocumentLineage -> "document_lineages"
CREATE TABLE "document_lineages" (
    "id" TEXT NOT NULL,
    "source_document_id" TEXT NOT NULL,
    "target_document_id" TEXT NOT NULL,
    "relationship_type" "LineageType" NOT NULL DEFAULT 'NEW_VERSION',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_lineages_pkey" PRIMARY KEY ("id")
);
-- CreateTable: DocumentLifecycleEvent -> "document_lifecycle_events"
CREATE TABLE "document_lifecycle_events" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" "LifecycleEventType" NOT NULL,
    "previous_state" TEXT,
    "new_state" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_lifecycle_events_pkey" PRIMARY KEY ("id")
);
-- CreateTable: DocumentRetentionJob -> "document_retention_jobs"
CREATE TABLE "document_retention_jobs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_retention_jobs_pkey" PRIMARY KEY ("id")
);
-- CreateTable: Session -> "sessions"
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_info" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ChatAttachment -> "chat_attachments"
CREATE TABLE "chat_attachments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "is_temporary" BOOLEAN NOT NULL DEFAULT true,
    "document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabChannel -> "collab_channels"
CREATE TABLE "collab_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "type" "CollabChannelType" NOT NULL DEFAULT 'DIRECT',
    "avatar_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collab_channels_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabChannelMember -> "collab_channel_members"
CREATE TABLE "collab_channel_members" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "CollabMemberRole" NOT NULL DEFAULT 'MEMBER',
    "last_read_at" TIMESTAMP(3),
    "last_read_message_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_channel_members_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabMessage -> "collab_messages"
CREATE TABLE "collab_messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "message_type" "CollabMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "reply_to_id" TEXT,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "is_ai" BOOLEAN NOT NULL DEFAULT false,
    "ai_model" TEXT,
    "shared_roadmap_id" TEXT,
    "shared_roadmap_step_id" TEXT,
    "shared_entity_id" TEXT,
    "shared_document_id" TEXT,
    "shared_study_question_id" TEXT,
    "shared_mock_test_id" TEXT,
    "call_session_id" TEXT,
    "scheduled_call_id" TEXT,
    "voice_duration_ms" INTEGER,
    "voice_mime_type" TEXT,
    "voice_storage_key" TEXT,
    "voice_file_size_bytes" INTEGER,
    "metadata" JSONB,
    "client_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collab_messages_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabMessageMention -> "collab_message_mentions"
CREATE TABLE "collab_message_mentions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "mentioned_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_message_mentions_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabMessageReceipt -> "collab_message_receipts"
CREATE TABLE "collab_message_receipts" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "CollabReceiptStatus" NOT NULL DEFAULT 'DELIVERED',
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),

    CONSTRAINT "collab_message_receipts_pkey" PRIMARY KEY ("id")
);
-- CreateTable: NotificationPreference -> "notification_preferences"
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "direct_messages" BOOLEAN NOT NULL DEFAULT true,
    "group_messages" BOOLEAN NOT NULL DEFAULT true,
    "mentions" BOOLEAN NOT NULL DEFAULT true,
    "group_membership" BOOLEAN NOT NULL DEFAULT true,
    "ai_replies" BOOLEAN NOT NULL DEFAULT true,
    "roadmap_shares" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ScheduledMockTest -> "scheduled_mock_tests"
CREATE TABLE "scheduled_mock_tests" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "topic" TEXT,
    "document_id" TEXT,
    "knowledge_base_id" TEXT,
    "scheduled_start_time" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "total_questions" INTEGER NOT NULL DEFAULT 10,
    "passing_score" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "status" "MockTestStatus" NOT NULL DEFAULT 'SCHEDULED',
    "google_calendar_event_id" TEXT,
    "google_calendar_link" TEXT,
    "google_calendar_event_url" TEXT,
    "google_calendar_sync_status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
    "google_calendar_sync_error" TEXT,
    "google_calendar_synced_at" TIMESTAMP(3),
    "questions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_mock_tests_pkey" PRIMARY KEY ("id")
);
-- CreateTable: MockTestCalendarSync -> "mock_test_calendar_syncs"
CREATE TABLE "mock_test_calendar_syncs" (
    "id" TEXT NOT NULL,
    "mock_test_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "event_id" TEXT,
    "event_html_link" TEXT,
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
    "last_attempt_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_test_calendar_syncs_pkey" PRIMARY KEY ("id")
);
-- CreateTable: MockTestParticipant -> "mock_test_participants"
CREATE TABLE "mock_test_participants" (
    "id" TEXT NOT NULL,
    "mock_test_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "MockTestParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
    "joined_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "answers" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_test_participants_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabCall -> "collab_calls"
CREATE TABLE "collab_calls" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "type" "CallType" NOT NULL DEFAULT 'VOICE',
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collab_calls_pkey" PRIMARY KEY ("id")
);
-- CreateTable: CollabCallParticipant -> "collab_call_participants"
CREATE TABLE "collab_call_participants" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "is_video_off" BOOLEAN NOT NULL DEFAULT false,
    "is_screen_sharing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_call_participants_pkey" PRIMARY KEY ("id")
);
-- CreateTable: GoogleIntegration -> "google_integrations"
CREATE TABLE "google_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_user_id" TEXT,
    "email" TEXT,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_integrations_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ScheduledCall -> "scheduled_calls"
CREATE TABLE "scheduled_calls" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "call_type" "ScheduledCallType" NOT NULL,
    "status" "ScheduledCallStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_start_at" TIMESTAMP(3) NOT NULL,
    "scheduled_end_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "google_calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "google_calendar_event_id" TEXT,
    "google_calendar_event_url" TEXT,
    "google_meet_url" TEXT,
    "google_meet_conference_id" TEXT,
    "calendar_sync_status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
    "calendar_sync_error" TEXT,
    "calendar_sync_error_code" TEXT,
    "calendar_sync_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_calendar_sync_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_calls_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ScheduledCallParticipant -> "scheduled_call_participants"
CREATE TABLE "scheduled_call_participants" (
    "id" TEXT NOT NULL,
    "scheduled_call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ATTENDEE',
    "response_status" "ScheduledCallParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_call_participants_pkey" PRIMARY KEY ("id")
);
-- CreateTable: VoiceTutorSession -> "voice_tutor_sessions"
CREATE TABLE "voice_tutor_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'AI Voice Tutoring Session',
    "mode" "VoiceTutorSessionMode" NOT NULL DEFAULT 'FREE_TUTOR',
    "status" "VoiceTutorSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "knowledge_base_id" TEXT,
    "document_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_tutor_sessions_pkey" PRIMARY KEY ("id")
);
-- CreateTable: VoiceTutorMessage -> "voice_tutor_messages"
CREATE TABLE "voice_tutor_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "VoiceTutorRole" NOT NULL,
    "text" TEXT NOT NULL,
    "audio_url" TEXT,
    "duration_ms" INTEGER,
    "rag_context" JSONB,
    "graph_context" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_tutor_messages_pkey" PRIMARY KEY ("id")
);
-- CreateTable: VoiceTutorFeedback -> "voice_tutor_feedbacks"
CREATE TABLE "voice_tutor_feedbacks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'General Voice Tutoring',
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "concepts_discussed" JSONB NOT NULL DEFAULT '[]',
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "recommended_topics" JSONB NOT NULL DEFAULT '[]',
    "understanding_score" INTEGER NOT NULL DEFAULT 80,
    "communication_score" INTEGER NOT NULL DEFAULT 80,
    "recommended_mock_test_topic" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_tutor_feedbacks_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ChillFocusSession -> "chill_focus_sessions"
CREATE TABLE "chill_focus_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "ChillFocusMode" NOT NULL DEFAULT 'CHILL',
    "status" "ChillFocusStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "planned_duration_seconds" INTEGER NOT NULL DEFAULT 300,
    "active_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "soundscape" TEXT NOT NULL DEFAULT 'night_sky',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chill_focus_sessions_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ChillFocusPreference -> "chill_focus_preferences"
CREATE TABLE "chill_focus_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "preferred_mode" TEXT NOT NULL DEFAULT 'CHILL',
    "preferred_soundscape" TEXT NOT NULL DEFAULT 'night_sky',
    "preferred_volume" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "breathing_enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervention_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reduced_motion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chill_focus_preferences_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ChillFocusStreak -> "chill_focus_streaks"
CREATE TABLE "chill_focus_streaks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_streak_days" INTEGER NOT NULL DEFAULT 0,
    "longest_streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" TIMESTAMP(3),
    "total_sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chill_focus_streaks_pkey" PRIMARY KEY ("id")
);
-- CreateTable: Meeting -> "meetings"
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "meeting_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_provider" "MeetingSourceProvider" NOT NULL DEFAULT 'MANUAL_PASTE',
    "status" "MeetingStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);
-- CreateTable: MeetingParticipant -> "meeting_participants"
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT DEFAULT 'ATTENDEE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);
-- CreateTable: MeetingTranscript -> "meeting_transcripts"
CREATE TABLE "meeting_transcripts" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "raw_content" TEXT NOT NULL,
    "normalized_content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_transcripts_pkey" PRIMARY KEY ("id")
);
-- CreateTable: MeetingAnalysis -> "meeting_analyses"
CREATE TABLE "meeting_analyses" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "discussion" JSONB DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "blockers" JSONB NOT NULL DEFAULT '[]',
    "openQuestions" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_analyses_pkey" PRIMARY KEY ("id")
);
-- CreateTable: MeetingTaskSuggestion -> "meeting_task_suggestions"
CREATE TABLE "meeting_task_suggestions" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "suggested_assignee" TEXT,
    "suggested_due_date" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "status" "TaskSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "clickup_task_id" TEXT,
    "clickup_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_task_suggestions_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ClickUpTaskLink -> "clickup_task_links"
CREATE TABLE "clickup_task_links" (
    "id" TEXT NOT NULL,
    "suggestion_id" TEXT NOT NULL,
    "clickup_task_id" TEXT NOT NULL,
    "clickup_url" TEXT,
    "clickup_workspace_id" TEXT,
    "clickup_list_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clickup_task_links_pkey" PRIMARY KEY ("id")
);
-- CreateTable: ClickUpIntegration -> "clickup_integrations"
CREATE TABLE "clickup_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "token_type" TEXT NOT NULL DEFAULT 'Bearer',
    "workspace_id" TEXT,
    "workspace_name" TEXT,
    "status" "ClickUpIntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clickup_integrations_pkey" PRIMARY KEY ("id")
);

-- ===== INDEXES (CreateIndex) =====
CREATE INDEX "document_visuals_document_id_idx" ON "document_visuals"("document_id");
CREATE INDEX "document_visuals_page_number_idx" ON "document_visuals"("page_number");
CREATE INDEX "document_visuals_type_idx" ON "document_visuals"("type");
CREATE INDEX "sarvam_digitisation_runs_document_id_idx" ON "sarvam_digitisation_runs"("document_id");
CREATE INDEX "sarvam_digitisation_runs_user_id_idx" ON "sarvam_digitisation_runs"("user_id");
CREATE INDEX "sarvam_digitisation_runs_status_idx" ON "sarvam_digitisation_runs"("status");
CREATE INDEX "document_translations_document_id_idx" ON "document_translations"("document_id");
CREATE INDEX "document_translations_user_id_idx" ON "document_translations"("user_id");
CREATE INDEX "document_translations_document_id_target_language_source_version_id_idx" ON "document_translations"("document_id", "target_language", "source_version_id");
CREATE INDEX "document_translations_status_idx" ON "document_translations"("status");
CREATE INDEX "document_families_user_id_idx" ON "document_families"("user_id");
CREATE INDEX "document_lineages_source_document_id_idx" ON "document_lineages"("source_document_id");
CREATE INDEX "document_lineages_target_document_id_idx" ON "document_lineages"("target_document_id");
CREATE INDEX "document_lifecycle_events_document_id_idx" ON "document_lifecycle_events"("document_id");
CREATE INDEX "document_lifecycle_events_user_id_event_type_idx" ON "document_lifecycle_events"("user_id", "event_type");
CREATE INDEX "document_retention_jobs_scheduled_for_status_idx" ON "document_retention_jobs"("scheduled_for", "status");
CREATE INDEX "document_retention_jobs_document_id_idx" ON "document_retention_jobs"("document_id");
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX "chat_attachments_user_id_idx" ON "chat_attachments"("user_id");
CREATE INDEX "chat_attachments_conversation_id_idx" ON "chat_attachments"("conversation_id");
CREATE INDEX "collab_channels_created_by_id_idx" ON "collab_channels"("created_by_id");
CREATE UNIQUE INDEX "collab_channel_members_channel_id_user_id_key" ON "collab_channel_members"("channel_id", "user_id");
CREATE INDEX "collab_channel_members_channel_id_idx" ON "collab_channel_members"("channel_id");
CREATE INDEX "collab_channel_members_user_id_idx" ON "collab_channel_members"("user_id");
CREATE UNIQUE INDEX "collab_messages_channel_id_client_message_id_key" ON "collab_messages"("channel_id", "client_message_id");
CREATE INDEX "collab_messages_channel_id_idx" ON "collab_messages"("channel_id");
CREATE INDEX "collab_messages_sender_id_idx" ON "collab_messages"("sender_id");
CREATE INDEX "collab_messages_reply_to_id_idx" ON "collab_messages"("reply_to_id");
CREATE UNIQUE INDEX "collab_message_mentions_message_id_mentioned_user_id_key" ON "collab_message_mentions"("message_id", "mentioned_user_id");
CREATE INDEX "collab_message_mentions_message_id_idx" ON "collab_message_mentions"("message_id");
CREATE INDEX "collab_message_mentions_mentioned_user_id_created_at_idx" ON "collab_message_mentions"("mentioned_user_id", "created_at");
CREATE UNIQUE INDEX "collab_message_receipts_message_id_user_id_key" ON "collab_message_receipts"("message_id", "user_id");
CREATE INDEX "collab_message_receipts_message_id_idx" ON "collab_message_receipts"("message_id");
CREATE INDEX "collab_message_receipts_user_id_idx" ON "collab_message_receipts"("user_id");
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");
CREATE INDEX "scheduled_mock_tests_created_by_id_idx" ON "scheduled_mock_tests"("created_by_id");
CREATE INDEX "scheduled_mock_tests_scheduled_start_time_idx" ON "scheduled_mock_tests"("scheduled_start_time");
CREATE INDEX "scheduled_mock_tests_status_idx" ON "scheduled_mock_tests"("status");
CREATE UNIQUE INDEX "mock_test_calendar_syncs_mock_test_id_user_id_key" ON "mock_test_calendar_syncs"("mock_test_id", "user_id");
CREATE INDEX "mock_test_calendar_syncs_user_id_status_idx" ON "mock_test_calendar_syncs"("user_id", "status");
CREATE INDEX "mock_test_calendar_syncs_mock_test_id_idx" ON "mock_test_calendar_syncs"("mock_test_id");
CREATE INDEX "mock_test_calendar_syncs_next_retry_at_idx" ON "mock_test_calendar_syncs"("next_retry_at");
CREATE INDEX "mock_test_calendar_syncs_status_next_retry_at_idx" ON "mock_test_calendar_syncs"("status", "next_retry_at");
CREATE UNIQUE INDEX "mock_test_participants_mock_test_id_user_id_key" ON "mock_test_participants"("mock_test_id", "user_id");
CREATE INDEX "mock_test_participants_mock_test_id_idx" ON "mock_test_participants"("mock_test_id");
CREATE INDEX "mock_test_participants_user_id_idx" ON "mock_test_participants"("user_id");
CREATE INDEX "mock_test_participants_status_idx" ON "mock_test_participants"("status");
CREATE INDEX "collab_calls_channel_id_idx" ON "collab_calls"("channel_id");
CREATE INDEX "collab_calls_host_id_idx" ON "collab_calls"("host_id");
CREATE INDEX "collab_calls_status_idx" ON "collab_calls"("status");
CREATE INDEX "collab_calls_channel_id_created_at_idx" ON "collab_calls"("channel_id", "created_at");
CREATE INDEX "collab_calls_created_at_idx" ON "collab_calls"("created_at");
CREATE INDEX "collab_calls_status_created_at_idx" ON "collab_calls"("status", "created_at");
CREATE UNIQUE INDEX "collab_call_participants_call_id_user_id_key" ON "collab_call_participants"("call_id", "user_id");
CREATE INDEX "collab_call_participants_call_id_idx" ON "collab_call_participants"("call_id");
CREATE INDEX "collab_call_participants_user_id_idx" ON "collab_call_participants"("user_id");
CREATE INDEX "collab_call_participants_user_id_created_at_idx" ON "collab_call_participants"("user_id", "created_at");
CREATE UNIQUE INDEX "google_integrations_user_id_key" ON "google_integrations"("user_id");
CREATE INDEX "scheduled_calls_channel_id_scheduled_start_at_idx" ON "scheduled_calls"("channel_id", "scheduled_start_at");
CREATE INDEX "scheduled_calls_created_by_id_scheduled_start_at_idx" ON "scheduled_calls"("created_by_id", "scheduled_start_at");
CREATE INDEX "scheduled_calls_status_scheduled_start_at_idx" ON "scheduled_calls"("status", "scheduled_start_at");
CREATE INDEX "scheduled_calls_calendar_sync_status_scheduled_start_at_idx" ON "scheduled_calls"("calendar_sync_status", "scheduled_start_at");
CREATE INDEX "scheduled_calls_google_calendar_event_id_idx" ON "scheduled_calls"("google_calendar_event_id");
CREATE INDEX "scheduled_calls_next_retry_at_idx" ON "scheduled_calls"("next_retry_at");
CREATE UNIQUE INDEX "scheduled_call_participants_scheduled_call_id_user_id_key" ON "scheduled_call_participants"("scheduled_call_id", "user_id");
CREATE INDEX "scheduled_call_participants_scheduled_call_id_idx" ON "scheduled_call_participants"("scheduled_call_id");
CREATE INDEX "scheduled_call_participants_user_id_scheduled_call_id_idx" ON "scheduled_call_participants"("user_id", "scheduled_call_id");
CREATE INDEX "voice_tutor_sessions_user_id_created_at_idx" ON "voice_tutor_sessions"("user_id", "created_at");
CREATE INDEX "voice_tutor_sessions_user_id_status_idx" ON "voice_tutor_sessions"("user_id", "status");
CREATE INDEX "voice_tutor_sessions_knowledge_base_id_idx" ON "voice_tutor_sessions"("knowledge_base_id");
CREATE INDEX "voice_tutor_sessions_document_id_idx" ON "voice_tutor_sessions"("document_id");
CREATE INDEX "voice_tutor_messages_session_id_created_at_idx" ON "voice_tutor_messages"("session_id", "created_at");
CREATE UNIQUE INDEX "voice_tutor_feedbacks_session_id_key" ON "voice_tutor_feedbacks"("session_id");
CREATE INDEX "voice_tutor_feedbacks_user_id_created_at_idx" ON "voice_tutor_feedbacks"("user_id", "created_at");
CREATE INDEX "chill_focus_sessions_user_id_created_at_idx" ON "chill_focus_sessions"("user_id", "created_at");
CREATE INDEX "chill_focus_sessions_user_id_status_idx" ON "chill_focus_sessions"("user_id", "status");
CREATE INDEX "chill_focus_sessions_user_id_started_at_idx" ON "chill_focus_sessions"("user_id", "started_at");
CREATE UNIQUE INDEX "chill_focus_preferences_user_id_key" ON "chill_focus_preferences"("user_id");
CREATE UNIQUE INDEX "chill_focus_streaks_user_id_key" ON "chill_focus_streaks"("user_id");
CREATE INDEX "meetings_user_id_status_idx" ON "meetings"("user_id", "status");
CREATE INDEX "meetings_project_id_idx" ON "meetings"("project_id");
CREATE INDEX "meeting_participants_meeting_id_idx" ON "meeting_participants"("meeting_id");
CREATE UNIQUE INDEX "meeting_transcripts_meeting_id_key" ON "meeting_transcripts"("meeting_id");
CREATE UNIQUE INDEX "meeting_analyses_meeting_id_key" ON "meeting_analyses"("meeting_id");
CREATE INDEX "meeting_task_suggestions_meeting_id_status_idx" ON "meeting_task_suggestions"("meeting_id", "status");
CREATE INDEX "meeting_task_suggestions_user_id_idx" ON "meeting_task_suggestions"("user_id");
CREATE UNIQUE INDEX "clickup_task_links_suggestion_id_key" ON "clickup_task_links"("suggestion_id");
CREATE INDEX "clickup_integrations_user_id_status_idx" ON "clickup_integrations"("user_id", "status");

-- ===== FOREIGN KEYS (AddForeignKey, deferred to end per Prisma convention) =====
ALTER TABLE "document_visuals" ADD CONSTRAINT "document_visuals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sarvam_digitisation_runs" ADD CONSTRAINT "sarvam_digitisation_runs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sarvam_digitisation_runs" ADD CONSTRAINT "sarvam_digitisation_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_translations" ADD CONSTRAINT "document_translations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_translations" ADD CONSTRAINT "document_translations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_families" ADD CONSTRAINT "document_families_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_lineages" ADD CONSTRAINT "document_lineages_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_lineages" ADD CONSTRAINT "document_lineages_target_document_id_fkey" FOREIGN KEY ("target_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_lifecycle_events" ADD CONSTRAINT "document_lifecycle_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_lifecycle_events" ADD CONSTRAINT "document_lifecycle_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_retention_jobs" ADD CONSTRAINT "document_retention_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_retention_jobs" ADD CONSTRAINT "document_retention_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_channels" ADD CONSTRAINT "collab_channels_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_channel_members" ADD CONSTRAINT "collab_channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "collab_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_channel_members" ADD CONSTRAINT "collab_channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_messages" ADD CONSTRAINT "collab_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "collab_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_messages" ADD CONSTRAINT "collab_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_messages" ADD CONSTRAINT "collab_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "collab_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collab_messages" ADD CONSTRAINT "collab_messages_shared_mock_test_id_fkey" FOREIGN KEY ("shared_mock_test_id") REFERENCES "scheduled_mock_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collab_messages" ADD CONSTRAINT "collab_messages_call_session_id_fkey" FOREIGN KEY ("call_session_id") REFERENCES "collab_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collab_messages" ADD CONSTRAINT "collab_messages_scheduled_call_id_fkey" FOREIGN KEY ("scheduled_call_id") REFERENCES "scheduled_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collab_message_mentions" ADD CONSTRAINT "collab_message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "collab_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_message_mentions" ADD CONSTRAINT "collab_message_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_message_receipts" ADD CONSTRAINT "collab_message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "collab_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_message_receipts" ADD CONSTRAINT "collab_message_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_mock_tests" ADD CONSTRAINT "scheduled_mock_tests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_test_calendar_syncs" ADD CONSTRAINT "mock_test_calendar_syncs_mock_test_id_fkey" FOREIGN KEY ("mock_test_id") REFERENCES "scheduled_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_test_calendar_syncs" ADD CONSTRAINT "mock_test_calendar_syncs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_test_participants" ADD CONSTRAINT "mock_test_participants_mock_test_id_fkey" FOREIGN KEY ("mock_test_id") REFERENCES "scheduled_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mock_test_participants" ADD CONSTRAINT "mock_test_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_calls" ADD CONSTRAINT "collab_calls_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "collab_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_calls" ADD CONSTRAINT "collab_calls_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_call_participants" ADD CONSTRAINT "collab_call_participants_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "collab_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collab_call_participants" ADD CONSTRAINT "collab_call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "google_integrations" ADD CONSTRAINT "google_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "collab_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_calls" ADD CONSTRAINT "scheduled_calls_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scheduled_call_participants" ADD CONSTRAINT "scheduled_call_participants_scheduled_call_id_fkey" FOREIGN KEY ("scheduled_call_id") REFERENCES "scheduled_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_call_participants" ADD CONSTRAINT "scheduled_call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_tutor_sessions" ADD CONSTRAINT "voice_tutor_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_tutor_sessions" ADD CONSTRAINT "voice_tutor_sessions_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "voice_tutor_sessions" ADD CONSTRAINT "voice_tutor_sessions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "voice_tutor_messages" ADD CONSTRAINT "voice_tutor_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_tutor_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_tutor_feedbacks" ADD CONSTRAINT "voice_tutor_feedbacks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_tutor_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_tutor_feedbacks" ADD CONSTRAINT "voice_tutor_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chill_focus_sessions" ADD CONSTRAINT "chill_focus_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chill_focus_preferences" ADD CONSTRAINT "chill_focus_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chill_focus_streaks" ADD CONSTRAINT "chill_focus_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_transcripts" ADD CONSTRAINT "meeting_transcripts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_analyses" ADD CONSTRAINT "meeting_analyses_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_task_suggestions" ADD CONSTRAINT "meeting_task_suggestions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clickup_task_links" ADD CONSTRAINT "clickup_task_links_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "meeting_task_suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clickup_integrations" ADD CONSTRAINT "clickup_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
