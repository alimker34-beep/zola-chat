import { decryptKey } from "./encryption"
import { env } from "./openproviders/env"
import type { ProviderId } from "./openproviders"
import { createClient } from "./supabase/server"

export type Provider = ProviderId
export type ProviderWithoutOllama = Exclude<ProviderId, "ollama">

export type ApiKeySource = "byok" | "platform"

export type ApiKeyResolution = {
  key: string | null
  source: ApiKeySource | null
}

const PLATFORM_API_KEYS: Record<
  ProviderWithoutOllama,
  string | undefined
> = {
  openai: env.OPENAI_API_KEY,
  mistral: env.MISTRAL_API_KEY,
  perplexity: env.PERPLEXITY_API_KEY,
  google: env.GOOGLE_GENERATIVE_AI_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  xai: env.XAI_API_KEY,
  openrouter: env.OPENROUTER_API_KEY,
}

export async function getUserKey(
  userId: string,
  provider: ProviderId
): Promise<string | null> {
  try {
    if (provider === "ollama") {
      return null
    }

    const supabase = await createClient()

    if (!supabase) {
      return null
    }

    const { data, error } = await supabase
      .from("user_keys")
      .select("encrypted_key, iv")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return decryptKey(data.encrypted_key, data.iv)
  } catch (error) {
    console.error("Error retrieving user key:", error)
    return null
  }
}

export function getPlatformApiKey(
  provider: ProviderWithoutOllama
): string | null {
  return PLATFORM_API_KEYS[provider] ?? null
}

export async function resolveApiKey(
  userId: string | null,
  provider: ProviderWithoutOllama
): Promise<ApiKeyResolution> {
  if (userId) {
    const userKey = await getUserKey(userId, provider)

    if (userKey) {
      return {
        key: userKey,
        source: "byok",
      }
    }
  }

  const platformKey = getPlatformApiKey(provider)

  if (platformKey) {
    return {
      key: platformKey,
      source: "platform",
    }
  }

  return {
    key: null,
    source: null,
  }
}

export async function getEffectiveApiKey(
  userId: string | null,
  provider: ProviderWithoutOllama
): Promise<string | null> {
  const resolution = await resolveApiKey(userId, provider)

  return resolution.key
}