import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, isAdminConfigured, verifyAdminToken } from '@/lib/admin';
import { robotsFor } from '@/lib/site';

export const metadata: Metadata = { title: 'Admin', robots: robotsFor('always-noindex') };
export const dynamic = 'force-dynamic';

async function signIn(formData: FormData) {
  'use server';
  const token = String(formData.get('token') ?? '');
  if (!verifyAdminToken(token)) redirect('/admin/login?error=1');

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: 60 * 60 * 8,
  });
  redirect('/admin');
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!isAdminConfigured()) {
    return (
      <div className="section" style={{ maxWidth: '32rem' }}>
        <h1>Admin unavailable</h1>
        <p className="notice notice--warning">
          ADMIN_API_TOKEN is not set, or is shorter than 16 characters. Set it in the environment before using
          the admin dashboard. Generate one with <span className="mono">openssl rand -hex 32</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="section" style={{ maxWidth: '26rem' }}>
      <h1>Admin</h1>
      {error ? (
        <div className="notice notice--warning" role="alert">
          That token was not accepted.
        </div>
      ) : null}
      <form action={signIn} className="stack">
        <div>
          <label htmlFor="token">Admin token</label>
          <input id="token" name="token" type="password" autoComplete="off" required />
        </div>
        <button type="submit" className="primary">
          Sign in
        </button>
      </form>
    </div>
  );
}
