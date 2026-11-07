import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { errorHandler, notFound } from './middleware/error.js';
import api from './routes/api.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

await migrate();
app.listen(config.port, () => {
  console.log(`API listening on ${config.port}`);
});
