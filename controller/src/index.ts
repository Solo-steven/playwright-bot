import "dotenv/config";
import { createSession, createSessionWorker } from "./session";

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
