import 'dotenv/config';

const required = ['JWT_SECRET'];

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/linkflow',
  jwtSecret: process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-32',
  jwtAccessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900', 10),
  refreshTtlDays: parseInt(process.env.REFRESH_TTL_DAYS || '30', 10),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),
  nodeEnv: process.env.NODE_ENV || 'development'
};

export function validateConfig() {
  for (const key of required) {
    if (!process.env[key] && config.nodeEnv === 'production') {
      throw new Error(`Missing required env: ${key}`);
    }
  }
  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}
