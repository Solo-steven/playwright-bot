import { Storage } from "@google-cloud/storage";

export type BucketClient = {
  uploadBased64Image: (sessionId: string, imageInBase64: string) => Promise<void>;
};

export type BucketClientConfig = {
  bucketName: string;
  credentials: string;
};

export function createBucketClient(config: BucketClientConfig): BucketClient {
  const storage = new Storage({
    credentials: JSON.parse(config.credentials),
  });

  async function uploadBased64Image(filePath: string, imageInBase64: string) {
    await storage
      .bucket(config.bucketName)
      .file(filePath)
      .save(Buffer.from(imageInBase64, "base64"));
  }

  return {
    uploadBased64Image,
  };
}
