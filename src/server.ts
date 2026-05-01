import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import cors from 'cors';
import { v1Router } from './routes/v1';

const app = express();
const logger = pino({ level: 'info' });

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

app.use('/v1', v1Router);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});
