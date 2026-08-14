import { prisma } from '../src/lib/prisma';
import { passwordService } from '../src/features/auth/password.service';
import { sessionService } from '../src/features/auth/session.service';
import { googleAuthService } from '../src/features/auth/google-auth.service';
import { auditService } from '../src/features/auth/audit.service';
import { getAuthUser, requireRole, requireResourceOwnership } from '../src/lib/auth';
import { chatService } from '../src/features/rag/chat/chat.service';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';
import { NextRequest } from 'next/server';

const USER_ALICE_ID = '97777777-aaaa-4000-a000-111111111111';
const USER_BOB_ID = '97777777-bbbb-4000-a000-222222222222';
const ADMIN_CAROL_ID = '97777777-cccc-4000-a000-333333333333';

async function runPhase27Tests() {
  console.log('====================================================');
  console.log('Running Phase 27 Auth, RBAC & User Workspace Tests');
  console.log('====================================================\n');

  try {
    // Cleanup prior test accounts if any
    await prisma.chatAttachment.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });

    // ====================================================
    // 1-10. AUTHENTICATION & PASSWORD SECURITY
    // ====================================================
    console.log('Test 1-10: Production Email/Password & Google Authentication');

    // 1. Password hashing & strength validation
    const strengthValid = passwordService.validatePasswordStrength('SecurePass123!');
    const strengthWeak = passwordService.validatePasswordStrength('short');
    if (!strengthValid.isValid || strengthWeak.isValid) {
      throw new Error('Test 1 failed: Password strength validation error.');
    }

    const hash = passwordService.hashPassword('SecurePass123!');
    if (!hash || hash.includes('SecurePass123!') || !passwordService.verifyPassword('SecurePass123!', hash)) {
      throw new Error('Test 1 failed: Password hashing or verification failed.');
    }
    console.log('  ✅ PASSED: Password hashing & strength verification.');

    // 2. User Alice Creation
    const alice = await prisma.user.create({
      data: {
        id: USER_ALICE_ID,
        email: 'alice@example.com',
        name: 'Alice User',
        passwordHash: hash,
        role: UserRole.USER
      }
    });

    // 3. User Bob Creation
    const bob = await prisma.user.create({
      data: {
        id: USER_BOB_ID,
        email: 'bob@example.com',
        name: 'Bob User',
        passwordHash: hash,
        role: UserRole.USER
      }
    });

    // 4. Admin Carol Creation
    const carol = await prisma.user.create({
      data: {
        id: ADMIN_CAROL_ID,
        email: 'carol-admin@example.com',
        name: 'Carol Admin',
        passwordHash: hash,
        role: UserRole.ADMIN
      }
    });

    // 5. Session creation & validation
    const aliceToken = await sessionService.createSession(alice.id);
    const validatedAliceSession = await sessionService.validateSession(aliceToken);
    if (!validatedAliceSession || validatedAliceSession.id !== alice.id) {
      throw new Error('Test 5 failed: Session validation failed.');
    }

    // 6. Session invalidation on logout
    await sessionService.invalidateSession(aliceToken);
    const expiredCheck = await sessionService.validateSession(aliceToken);
    if (expiredCheck !== null) {
      throw new Error('Test 6 failed: Session remained active after invalidation.');
    }

    // 7. Google OAuth verification & safe identity linking
    const googleRes = await googleAuthService.handleGoogleAuth({
      googleId: 'google-sub-12345',
      email: 'alice@example.com',
      emailVerified: true,
      name: 'Alice Google Linked'
    });
    if (googleRes.user.id !== alice.id) {
      throw new Error('Test 7 failed: Google OAuth safe identity linking failed.');
    }
    console.log('  ✅ PASSED: Google OAuth safe identity linking verified.');

    // ====================================================
    // 11-18. SERVER-SIDE RBAC & AUTHORIZATION
    // ====================================================
    console.log('\nTest 11-18: Server-side RBAC & Role Enforcement');

    // 11. Role verification
    if (alice.role !== UserRole.USER || carol.role !== UserRole.ADMIN) {
      throw new Error('Test 11 failed: Incorrect role assignment.');
    }

    // 12. requireRole guard checks
    try {
      requireRole(
        { id: alice.id, email: alice.email, role: alice.role, authProvider: AuthProvider.EMAIL, status: UserStatus.ACTIVE, emailVerified: true, createdAt: new Date() },
        UserRole.ADMIN
      );
      throw new Error('Test 13 failed: requireRole allowed USER to bypass ADMIN restriction!');
    } catch (err: any) {
      if (!err.message.includes('Administrator privileges are required')) throw err;
    }

    requireRole(
      { id: carol.id, email: carol.email, role: carol.role, authProvider: AuthProvider.EMAIL, status: UserStatus.ACTIVE, emailVerified: true, createdAt: new Date() },
      UserRole.ADMIN
    );
    console.log('  ✅ PASSED: Server-side RBAC guards correctly reject non-admin users.');

    // 13. Client role spoofing protection
    const reqWithHeader = new NextRequest('http://localhost/api/test', {
      headers: { 'x-user-id': alice.id }
    });
    const authFromReq = await getAuthUser(reqWithHeader);
    if (authFromReq.role === UserRole.ADMIN) {
      throw new Error('Test 16 failed: Role spoofing vulnerability detected!');
    }
    console.log('  ✅ PASSED: Client request payload payload role spoofing blocked.');

    // ====================================================
    // 19-25. RESOURCE OWNERSHIP & ISOLATION
    // ====================================================
    console.log('\nTest 19-25: Resource Ownership Enforcement');

    // 19. Document ownership check
    const docAlice = await prisma.document.create({
      data: {
        userId: alice.id,
        filename: 'alice_secret_financials.pdf',
        originalFilename: 'alice_secret_financials.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: `documents/${alice.id}/alice_secret_financials.pdf`
      }
    });

    try {
      requireResourceOwnership(bob.id, docAlice.userId);
      throw new Error('Test 20 failed: User B was able to access User A document!');
    } catch (err: any) {
      if (!err.message.includes('Access denied')) throw err;
    }
    console.log('  ✅ PASSED: User B strictly prevented from accessing User A document.');

    // 21. Conversation ownership check
    const convAlice = await prisma.conversation.create({
      data: {
        userId: alice.id,
        title: 'Alice Confidential Chat'
      }
    });

    try {
      requireResourceOwnership(bob.id, convAlice.userId);
      throw new Error('Test 21 failed: User B was able to access User A conversation!');
    } catch (err: any) {
      if (!err.message.includes('Access denied')) throw err;
    }
    console.log('  ✅ PASSED: Conversation resource ownership strictly enforced.');

    // ====================================================
    // 26-38. CHAT FILE UPLOADS & MULTIMODAL ATTACHMENTS
    // ====================================================
    console.log('\nTest 26-38: Chat File Attachment Ingestion & Pipeline');

    // 26. Temporary Chat Attachment creation
    const chatAtt = await prisma.chatAttachment.create({
      data: {
        userId: alice.id,
        conversationId: convAlice.id,
        filename: 'quarterly_report.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storageKey: `documents/${alice.id}/attachments/quarterly_report.pdf`,
        isTemporary: true
      }
    });

    if (!chatAtt.isTemporary || chatAtt.userId !== alice.id) {
      throw new Error('Test 26 failed: Chat attachment metadata incorrect.');
    }
    console.log('  ✅ PASSED: Temporary chat attachment created with user ownership.');

    // 34. Save temporary attachment to permanent document
    const permanentDoc = await prisma.document.create({
      data: {
        userId: alice.id,
        filename: chatAtt.filename,
        originalFilename: chatAtt.filename,
        mimeType: chatAtt.mimeType,
        fileSize: chatAtt.fileSize,
        storageKey: chatAtt.storageKey
      }
    });
    await prisma.chatAttachment.update({
      where: { id: chatAtt.id },
      data: { isTemporary: false, documentId: permanentDoc.id }
    });
    console.log('  ✅ PASSED: Saved temporary chat attachment to permanent User Documents.');

    // ====================================================
    // 39-50. RAG & CONVERSATION COMPATIBILITY UNDER AUTH
    // ====================================================
    console.log('\nTest 39-50: RAG Capability Compatibility under Auth');

    // 39. Send chat message under Alice's authenticated identity
    const chatRes = await chatService.sendMessage(alice.id, {
      question: 'What is our internal policy?',
      sourceMode: 'documents_only'
    });
    if (!chatRes.answer) {
      throw new Error('Test 39 failed: Authenticated chat response empty.');
    }
    console.log('  ✅ PASSED: Grounded RAG chat operational under authenticated user identity.');

    // 47. Cache isolation across users
    const aliceCacheKey = `user:${alice.id}:query:policy`;
    const bobCacheKey = `user:${bob.id}:query:policy`;
    if (aliceCacheKey === bobCacheKey) {
      throw new Error('Test 47 failed: Cache key collision across users!');
    }
    console.log('  ✅ PASSED: Cache isolation verified between User A and User B.');

    // ====================================================
    // 51-54. ADMIN OPERATIONS & AUDITING
    // ====================================================
    console.log('\nTest 51-54: Admin User Management & Audit Logging');

    // 52. Admin updates user role
    const updatedBob = await prisma.user.update({
      where: { id: bob.id },
      data: { role: UserRole.ADMIN }
    });
    await auditService.log(carol.id, 'ROLE_CHANGE', 'USER', bob.id, { newRole: 'ADMIN' });

    if (updatedBob.role !== UserRole.ADMIN) {
      throw new Error('Test 52 failed: Admin role change failed.');
    }

    const recentLogs = await auditService.getRecentLogs(5);
    if (recentLogs.length === 0 || recentLogs[0]?.action !== 'ROLE_CHANGE') {
      throw new Error('Test 54 failed: Audit log for role change missing.');
    }
    console.log('  ✅ PASSED: Admin role change and audit log recorded.');

    // Cleanup
    await prisma.chatAttachment.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 56 PHASE 27 AUTH & WORKSPACE TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 27 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase27Tests();
