-- CreateEnum
CREATE TYPE "RagConversationType" AS ENUM ('PRIVATE', 'GROUP', 'PROJECT');

-- CreateTable
CREATE TABLE "rag_conversations" (
    "id" TEXT NOT NULL,
    "type" "RagConversationType" NOT NULL DEFAULT 'PRIVATE',
    "created_by_id" TEXT NOT NULL,
    "project_id" TEXT,
    "knowledge_base_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_conversation_members" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'VIEWER',
    "last_read_at" TIMESTAMP(3),
    "last_read_message_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "author_id" TEXT,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_conversation_document_sources" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_conversation_document_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_conversation_kb_sources" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_conversation_kb_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rag_conversations_created_by_id_idx" ON "rag_conversations"("created_by_id");

-- CreateIndex
CREATE INDEX "rag_conversations_project_id_idx" ON "rag_conversations"("project_id");

-- CreateIndex
CREATE INDEX "rag_conversations_type_idx" ON "rag_conversations"("type");

-- CreateIndex
CREATE UNIQUE INDEX "rag_conversation_members_conversation_id_user_id_key" ON "rag_conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "rag_conversation_members_conversation_id_idx" ON "rag_conversation_members"("conversation_id");

-- CreateIndex
CREATE INDEX "rag_conversation_members_user_id_idx" ON "rag_conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "rag_messages_conversation_id_idx" ON "rag_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "rag_messages_conversation_id_created_at_idx" ON "rag_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rag_conversation_document_sources_conversation_id_document_key" ON "rag_conversation_document_sources"("conversation_id", "document_id");

-- CreateIndex
CREATE INDEX "rag_conversation_document_sources_conversation_id_idx" ON "rag_conversation_document_sources"("conversation_id");

-- CreateIndex
CREATE INDEX "rag_conversation_document_sources_document_id_idx" ON "rag_conversation_document_sources"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "rag_conversation_kb_sources_conversation_id_knowledge_base_key" ON "rag_conversation_kb_sources"("conversation_id", "knowledge_base_id");

-- CreateIndex
CREATE INDEX "rag_conversation_kb_sources_conversation_id_idx" ON "rag_conversation_kb_sources"("conversation_id");

-- CreateIndex
CREATE INDEX "rag_conversation_kb_sources_knowledge_base_id_idx" ON "rag_conversation_kb_sources"("knowledge_base_id");

-- AddForeignKey
ALTER TABLE "rag_conversations" ADD CONSTRAINT "rag_conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversations" ADD CONSTRAINT "rag_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_members" ADD CONSTRAINT "rag_conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "rag_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_members" ADD CONSTRAINT "rag_conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_messages" ADD CONSTRAINT "rag_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "rag_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_messages" ADD CONSTRAINT "rag_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_document_sources" ADD CONSTRAINT "rag_conversation_document_sources_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "rag_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_document_sources" ADD CONSTRAINT "rag_conversation_document_sources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_document_sources" ADD CONSTRAINT "rag_conversation_document_sources_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_kb_sources" ADD CONSTRAINT "rag_conversation_kb_sources_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "rag_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_kb_sources" ADD CONSTRAINT "rag_conversation_kb_sources_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_conversation_kb_sources" ADD CONSTRAINT "rag_conversation_kb_sources_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
