import { app } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/db';
import { logger } from './utils/logger';

const startServer = async () => {
  // Connect to MySQL
  await connectDatabase();

  const PORT = env.PORT;
  app.listen(PORT, () => {
    logger.info(`Fortress ASR Security Backend running on port ${PORT} in ${env.NODE_ENV} mode.`);
  });
};

startServer().catch((err) => {
  logger.error('Failed to start server:', err);
});
