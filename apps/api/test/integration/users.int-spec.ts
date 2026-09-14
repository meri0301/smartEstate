import type { AdminUser, ApiError, MeResponse, Page } from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, startTestApp, type TestApp } from './setup/test-app.js';

describe('users', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the current account with an empty buyer profile after registration', async () => {
    const session = await registerUser(app, { displayName: 'Profile Tester' });
    const response = await app.request('GET', '/api/users/me', { token: session.accessToken });
    expect(response.statusCode).toBe(200);
    const me = response.json<MeResponse>();
    expect(me).toMatchObject({
      id: session.user.id,
      email: session.email,
      displayName: 'Profile Tester',
    });
    expect(me.profile).toMatchObject({
      displayName: 'Profile Tester',
      phone: null,
      budgetMinAmd: null,
      preferredRooms: [],
      priorities: {},
      commuteAnchor: null,
      onboardingCompletedAt: null,
    });
  });

  it('updates display name, phone and locale', async () => {
    const session = await registerUser(app);
    const response = await app.request('PATCH', '/api/users/me', {
      token: session.accessToken,
      body: { displayName: 'Anahit', phone: '+37491123456', locale: 'ru' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<MeResponse>()).toMatchObject({
      displayName: 'Anahit',
      locale: 'ru',
      profile: { phone: '+37491123456' },
    });

    const empty = await app.request('PATCH', '/api/users/me', {
      token: session.accessToken,
      body: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it('stores onboarding preferences including a PostGIS commute anchor', async () => {
    const session = await registerUser(app);
    const body = {
      budgetMinAmd: 30_000_000,
      budgetMaxAmd: 65_000_000,
      preferredRooms: [2, 3],
      priorities: { price: 0.5, commute: 0.3, area: 0.2 },
      commuteAnchor: { lat: 40.1872, lon: 44.5152, label: 'Republic Square' },
    };
    const response = await app.request('PUT', '/api/users/me/preferences', {
      token: session.accessToken,
      body,
    });
    expect(response.statusCode).toBe(200);
    const me = response.json<MeResponse>();
    expect(me.profile?.budgetMinAmd).toBe(30_000_000);
    expect(me.profile?.preferredRooms).toEqual([2, 3]);
    expect(me.profile?.priorities).toEqual(body.priorities);
    expect(me.profile?.commuteAnchor?.label).toBe('Republic Square');
    expect(me.profile?.commuteAnchor?.lat).toBeCloseTo(40.1872, 5);
    expect(me.profile?.commuteAnchor?.lon).toBeCloseTo(44.5152, 5);
    expect(me.profile?.onboardingCompletedAt).not.toBeNull();

    const cleared = await app.request('PUT', '/api/users/me/preferences', {
      token: session.accessToken,
      body: { ...body, commuteAnchor: null },
    });
    expect(cleared.json<MeResponse>().profile?.commuteAnchor).toBeNull();

    const inverted = await app.request('PUT', '/api/users/me/preferences', {
      token: session.accessToken,
      body: { ...body, budgetMinAmd: 90_000_000 },
    });
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json<ApiError>().details?.[0]?.path).toBe('budgetMaxAmd');
  });

  describe('administration', () => {
    it('is forbidden for ordinary users', async () => {
      const session = await registerUser(app);
      const response = await app.request('GET', '/api/users', { token: session.accessToken });
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiError>().code).toBe('FORBIDDEN');
    });

    it('lists accounts with keyset pagination and search', async () => {
      const admin = await registerUser(app, { role: 'ADMIN', displayName: 'Root Admin' });
      await registerUser(app, { displayName: 'Searchable Person' });

      const first = await app.request('GET', '/api/users?limit=2', { token: admin.accessToken });
      expect(first.statusCode).toBe(200);
      const page1 = first.json<Page<AdminUser>>();
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const second = await app.request(
        'GET',
        `/api/users?limit=2&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`,
        {
          token: admin.accessToken,
        },
      );
      const page2 = second.json<Page<AdminUser>>();
      const ids = new Set([...page1.items, ...page2.items].map((u) => u.id));
      expect(ids.size).toBe(page1.items.length + page2.items.length);

      const search = await app.request('GET', '/api/users?search=searchable%20person', {
        token: admin.accessToken,
      });
      const found = search.json<Page<AdminUser>>();
      expect(found.items.length).toBeGreaterThanOrEqual(1);
      expect(
        found.items.every((u) => u.displayName.toLowerCase().includes('searchable person')),
      ).toBe(true);

      const filtered = await app.request('GET', '/api/users?role=ADMIN', {
        token: admin.accessToken,
      });
      expect(filtered.json<Page<AdminUser>>().items.every((u) => u.role === 'ADMIN')).toBe(true);
    });

    it('changes roles, refuses self-changes and writes an audit entry', async () => {
      const admin = await registerUser(app, { role: 'ADMIN' });
      const target = await registerUser(app);

      const promoted = await app.request('PATCH', `/api/users/${target.user.id}/role`, {
        token: admin.accessToken,
        body: { role: 'AGENT' },
      });
      expect(promoted.statusCode).toBe(200);
      expect(promoted.json<AdminUser>().role).toBe('AGENT');

      const self = await app.request('PATCH', `/api/users/${admin.user.id}/role`, {
        token: admin.accessToken,
        body: { role: 'USER' },
      });
      expect(self.statusCode).toBe(400);
      expect(self.json<ApiError>().code).toBe('SELF_ROLE_CHANGE');

      const audit = await app
        .prisma()
        .auditLog.findMany({ where: { entityId: target.user.id, action: 'user.role.update' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorId).toBe(admin.user.id);
      expect(audit[0]?.metadata).toEqual({ from: 'USER', to: 'AGENT' });
    });
  });
});
