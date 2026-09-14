import { describe, expect, it } from 'vitest';
import { loginBodySchema, registerBodySchema } from './auth.js';
import { preferencesBodySchema, updateMeBodySchema } from './users.js';

describe('registerBodySchema', () => {
  it('normalises the email and defaults the locale', () => {
    const parsed = registerBodySchema.parse({
      email: '  Ani.Petrosyan@Example.COM ',
      password: 'correct horse battery',
      displayName: ' Ani ',
    });
    expect(parsed.email).toBe('ani.petrosyan@example.com');
    expect(parsed.displayName).toBe('Ani');
    expect(parsed.locale).toBe('hy');
  });

  it('enforces the minimum password length', () => {
    expect(
      registerBodySchema.safeParse({ email: 'a@b.co', password: 'short', displayName: 'Ani' })
        .success,
    ).toBe(false);
  });

  it('rejects malformed emails', () => {
    expect(
      registerBodySchema.safeParse({
        email: 'not-an-email',
        password: 'long enough password',
        displayName: 'Ani',
      }).success,
    ).toBe(false);
  });
});

describe('loginBodySchema', () => {
  it('does not apply the registration password policy to logins', () => {
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});

describe('updateMeBodySchema', () => {
  it('rejects an empty body', () => {
    expect(updateMeBodySchema.safeParse({}).success).toBe(false);
  });

  it('accepts clearing the phone number', () => {
    expect(updateMeBodySchema.safeParse({ phone: null }).success).toBe(true);
  });
});

describe('preferencesBodySchema', () => {
  const base = {
    budgetMinAmd: 30_000_000,
    budgetMaxAmd: 60_000_000,
    preferredRooms: [2, 3],
    priorities: { price: 0.4, commute: 0.3, area: 0.3 },
    commuteAnchor: { lat: 40.1872, lon: 44.5152, label: 'Republic Square' },
  };

  it('accepts a complete preference set', () => {
    expect(preferencesBodySchema.safeParse(base).success).toBe(true);
  });

  it('rejects a budget minimum above the maximum', () => {
    const result = preferencesBodySchema.safeParse({ ...base, budgetMinAmd: 70_000_000 });
    expect(result.success).toBe(false);
  });

  it('allows an open-ended budget', () => {
    expect(preferencesBodySchema.safeParse({ ...base, budgetMaxAmd: null }).success).toBe(true);
  });
});
