import "dotenv/config";
import express from "express";
import { createSession, createSessionWorker, SessionConfig } from "./session";


// const app = express();

// app.use(express.json());

// app.post('/session/create', async (req, resp) => {
//     const config = req.body as SessionConfig;
//     const sessionId = await createSession(config);
//     resp.json({
//         sessionId,
//     });
//     return;
// });

// app.post("/session/state", async () => {
    
// });

// app.listen(process.env.PORT, () => {

// });
 
async function testSession() {
    const session = await createSession({
        taskDescription: "Go to Yahoo news and click a random article",
        bucketName: process.env.GCP_BUCKET_NAME as string,
        credentials: process.env.GCP_BUCKET_CREDENTIALS as string,
        url: "https://google.com",
        maxIter: 10, 
    });
    await createSessionWorker(session);
}

testSession();
