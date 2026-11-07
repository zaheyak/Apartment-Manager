import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

const databaseUrl = required(
  'DATABASE_URL',
  isProd ? undefined : 'postgres://postgres:postgres@localhost:5433/apartment_manager',
);

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  databaseUrl,
  databaseSsl:
    process.env.DATABASE_SSL === 'true' || databaseUrl.includes('supabase.com'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-change-me'),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  vercelProjectName: process.env.VERCEL_PROJECT_NAME || 'apartment-manager',
  vercelTeamSlug: process.env.VERCEL_TEAM_SLUG || 'zaheyas-projects',
  adminUsername: process.env.ADMIN_USERNAME || 'Rani',
  adminEmail: process.env.ADMIN_EMAIL || 'rani@apartment.local',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'מנהל המערכת',
};
