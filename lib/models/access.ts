import type { ModelConfig } from "./types"

export type PlatformAccessAudience =
  | "all"
  | "authenticated"
  | "guest"
  | "disabled"

export const PLATFORM_ACCESS = {
  enabled: true,

  // Who may use the platform API key?
  audience: "all" as PlatformAccessAudience,

  // IMPORTANT:
  // Only models explicitly listed here may consume the platform key.
  modelIds: [
    "openrouter:google/gemini-2.5-flash",
  ],

  // Platform-funded usage limits.
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

  if (PLATFORM_ACCESS.audience === "disabled") {
    return false
  }

  if (
    PLATFORM_ACCESS.audience === "authenticated" &&
    !isAuthenticated
  ) {
    return false
  }

  if (PLATFORM_ACCESS.audience === "guest" && isAuthenticated) {
    return false
  }

  return true
}

export function getPlatformDailyLimit(
  isAuthenticated: boolean
): number {
  return isAuthenticated
    ? PLATFORM_ACCESS.authenticatedDailyLimit
    : PLATFORM_ACCESS.guestDailyLimit
}