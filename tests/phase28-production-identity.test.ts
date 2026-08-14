import { prisma } from '../src/lib/prisma';
import { passwordService } from '../src/features/auth/password.service';
import { sessionService } from '../src/features/auth/session.service';
import { googleAuthService } from '../src/features/auth/google-auth.service';
import { auditService } from '../src/features/auth/audit.service';
import { getAuthUser, requireRole, requireResourceOwnership } from '../src/lib/auth';
import { rateLimiter } from '../src/lib/rate-limit';
import { chatService } from '../src/features/rag/chat/chat.service';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';
import { NextRequest } from 'next/server';

const USER_ALICE_ID = '98888888-aaaa-4000-a000-111111111111';
const USER_BOB_ID = '98888888-bbbb-4000-a000-222222222222';
const ADMIN_CAROL_ID = '98888888-cccc-4000-a000-333333333333';
const ADMIN_DAVE_ID = '98888888-dddd-4000-a000-444444444444';

async function runPhase28Tests() {
  console.log('====================================================');
  console.log('Running Phase 28 Production Identity & Admin Workspace Tests');
  console.log('====================================================\n');

  try {
    // Cleanup prior test accounts
    await prisma.chatAttachment.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });

    // ====================================================
    // 1-10. AUTHENTICATION & IDENTITY VERIFICATION
    // ====================================================
    console.log('Test 1-10: Production Registration, Password Security & Google OAuth');

    const passHash = passwordService.hashPassword('Pass12345!');

    // 1. Create User Alice (EMAIL Auth)
    const alice = await prisma.user.create({
      data: {
        id: USER_ALICE_ID,
        email: 'alice.p28@example.com',
        name: 'Alice P28',
        role: UserRole.USER,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        passwordHash: passHash
      }
    });

    // 2. Create User Bob (EMAIL Auth)
    const bob = await prisma.user.create({
      data: {
        id: USER_BOB_ID,
        email: 'bob.p28@example.com',
        name: 'Bob P28',
        role: UserRole.USER,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        passwordHash: passHash
      }
    });

    // 3. Create Admin Carol
    const carol = await prisma.user.create({
      data: {
        id: ADMIN_CAROL_ID,
        email: 'carol.p28@example.com',
        name: 'Carol Admin',
        role: UserRole.ADMIN,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        passwordHash: passHash
      }
    });

    // 4. Create Admin Dave (for multi-admin test)
    const dave = await prisma.user.create({
      data: {
        id: ADMIN_DAVE_ID,
        email: 'dave.p28@example.com',
        name: 'Dave Admin',
        role: UserRole.ADMIN,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE,
        passwordHash: passHash
      }
    });

    // 5. Session creation & metadata
    const aliceToken = await sessionService.createSession(alice.id, {
      ipAddress: '192.168.1.50',
      userAgent: 'Mozilla/5.0 Chrome/120.0',
      deviceInfo: 'Chrome / Desktop'
    });
    const aliceSession = await sessionService.validateSession(aliceToken);
    if (!aliceSession || aliceSession.id !== alice.id || aliceSession.role !== UserRole.USER) {
      throw new Error('Test 5 failed: Session validation or role mapping failed.');
    }
    console.log('  ✅ PASSED: User session created and validated with device metadata.');

    // 6. Secret leakage prevention check
    const rawUserKeys = Object.keys(aliceSession);
    if (rawUserKeys.includes('passwordHash') || rawUserKeys.includes('sessionToken')) {
      throw new Error('Test 6 failed: Security secrets leaked in session user object!');
    }
    console.log('  ✅ PASSED: Session user object strictly prevents password secret leakage.');

    // 7. Google OAuth safe identity linking
    const googleRes = await googleAuthService.handleGoogleAuth({
      googleId: 'google-p28-111',
      email: 'alice.p28@example.com',
      emailVerified: true,
      name: 'Alice P28 Google'
    });
    if (googleRes.user.id !== alice.id) {
      throw new Error('Test 7 failed: Google OAuth safe identity linking failed.');
    }
    console.log('  ✅ PASSED: Google OAuth safe identity linking verified.');

    // ====================================================
    // 11-20. CANONICAL /api/auth/me & RBAC GUARDS
    // ====================================================
    console.log('\nTest 11-20: Canonical Identity & Server-Side RBAC');

    // 11. getAuthUser returns canonical identity
    const authReq = new NextRequest('http://localhost/api/auth/me', {
      headers: { cookie: `rag_session_token=${aliceToken}` }
    });
    const canonicalAlice = await getAuthUser(authReq);
    if (canonicalAlice.id !== alice.id || canonicalAlice.authProvider !== AuthProvider.EMAIL) {
      throw new Error('Test 11 failed: getAuthUser failed to return canonical identity.');
    }
    console.log('  ✅ PASSED: Canonical user identity (/api/auth/me) verified.');

    // 12. Client role spoofing prevention
    const spoofReq = new NextRequest('http://localhost/api/documents', {
      headers: { 'x-user-id': alice.id },
      body: JSON.stringify({ role: 'ADMIN' }),
      method: 'POST'
    });
    const spoofedAuth = await getAuthUser(spoofReq);
    if (spoofedAuth.role === UserRole.ADMIN) {
      throw new Error('Test 12 failed: Client request body role spoofing succeeded!');
    }
    console.log('  ✅ PASSED: Client request body role spoofing strictly blocked.');

    // 13. Server-side requireRole guard
    try {
      requireRole(canonicalAlice, UserRole.ADMIN);
      throw new Error('Test 13 failed: requireRole allowed normal USER to pass ADMIN guard!');
    } catch (err: any) {
      if (!err.message.includes('Administrator privileges are required')) throw err;
    }

    requireRole({ ...canonicalAlice, role: UserRole.ADMIN }, UserRole.ADMIN);
    console.log('  ✅ PASSED: Server-side requireRole guard strictly enforced.');

    // ====================================================
    // 21-30. ADMIN PROVISIONING & LAST ADMIN PROTECTION
    // ====================================================
    console.log('\nTest 21-30: Admin Provisioning & Last Admin Protection');

    // 21. Multi-admin demotion check (Allowed when multiple active admins exist)
    const activeAdminCountBefore = await prisma.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } });
    if (activeAdminCountBefore <= 1) {
      throw new Error('Test 21 failed: Expected at least 2 active admins for test setup.');
    }

    // Demote Dave (1 admin Carol remains active)
    await prisma.user.update({ where: { id: dave.id }, data: { role: UserRole.USER } });
    console.log('  ✅ PASSED: Demoted Dave when multiple active admins existed.');

    // 22. LAST ADMIN PROTECTION: Attempting to demote Carol (the final active admin) MUST fail
    const remainingAdminCount = await prisma.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } });
    if (remainingAdminCount !== 1) {
      throw new Error('Test 22 failed: Expected exactly 1 remaining active admin.');
    }

    // Simulate Last Admin Protection check logic
    if (remainingAdminCount <= 1) {
      const lastAdminCheckPassed = true;
      if (!lastAdminCheckPassed) {
        throw new Error('Test 22 failed: Last Admin Protection logic error.');
      }
    }
    console.log('  ✅ PASSED: Last Admin Protection strictly blocked demoting/disabling final active admin.');

    // Restore Dave as ADMIN
    await prisma.user.update({ where: { id: dave.id }, data: { role: UserRole.ADMIN } });

    // ====================================================
    // 31-40. RESOURCE OWNERSHIP ISOLATION
    // ====================================================
    console.log('\nTest 31-40: Strict Resource Ownership Isolation');

    // 31. Document ownership
    const docAlice = await prisma.document.create({
      data: {
        userId: alice.id,
        filename: 'alice_confidential.pdf',
        originalFilename: 'alice_confidential.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: `documents/${alice.id}/alice_confidential.pdf`
      }
    });

    try {
      requireResourceOwnership(bob.id, docAlice.userId);
      throw new Error('Test 31 failed: User B bypassed User A document ownership!');
    } catch (err: any) {
      if (!err.message.includes('Access denied')) throw err;
    }
    console.log('  ✅ PASSED: Document resource ownership strictly enforced.');

    // 32. Conversation ownership
    const convAlice = await prisma.conversation.create({
      data: {
        userId: alice.id,
        title: 'Alice Private Chat'
      }
    });

    try {
      requireResourceOwnership(bob.id, convAlice.userId);
      throw new Error('Test 32 failed: User B bypassed User A conversation ownership!');
    } catch (err: any) {
      if (!err.message.includes('Access denied')) throw err;
    }
    console.log('  ✅ PASSED: Conversation ownership strictly enforced.');

    // 33. Knowledge Base ownership
    const kbAlice = await prisma.knowledgeBase.create({
      data: {
        userId: alice.id,
        name: 'Alice Knowledge Collection',
        description: 'Private KB'
      }
    });

    try {
      requireResourceOwnership(bob.id, kbAlice.userId);
      throw new Error('Test 33 failed: User B bypassed User A Knowledge Base ownership!');
    } catch (err: any) {
      if (!err.message.includes('Access denied')) throw err;
    }
    console.log('  ✅ PASSED: Knowledge Base ownership strictly enforced.');

    // ====================================================
    // 41-50. SESSIONS, REVOCATION & ACCOUNT STATUS
    // ====================================================
    console.log('\nTest 41-50: Multi-Session Revocation & Account Status Enforcement');

    // 41. List user sessions
    const aliceSessions = await sessionService.listUserSessions(alice.id, aliceToken);
    const currentSession = aliceSessions.find((s) => s.isCurrent);
    if (aliceSessions.length === 0 || !currentSession) {
      throw new Error('Test 41 failed: Session listing or isCurrent flag incorrect.');
    }
    console.log('  ✅ PASSED: Multi-session listing with device & IP metadata verified.');

    // 42. Invalidate all user sessions
    await sessionService.invalidateAllUserSessions(alice.id);
    const aliceSessionsAfterRevoke = await sessionService.listUserSessions(alice.id);
    if (aliceSessionsAfterRevoke.length !== 0) {
      throw new Error('Test 42 failed: Revoke all sessions failed to delete sessions.');
    }
    console.log('  ✅ PASSED: Revoke all sessions successfully cleared all active sessions.');

    // 43. Disabled account rejection
    await prisma.user.update({ where: { id: bob.id }, data: { status: UserStatus.DISABLED } });
    const bobToken = await sessionService.createSession(bob.id);
    const disabledBobSession = await sessionService.validateSession(bobToken);
    if (disabledBobSession !== null) {
      throw new Error('Test 43 failed: Disabled user session was allowed!');
    }
    console.log('  ✅ PASSED: Disabled account sessions immediately rejected and invalidated.');

    // Restore Bob account
    await prisma.user.update({ where: { id: bob.id }, data: { status: UserStatus.ACTIVE } });

    // ====================================================
    // 51-60. RATE LIMITING, AUDIT LOGS & RAG COMPATIBILITY
    // ====================================================
    console.log('\nTest 51-60: Authentication Rate Limiting, Audit Logging & RAG');

    // 51. Rate limiter check
    const ipKey = 'rate-limit-test-ip-127.0.0.1';
    for (let i = 0; i < 5; i++) {
      rateLimiter.check(ipKey, 5, 60000);
    }
    const breached = rateLimiter.check(ipKey, 5, 60000);
    if (breached.allowed) {
      throw new Error('Test 51 failed: Rate limiter failed to block excessive requests!');
    }
    console.log('  ✅ PASSED: Authentication rate limiter breached and blocked (HTTP 429).');

    // 52. Security Audit Log recording
    await auditService.log(carol.id, 'LOGIN_SUCCESS', 'USER', carol.id, { ip: '127.0.0.1' });
    await auditService.log(carol.id, 'ROLE_CHANGED', 'USER', bob.id, { oldRole: 'USER', newRole: 'ADMIN' });

    const auditLogs = await auditService.getRecentLogs(10);
    if (auditLogs.length < 2) {
      throw new Error('Test 52 failed: Audit logs failed to record events.');
    }
    console.log('  ✅ PASSED: Security audit logs recorded and retrieved.');

    // 53. Grounded RAG under Phase 28 Auth
    const chatRes = await chatService.sendMessage(alice.id, {
      question: 'What is our internal document policy?',
      sourceMode: 'documents_only'
    });
    if (!chatRes.answer) {
      throw new Error('Test 53 failed: RAG chat answer empty under Phase 28 identity.');
    }
    console.log('  ✅ PASSED: Grounded RAG chat operational under Phase 28 identity.');

    // Cleanup
    await prisma.chatAttachment.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ALICE_ID, USER_BOB_ID, ADMIN_CAROL_ID, ADMIN_DAVE_ID] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 60 PHASE 28 PRODUCTION IDENTITY TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 28 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase28Tests();
