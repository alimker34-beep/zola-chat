import { saveFinalAssistantMessage } from "@/app/api/chat/db"
import type {
  ChatApiParams,
  LogUserMessageParams,
  StoreAssistantMessageParams,
  SupabaseClientType,
} from "@/app/types/api.types"
import {
  getAllModels,
} from "@/lib/models"
import {
  resolveModelAccess,
  type ModelAccessResult,
} from "@/lib/models/access"
import { parseModelReference } from "@/lib/openproviders"
import { sanitizeUserInput } from "@/lib/sanitize"
import { validateUserIdentity } from "@/lib/server/api"
import {
  checkUsageByModel,
  incrementUsageByModel,
} from "@/lib/usage"
import {
  resolveApiKey,
  type ProviderWithoutOllama,
} from "@/lib/user-keys"

export type ValidatedChatAccess = {
  supabase: SupabaseClientType | null
  access: ModelAccessResult
  apiKey?: string
}

export async function validateAndTrackUsage({
  userId,
  model,
  isAuthenticated,
}: ChatApiParams): Promise<ValidatedChatAccess> {
  const supabase = await validateUserIdentity(
    userId,
    isAuthenticated
  )

  const allModels = await getAllModels()

  const modelConfig = allModels.find(
    candidate => candidate.id === model
  )

  if (!modelConfig) {
    throw new Error(`Unknown model: ${model}`)
  }

  const { providerId } =
    parseModelReference(model)

  let apiKey: string | undefined
  let hasByokKey = false
  let hasPlatformKey = false

  if (providerId !== "ollama") {
    const keyResolution =
      await resolveApiKey(
        userId,
        providerId as ProviderWithoutOllama
      )

    apiKey =
      keyResolution.key ?? undefined

    hasByokKey =
      keyResolution.source === "byok"

    hasPlatformKey =
      keyResolution.source === "platform"
  }

  const access =
    resolveModelAccess({
      model: modelConfig,
      isAuthenticated,
      hasByokKey,
      hasPlatformKey,
    })

  if (!access.allowed) {
    switch (access.reason) {
      case "platform_model_not_allowed":
        throw new Error(
          "This model is not available without your own provider API key."
        )

      case "authentication_required":
        throw new Error(
          "This model requires authentication."
        )

      case "api_key_required":
        throw new Error(
          `No API key is configured for ${providerId}. Please add your own API key or use a platform-enabled model.`
        )

      case "platform_disabled":
        throw new Error(
          "Platform access is currently unavailable for this model."
        )

      default:
        throw new Error(
          "You do not have access to this model."
        )
    }
  }

  if (supabase) {
    await checkUsageByModel(
      supabase,
      userId,
      model,
      isAuthenticated,
      access.source
    )
  }

  return {
    supabase,
    access,
    apiKey,
  }
}

export async function incrementMessageCount({
  supabase,
  userId,
  model,
  isAuthenticated,
  source,
}: {
  supabase: SupabaseClientType
  userId: string
  model: string
  isAuthenticated: boolean
  source: "byok" | "platform" | "ollama" | "none"
}): Promise<void> {
  if (!supabase) return

  if (source === "none") {
    return
  }

  try {
    await incrementUsageByModel(
      supabase,
      userId,
      model,
      isAuthenticated,
      source
    )
  } catch (err) {
    console.error(
      "Failed to increment message count:",
      err
    )
  }
}

export async function logUserMessage({
  supabase,
  userId,
  chatId,
  content,
  attachments,
  model,
  isAuthenticated,
  message_group_id,
}: LogUserMessageParams): Promise<void> {
  if (!supabase) return

  const { error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      role: "user",
      content: sanitizeUserInput(content),
      experimental_attachments: attachments,
      user_id: userId,
      message_group_id,
    })

  if (error) {
    console.error(
      "Error saving user message:",
      error
    )
  }
}

export async function storeAssistantMessage({
  supabase,
  chatId,
  messages,
  message_group_id,
  model,
}: StoreAssistantMessageParams): Promise<void> {
  if (!supabase) return

  try {
    await saveFinalAssistantMessage(
      supabase,
      chatId,
      messages,
      message_group_id,
      model
    )
  } catch (err) {
    console.error(
      "Failed to save assistant messages:",
      err
    )
  }
}