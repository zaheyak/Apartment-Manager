import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { errorHandler, notFound } from './middleware/error.js';
import api from './routes/api.js';

const app = express();

function isAllowedVercelPreview(origin) {
  const prefix = `https://${config.vercelProjectName}-`;
  const suffix = `-${config.vercelTeamSlug}.vercel.app`;
  if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
  const deploymentName = origin.slice(prefix.length, -suffix.length);
  return /^[a-z0-9-]+$/.test(deploymentName);
}

function allowCorsOrigin(origin, callback) {
  if (
    !origin
    || config.corsOrigins.includes(origin)
    || isAllowedVercelPreview(origin)
  ) {
    callback(null, true);
    return;
  }
  callback(null, false);
}

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: allowCorsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

await migrate();
app.listen(config.port, () => {
  console.log(`API listening on ${config.port}`);
});
