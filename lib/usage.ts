import { UsageLimitError } from "@/lib/api"
import {
  getPlatformDailyLimit,
  type ModelAccessSource,
} from "@/lib/models/access"
import { SupabaseClient } from "@supabase/supabase-js"

function getDailyLimit(
  source: ModelAccessSource,
  isAuthenticated: boolean
): number | null {
  if (source === "platform") {
    return getPlatformDailyLimit(isAuthenticated)
  }

  return null
}

export async function checkUsage(
  supabase: SupabaseClient,
  userId: string,
  source: ModelAccessSource = "platform",
  isAuthenticated = true
) {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select(
      "message_count, daily_message_count, daily_reset, anonymous, premium"
    )
    .eq("id", userId)
    .maybeSingle()

  if (userDataError) {
    throw new Error(
      "Error fetching user data: " + userDataError.message
    )
  }

  if (!userData) {
    throw new Error("User record not found for id: " + userId)
  }

  const dailyLimit = getDailyLimit(
    source,
    isAuthenticated
  )

  if (dailyLimit === null) {
    return {
      userData,
      dailyCount: userData.daily_message_count || 0,
      dailyLimit: null,
    }
  }

  const now = new Date()

  let dailyCount =
    userData.daily_message_count || 0

  const lastReset = userData.daily_reset
    ? new Date(userData.daily_reset)
    : null

  const isNewDay =
    !lastReset ||
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCDate() !== lastReset.getUTCDate()

  if (isNewDay) {
    dailyCount = 0

    const { error: resetError } = await supabase
      .from("users")
      .update({
        daily_message_count: 0,
        daily_reset: now.toISOString(),
      })
      .eq("id", userId)

    if (resetError) {
      throw new Error(
        "Failed to reset daily count: " +
          resetError.message
      )
    }
  }

  if (dailyCount >= dailyLimit) {
    throw new UsageLimitError(
      "Daily platform message limit reached."
    )
  }

  return {
    userData,
    dailyCount,
    dailyLimit,
  }
}

export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string,
  source: ModelAccessSource = "platform"
): Promise<void> {
  const { data: userData, error: userDataError } =
    await supabase
      .from("users")
      .select(
        "message_count, daily_message_count"
      )
      .eq("id", userId)
      .maybeSingle()

  if (userDataError || !userData) {
    throw new Error(
      "Error fetching user data: " +
        (userDataError?.message ||
          "User not found")
    )
  }

  const messageCount =
    userData.message_count || 0

  const dailyCount =
    userData.daily_message_count || 0

  const updateData: {
    message_count: number
    daily_message_count?: number
    last_active_at: string
  } = {
    message_count: messageCount + 1,
    last_active_at: new Date().toISOString(),
  }

  if (source === "platform") {
    updateData.daily_message_count =
      dailyCount + 1
  }

  const { error: updateError } =
    await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId)

  if (updateError) {
    throw new Error(
      "Failed to update usage data: " +
        updateError.message
    )
  }
}

export async function checkUsageByModel(
  supabase: SupabaseClient,
  userId: string,
  modelId: string,
  isAuthenticated: boolean,
  source: ModelAccessSource = "platform"
) {
  void modelId

  return checkUsage(
    supabase,
    userId,
    source,
    isAuthenticated
  )
}

export async function incrementUsageByModel(
  supabase: SupabaseClient,
  userId: string,
  modelId: string,
  isAuthenticated: boolean,
  source: ModelAccessSource = "platform"
) {
  void modelId
  void isAuthenticated

  return incrementUsage(
    supabase,
    userId,
    source
  )
}