import {
  canUsePlatformAccess,
} from "./access"
import { claudeModels } from "./data/claude"
import { deepseekModels } from "./data/deepseek"
import { geminiModels } from "./data/gemini"
import { grokModels } from "./data/grok"
import { mistralModels } from "./data/mistral"
import { getOllamaModels, ollamaModels } from "./data/ollama"
import { openaiModels } from "./data/openai"
import { discoverOpenRouterModels } from "./discovery"
import { perplexityModels } from "./data/perplexity"
import { ModelConfig } from "./types"

// Static models (always available)
const STATIC_MODELS: ModelConfig[] = [
  ...openaiModels,
  ...mistralModels,
  ...deepseekModels,
  ...claudeModels,
  ...grokModels,
  ...perplexityModels,
  ...geminiModels,
  ...ollamaModels, // Static fallback Ollama models
]

// Dynamic models cache
let dynamicModelsCache: ModelConfig[] | null = null
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// // Function to get all models including dynamically detected ones
export async function getAllModels(): Promise<ModelConfig[]> {
  const now = Date.now()

  if (dynamicModelsCache && now - lastFetchTime < CACHE_DURATION) {
    return dynamicModelsCache
  }

  try {
    const [detectedOllamaModels, discoveredOpenRouterModels] =
      await Promise.all([
        getOllamaModels(),
        discoverOpenRouterModels(),
      ])

    const staticModelsWithoutOllama = STATIC_MODELS.filter(
      (model) => model.providerId !== "ollama"
    )

    dynamicModelsCache = [
      ...staticModelsWithoutOllama,
      ...detectedOllamaModels,
      ...discoveredOpenRouterModels,
    ]

    lastFetchTime = now

    return dynamicModelsCache
  } catch (error) {
    console.warn(
      "Failed to load dynamic models, using available static models:",
      error
    )

    const staticModelsWithoutOllama = STATIC_MODELS.filter(
      (model) => model.providerId !== "ollama"
    )

    try {
      const detectedOllamaModels = await getOllamaModels()

      dynamicModelsCache = [
        ...staticModelsWithoutOllama,
        ...detectedOllamaModels,
      ]

      lastFetchTime = now

      return dynamicModelsCache
    } catch {
      return STATIC_MODELS
    }
  }
}

export async function getModelsWithAccessFlags(
  options?: {
    isAuthenticated?: boolean
    userProviders?: string[]
  }
): Promise<ModelConfig[]> {
  const models = await getAllModels()

  const isAuthenticated = options?.isAuthenticated ?? false
  const userProviders = new Set(options?.userProviders ?? [])

  return models.map((model) => {
    const hasByokAccess =
      userProviders.has(model.providerId) ||
      model.providerId === "ollama"

    const hasPlatformAccess = canUsePlatformAccess(
      model,
      isAuthenticated
    )

    return {
      ...model,
      accessible: hasByokAccess || hasPlatformAccess,
    }
  })
}

export async function getModelsForProvider(
  provider: string
): Promise<ModelConfig[]> {
  const models = await getAllModels()

  return models
    .filter((model) => model.providerId === provider)
    .map((model) => ({
      ...model,
      accessible: true,
    }))
}

// Function to get models based on user's available providers
export async function getModelsForUserProviders(
  providers: string[]
): Promise<ModelConfig[]> {
  const providerModels = await Promise.all(
    providers.map((provider) => getModelsForProvider(provider))
  )

  const flatProviderModels = providerModels.flat()

  return flatProviderModels
}

// Synchronous function to get model info for simple lookups
// This uses cached data if available, otherwise falls back to static models
export function getModelInfo(modelId: string): ModelConfig | undefined {
  // First check the cache if it exists
  if (dynamicModelsCache) {
    return dynamicModelsCache.find((model) => model.id === modelId)
  }

  // Fall back to static models for immediate lookup
  return STATIC_MODELS.find((model) => model.id === modelId)
}

// For backward compatibility - static models only
export const MODELS: ModelConfig[] = STATIC_MODELS

// Function to refresh the models cache
export function refreshModelsCache(): void {
  dynamicModelsCache = null
  lastFetchTime = 0
}