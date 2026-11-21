import type { ModelConfig } from "./types"

export type PlatformAccessAudience =
  | "all"
  | "authenticated"
  | "guest"
  | "disabled"

export type ModelAccessSource =
  | "byok"
  | "platform"
  | "ollama"
  | "none"

export type ModelAccessReason =
  | "byok"
  | "platform"
  | "ollama"
  | "platform_disabled"
  | "platform_model_not_allowed"
  | "authentication_required"
  | "api_key_required"

export type ModelAccessResult = {
  allowed: boolean
  source: ModelAccessSource
  reason: ModelAccessReason
}

export const PLATFORM_ACCESS = {
  enabled: true,

  audience: "all" as PlatformAccessAudience,

  modelIds: [
    "openrouter:nvidia/nemotron-3-ultra:free",
  ],

  guestDailyLimit: 5,
  authenticatedDailyLimit: 1000,
}

export function isPlatformModel(modelId: string): boolean {
  return (
    PLATFORM_ACCESS.enabled &&
    PLATFORM_ACCESS.modelIds.includes(modelId)
  )
}

export function canUsePlatformAccess(
  model: ModelConfig,
  isAuthenticated: boolean
): boolean {
  if (!PLATFORM_ACCESS.enabled) {
    return false
  }

  if (!PLATFORM_ACCESS.modelIds.includes(model.id)) {
    return false
  }

  switch (PLATFORM_ACCESS.audience) {
    case "all":
      return true

    case "authenticated":
      return isAuthenticated

    case "guest":
      return !isAuthenticated

    case "disabled":
      return false

    default:
      return false
  }
}

export function getPlatformDailyLimit(
  isAuthenticated: boolean
): number {
  return isAuthenticated
    ? PLATFORM_ACCESS.authenticatedDailyLimit
    : PLATFORM_ACCESS.guestDailyLimit
}

export function resolveModelAccess({
  model,
  isAuthenticated,
  hasByokKey,
  hasPlatformKey,
}: {
  model: ModelConfig
  isAuthenticated: boolean
  hasByokKey: boolean
  hasPlatformKey: boolean
}): ModelAccessResult {
  if (model.providerId === "ollama") {
    return {
      allowed: true,
      source: "ollama",
      reason: "ollama",
    }
  }

  if (hasByokKey) {
    return {
      allowed: true,
      source: "byok",
      reason: "byok",
    }
  }

  if (!isPlatformModel(model.id)) {
    return {
      allowed: false,
      source: "none",
      reason: "platform_model_not_allowed",
    }
  }

  if (!canUsePlatformAccess(model, isAuthenticated)) {
    return {
      allowed: false,
      source: "none",
      reason:
        PLATFORM_ACCESS.audience === "disabled"
          ? "platform_disabled"
          : PLATFORM_ACCESS.audience === "authenticated" &&
              !isAuthenticated
            ? "authentication_required"
            : "platform_disabled",
    }
  }

  if (!hasPlatformKey) {
    return {
      allowed: false,
      source: "none",
      reason: "api_key_required",
    }
  }

  return {
    allowed: true,
    source: "platform",
    reason: "platform",
  }
}