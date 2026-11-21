import { ModelConfig } from "./types"

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

const DISCOVERY_CACHE_DURATION = 5 * 60 * 1000

let openRouterModelsCache: ModelConfig[] | null = null
let openRouterLastFetchTime = 0

type OpenRouterModel = {
  id: string
  name?: string
  description?: string
  context_length?: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string
    instruct_type?: string | null
  }
  pricing?: {
    prompt?: string
    completion?: string
    request?: string
    image?: string
    web_search?: string
    internal_reasoning?: string
  }
  supported_parameters?: string[]
  created?: number
  canonical_slug?: string
  hugging_face_id?: string | null
  per_request_limits?: unknown
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
}

type OpenRouterModelsResponse = {
  data?: OpenRouterModel[]
}

function parsePrice(value?: string): number | undefined {
  if (!value) return undefined

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return parsed * 1_000_000
}

function getBaseProviderId(modelId: string): string {
  const slashIndex = modelId.indexOf("/")

  if (slashIndex === -1) {
    return "openrouter"
  }

  return modelId.slice(0, slashIndex)
}

function getModelFamily(modelId: string, name?: string): string {
  const provider = getBaseProviderId(modelId)

  const normalizedName = (name || "").toLowerCase()

  if (normalizedName.includes("gpt")) return "GPT"
  if (normalizedName.includes("claude")) return "Claude"
  if (normalizedName.includes("gemini")) return "Gemini"
  if (normalizedName.includes("grok")) return "Grok"
  if (normalizedName.includes("mistral")) return "Mistral"
  if (normalizedName.includes("llama")) return "Llama"
  if (normalizedName.includes("qwen")) return "Qwen"
  if (normalizedName.includes("deepseek")) return "DeepSeek"
  if (normalizedName.includes("sonar")) return "Sonar"

  return provider
}

function getIcon(modelId: string, name?: string): string {
  const normalized = `${modelId} ${name || ""}`.toLowerCase()

  if (normalized.includes("openai") || normalized.includes("gpt")) {
    return "openai"
  }

  if (normalized.includes("anthropic") || normalized.includes("claude")) {
    return "claude"
  }

  if (normalized.includes("google") || normalized.includes("gemini")) {
    return "gemini"
  }

  if (normalized.includes("x-ai") || normalized.includes("grok")) {
    return "xai"
  }

  if (normalized.includes("mistral")) {
    return "mistral"
  }

  if (normalized.includes("perplexity") || normalized.includes("sonar")) {
    return "perplexity"
  }

  if (normalized.includes("deepseek")) {
    return "deepseek"
  }

  if (normalized.includes("meta-llama") || normalized.includes("llama")) {
    return "meta"
  }

  if (normalized.includes("qwen")) {
    return "qwen"
  }

  return "openrouter"
}

function hasTextOutput(model: OpenRouterModel): boolean {
  const outputModalities = model.architecture?.output_modalities

  if (!outputModalities || outputModalities.length === 0) {
    return true
  }

  return outputModalities.some(
    (modality) => modality.toLowerCase() === "text"
  )
}

function hasVision(model: OpenRouterModel): boolean {
  const inputModalities = model.architecture?.input_modalities || []

  return inputModalities.some((modality) =>
    ["image", "video"].includes(modality.toLowerCase())
  )
}

function hasAudio(model: OpenRouterModel): boolean {
  const inputModalities = model.architecture?.input_modalities || []
  const outputModalities = model.architecture?.output_modalities || []

  return [...inputModalities, ...outputModalities].some((modality) =>
    ["audio", "speech"].includes(modality.toLowerCase())
  )
}

function hasTools(model: OpenRouterModel): boolean {
  const parameters = model.supported_parameters || []

  return parameters.some((parameter) =>
    [
      "tools",
      "tool_choice",
      "structured_outputs",
      "response_format",
    ].includes(parameter)
  )
}

function hasReasoning(model: OpenRouterModel): boolean {
  const parameters = model.supported_parameters || []

  return parameters.some((parameter) =>
    [
      "reasoning",
      "reasoning_effort",
      "include_reasoning",
    ].includes(parameter)
  )
}

function hasWebSearch(model: OpenRouterModel): boolean {
  const parameters = model.supported_parameters || []

  return parameters.some((parameter) =>
    ["web_search", "web_search_options"].includes(parameter)
  )
}

function isFreeModel(model: OpenRouterModel): boolean {
  const prompt = Number(model.pricing?.prompt || 0)
  const completion = Number(model.pricing?.completion || 0)

  return prompt === 0 && completion === 0
}

