import "dotenv/config";
import express from "express";
import {
  createSession,
  setActionInstructionToSession,
  getActionResultAPIResponseFromSession,
  connectRedis,
  disconnectRedis,
  shotDownAllSession,
  stopSession,
  deleteSession,
} from "./session";
import { Logger } from "./logger";

const app = express();
app.use(express.json());
// ## Create a browser session
// req body: `{ url: string }`
// resp body: `{ sessionId: string }`
app.post("/session/create", async (req, resp) => {
  // validate req body;
  const url = req.body.url as string;
  const sessionId = await createSession(url);
  Logger.info(`Create Session. Session id: ${sessionId}.`);
  resp.json({ sessionId });
  return;
});
// ## Polling the reponse of browser session
// req body : `{sessionId: string}`
// resp body: `ActionResultAPIResponseBody` (def in session.ts)
app.post("/session/screenshot", async (req, resp) => {
  // validate req body;
  const sessionId = req.body.sessionId;
  // validate state by function
  const respBody = await getActionResultAPIResponseFromSession(sessionId);
  Logger.info(
    `Try to get Session Result,  result is ${respBody.type}${respBody.type === "Failed" ? `(${respBody.state})` : ""}. Session Id: ${sessionId}.`,
  );
  resp.json(respBody);
  return;
});
// ## Given a action instruction to browser session
// req body: `{ sessionId: string, action: ActionInstruction }`
// resp body: `ActionInstructionAPIResponseBody`
app.post("/session/action", async (req, resp) => {
  // validate req body
  const actionInstructopn = req.body.action;
  const sessionId = req.body.sessionId;
  const respBody = await setActionInstructionToSession(sessionId, actionInstructopn);
  Logger.info(
    `Given A instruction to Session, result is ${respBody.type}${respBody.type === "Failed" ? `(${respBody.state})` : ""}. Session Id: ${sessionId}.`,
  );
  resp.json(respBody);
  return;
});
// ## Stop a browser session
// req body: `{ sessionId: string }`
// resp body: `{ reportURL: string }`
app.post("/session/stop", async (req, resp) => {
  const sessionId = req.body.sessionId;
  stopSession(sessionId);
  Logger.info(`Stop a Session. Session Id: ${sessionId}.`);
  resp.json({});
  return;
});
// ## Delete a browser session
// req body: `{ sessionId: string }`
// resp body: `{}`
app.post("/session/delete", async (req, resp) => {
  const sessionId = req.body.sessionId;
  deleteSession(sessionId);
  Logger.info(`delete a session. Session Id: ${sessionId}.`);
  resp.json({});
  return;
});
app.listen(process.env.PORT, async () => {
  await connectRedis();
  Logger.info("Start Browser Server With Redis.");
});
// graceful shutdown
process.on("SIGINT", () => {
  shotDownAllSession();
  Logger.info("Kill all playwright session before server shotdown.");
  disconnectRedis().then(() => {
    Logger.info("Stop redis connection client before server showdown.");
    process.exit(0);
  });
});
