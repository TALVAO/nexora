import dotenv from "dotenv";
import { buildApp } from "./app.js";

dotenv.config();

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port, host });
    app.log.info(`🚀 Nexora API iniciada em http://${host}:${port}`);
  } catch (err) {
    app.log.error(err, "Erro ao iniciar o servidor");
    process.exit(1);
  }
}

start();
