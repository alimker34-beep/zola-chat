import { anthropic, createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { createMistral, mistral } from "@ai-sdk/mistral"
import { createOpenAI, openai } from "@ai-sdk/openai"
import { createPerplexity, perplexity } from "@ai-sdk/perplexity"
import type { LanguageModelV1 } from "@ai-sdk/provider"
import { createXai, xai } from "@ai-sdk/xai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "xai"
  | "perplexity"
  | "openrouter"
  | "ollama"

export type OpenProvidersOptions = {
  enableSearch?: boolean
  [key: string]: unknown
}

export function parseModelReference(modelId: string): {
  providerId: ProviderId
  rawModelId: string
} {
  const separatorIndex = modelId.indexOf(":")

  if (separatorIndex === -1) {
    throw new Error(
      `Model "${modelId}" is not provider-qualified. Expected format "provider:model".`
    )
  }

  const providerId = modelId.slice(0, separatorIndex) as ProviderId
  const rawModelId = modelId.slice(separatorIndex + 1)

  if (!rawModelId) {
    throw new Error(`Invalid model ID: ${modelId}`)
  }

  const supportedProviders: ProviderId[] = [
    "openai",
    "anthropic",
    "google",
    "mistral",
    "xai",
    "perplexity",
    "openrouter",
    "ollama",
  ]

  if (!supportedProviders.includes(providerId)) {
    throw new Error(
      `Unsupported provider "${providerId}" in model "${modelId}"`
    )
  }

  return {
    providerId,
    rawModelId,
  }
}

// Get Ollama base URL from environment or use default
const getOllamaBaseURL = () => {
  if (typeof window !== "undefined") {
    return "http://localhost:11434/v1"
  }

  return (
    process.env.OLLAMA_BASE_URL?.replace(/\/+$/, "") + "/v1" ||
    "http://localhost:11434/v1"
  )
}

// Create Ollama provider instance with configurable baseURL
const createOllamaProvider = () => {
  return createOpenAI({
    baseURL: getOllamaBaseURL(),
    apiKey: "ollama",
    name: "ollama",
  })
}

function getOpenRouterOptions(enableSearch?: boolean) {
  if (!enableSearch) {
    return undefined
  }

  return {
    extraBody: {
      plugins: [
        {
          id: "web",
          max_results: 3,
        },
      ],
    },
  }
}

export function openproviders(
  modelId: string,
  settings?: OpenProvidersOptions,
  apiKey?: string
): LanguageModelV1 {
  const { providerId, rawModelId } = parseModelReference(modelId)

  const enableSearch = settings?.enableSearch

  if (providerId === "openrouter") {
    const resolvedApiKey = apiKey || process.env.OPENROUTER_API_KEY

    if (!resolvedApiKey) {
      throw new Error("OpenRouter API key is not configured")
    }

    const openrouterProvider = createOpenRouter({
      apiKey: resolvedApiKey,
    })

    return openrouterProvider.chat(
      rawModelId,
      getOpenRouterOptions(enableSearch)
    )
  }

  if (providerId === "openai") {
    if (apiKey) {
      const openaiProvider = createOpenAI({
        apiKey,
        compatibility: "strict",
      })

      return openaiProvider(rawModelId, settings as never)
    }

    return openai(rawModelId, settings as never)
  }

  if (providerId === "mistral") {
    if (apiKey) {
      const mistralProvider = createMistral({
        apiKey,
      })

      return mistralProvider(rawModelId, settings as never)
    }

    return mistral(rawModelId, settings as never)
  }

  if (providerId === "google") {
    if (apiKey) {
      const googleProvider = createGoogleGenerativeAI({
        apiKey,
      })

      return googleProvider(rawModelId, settings as never)
    }

    return google(rawModelId, settings as never)
  }

  if (providerId === "perplexity") {
    if (apiKey) {
      const perplexityProvider = createPerplexity({
        apiKey,
      })

      return perplexityProvider(rawModelId)
    }

    return perplexity(rawModelId)
  }

  if (providerId === "anthropic") {
    if (apiKey) {
      const anthropicProvider = createAnthropic({
        apiKey,
      })

      return anthropicProvider(rawModelId, settings as never)
    }

    return anthropic(rawModelId, settings as never)
  }

  if (providerId === "xai") {
    if (apiKey) {
      const xaiProvider = createXai({
        apiKey,
      })

      return xaiProvider(rawModelId, settings as never)
    }

    return xai(rawModelId, settings as never)
  }

  if (providerId === "ollama") {
    const ollamaProvider = createOllamaProvider()

    return ollamaProvider(rawModelId, settings as never)
  }

  throw new Error(`Unsupported provider: ${providerId}`)
}