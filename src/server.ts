import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import cors from 'cors';
import { v1Router } from './routes/v1';
import { upsertContext } from './services/contextStore';
import * as fs from 'fs';
import * as path from 'path';

const app = express();
const logger = pino({ level: 'info' });

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

app.use('/v1', v1Router);

// Pre-load customer seed data (judge never pushes customer contexts)
function preloadCustomers() {
  try {
    const seedPath = path.join(__dirname, '..', 'dataset', 'customers_seed.json');
    if (fs.existsSync(seedPath)) {
      const data = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
      const customers = data.customers || [];
      for (const c of customers) {
        upsertContext('customer', c.customer_id, 1, c);
      }
      logger.info(`Pre-loaded ${customers.length} customers from seed`);
    }

    // Also load expanded customers if available
    const expandedDir = path.join(__dirname, '..', 'dataset', 'expanded', 'customers');
    if (fs.existsSync(expandedDir)) {
      const files = fs.readdirSync(expandedDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const c = JSON.parse(fs.readFileSync(path.join(expandedDir, file), 'utf-8'));
        const cid = c.customer_id || file.replace('.json', '');
        upsertContext('customer', cid, 1, c);
      }
      logger.info(`Pre-loaded ${files.length} expanded customers`);
    }
  } catch (err) {
    logger.error(`Failed to pre-load customers: ${err}`);
  }
}

preloadCustomers();

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});