function getSpeed(
  model: OpenRouterModel
): ModelConfig["speed"] {
  const name = (model.name || "").toLowerCase()

  if (
    name.includes("mini") ||
    name.includes("flash") ||
    name.includes("nano") ||
    name.includes("small") ||
    name.includes("lite")
  ) {
    return "Fast"
  }

  if (
    name.includes("pro") ||
    name.includes("large") ||
    name.includes("reason")
  ) {
    return "Medium"
  }

  return undefined
}

function getIntelligence(
  model: OpenRouterModel
): ModelConfig["intelligence"] {
  const name = (model.name || "").toLowerCase()

  if (
    name.includes("nano") ||
    name.includes("mini") ||
    name.includes("small") ||
    name.includes("lite")
  ) {
    return "Medium"
  }

  if (
    name.includes("pro") ||
    name.includes("reasoning") ||
    name.includes("opus") ||
    name.includes("sonnet")
  ) {
    return "High"
  }

  return undefined
}

function normalizeOpenRouterModel(
  model: OpenRouterModel
): ModelConfig | null {
  if (!model.id) {
    return null
  }

  if (!hasTextOutput(model)) {
    return null
  }

  const rawId = model.id
  const providerId = "openrouter"
  const baseProviderId = getBaseProviderId(rawId)

  const inputCost = parsePrice(model.pricing?.prompt)
  const outputCost = parsePrice(model.pricing?.completion)

  const supportedParameters = model.supported_parameters || []

  const capabilities: string[] = []

  if (hasVision(model)) capabilities.push("vision")
  if (hasTools(model)) capabilities.push("tools")
  if (hasReasoning(model)) capabilities.push("reasoning")
  if (hasWebSearch(model)) capabilities.push("webSearch")
  if (hasAudio(model)) capabilities.push("audio")

  if (supportedParameters.includes("structured_outputs")) {
    capabilities.push("structuredOutputs")
  }

  if (supportedParameters.includes("response_format")) {
    capabilities.push("responseFormat")
  }

  return {
    id: `openrouter:${rawId}`,
    rawId,
    name: model.name || rawId,
    provider: "OpenRouter",
    providerId,
    modelFamily: getModelFamily(rawId, model.name),
    baseProviderId,

    description: model.description,

    tags: capabilities,

    contextWindow:
      model.context_length ?? model.top_provider?.context_length,

    inputCost,
    outputCost,
    priceUnit: "per 1M tokens",

    vision: hasVision(model),
    tools: hasTools(model),
    audio: hasAudio(model),
    reasoning: hasReasoning(model),
    webSearch: hasWebSearch(model),

    openSource:
      model.hugging_face_id != null ||
      rawId.toLowerCase().includes("llama") ||
      rawId.toLowerCase().includes("qwen") ||
      rawId.toLowerCase().includes("mistral") ||
      rawId.toLowerCase().includes("deepseek"),

    speed: getSpeed(model),
    intelligence: getIntelligence(model),

    website: "https://openrouter.ai",
    apiDocs: "https://openrouter.ai/docs",
    modelPage: `https://openrouter.ai/${rawId}`,

    releasedAt: model.created
      ? new Date(model.created * 1000).toISOString()
      : undefined,

    icon: getIcon(rawId, model.name),

    accessible: false,

    modality: model.architecture?.modality,

    isFree: isFreeModel(model),

    availability: "available",

    source: "discovered",

    providerMeta: {
      canonicalSlug: model.canonical_slug,
      huggingFaceId: model.hugging_face_id,
      supportedParameters,
      architecture: model.architecture,
      pricing: model.pricing,
      topProvider: model.top_provider,
    },

    updatedAt: new Date().toISOString(),
  }
}

export async function discoverOpenRouterModels(
  forceRefresh = false
): Promise<ModelConfig[]> {
  const now = Date.now()

  if (
    !forceRefresh &&
    openRouterModelsCache &&
    now - openRouterLastFetchTime < DISCOVERY_CACHE_DURATION
  ) {
    return openRouterModelsCache
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(
      `OpenRouter model discovery failed: ${response.status} ${response.statusText}`
    )
  }

  const payload = (await response.json()) as OpenRouterModelsResponse

  if (!Array.isArray(payload.data)) {
    throw new Error("OpenRouter model discovery returned an invalid response")
  }

  const models = payload.data
    .map(normalizeOpenRouterModel)
    .filter((model): model is ModelConfig => model !== null)

  openRouterModelsCache = models
  openRouterLastFetchTime = now

  return models
}

export function refreshOpenRouterModelsCache(): void {
  openRouterModelsCache = null
  openRouterLastFetchTime = 0
}