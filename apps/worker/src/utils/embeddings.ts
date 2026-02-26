import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

type EmbeddingConfig = {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>["textEmbedding"]>;
  providerOptions: {
    google: {
      outputDimensionality: number;
      taskType: "SEMANTIC_SIMILARITY";
    };
  };
  modelName: string;
};

let embeddingConfig: EmbeddingConfig | null = null;

function getEmbeddingConfig(): EmbeddingConfig {
  if (embeddingConfig) return embeddingConfig;

  const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleApiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY environment variable is required",
    );
  }

  const google = createGoogleGenerativeAI({
    apiKey: googleApiKey,
  });

  embeddingConfig = {
    model: google.textEmbedding("gemini-embedding-001"),
    providerOptions: {
      google: {
        outputDimensionality: 768,
        taskType: "SEMANTIC_SIMILARITY",
      },
    },
    modelName: "gemini-embedding-001",
  };

  return embeddingConfig;
}

export async function generateEmbedding(text: string): Promise<{
  embedding: number[];
  model: string;
}> {
  const config = getEmbeddingConfig();
  const { embedding } = await embed({
    model: config.model,
    value: text,
    providerOptions: config.providerOptions,
  });

  return {
    embedding,
    model: config.modelName,
  };
}

/**
 * Generate multiple embeddings with our standard configuration
 */
export async function generateEmbeddings(texts: string[]): Promise<{
  embeddings: number[][];
  model: string;
}> {
  const config = getEmbeddingConfig();
  const { embeddings } = await embedMany({
    model: config.model,
    values: texts,
    providerOptions: config.providerOptions,
  });

  return {
    embeddings,
    model: config.modelName,
  };
}
