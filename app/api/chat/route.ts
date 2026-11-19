import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import {
  openproviders,
  parseModelReference,
} from "@/lib/openproviders"
import type { ProviderWithoutOllama } from "@/lib/user-keys"
import { Attachment } from "@ai-sdk/ui-utils"
import { Message as MessageAISDK, streamText, ToolSet } from "ai"
import {
  incrementMessageCount,
  logUserMessage,
  storeAssistantMessage,
  validateAndTrackUsage,
} from "./api"
import { createErrorResponse, extractErrorMessage } from "./utils"

export const maxDuration = 60

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: string
  isAuthenticated: boolean
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
  editCutoffTimestamp?: string
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      chatId,
      userId,
      model,
      isAuthenticated,
      systemPrompt,
      enableSearch,
      message_group_id,
      editCutoffTimestamp,
    } = (await req.json()) as ChatRequest

    if (!messages || !chatId || !userId) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    const supabase = await validateAndTrackUsage({
      userId,
      model,
      isAuthenticated,
    })

    // Increment message count for successful validation
    if (supabase) {
      await incrementMessageCount({ supabase, userId })
    }

    const userMessage = messages[messages.length - 1]

    // If editing, delete messages from cutoff BEFORE saving the new user message
    if (supabase && editCutoffTimestamp) {
      try {
        await supabase
          .from("messages")
          .delete()
          .eq("chat_id", chatId)
          .gte("created_at", editCutoffTimestamp)
      } catch (err) {
        console.error("Failed to delete messages from cutoff:", err)
      }
    }

    if (supabase && userMessage?.role === "user") {
      await logUserMessage({
        supabase,
        userId,
        chatId,
        content: userMessage.content,
        attachments: userMessage.experimental_attachments as Attachment[],
        model,
        isAuthenticated,
        message_group_id,
      })
    }

    const effectiveSystemPrompt = systemPrompt || SYSTEM_PROMPT_DEFAULT

    const { providerId } = parseModelReference(model)

    let apiKey: string | undefined

    if (isAuthenticated && userId) {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")

      if (providerId !== "ollama") {
        apiKey =
          (await getEffectiveApiKey(userId, providerId as ProviderWithoutOllama)) ||
          undefined
      }
    }

    console.log("========== ZOLA MODEL DEBUG ==========")
    console.log("model:", model)
    console.log("provider:", providerId)
    console.log("hasApiKey:", !!apiKey)
    console.log("envOpenRouter:", !!process.env.OPENROUTER_API_KEY)
    console.log("======================================")

    const languageModel = openproviders(
      model,
      {
        enableSearch,
      },
      apiKey
    )

    const result = streamText({
      model: languageModel,
      system: effectiveSystemPrompt,
      messages: messages,
      tools: {} as ToolSet,
      maxSteps: 10,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
        // Don't set streamError anymore - let the AI SDK handle it through the stream
      },

      onFinish: async ({ response }) => {
        if (supabase) {
          await storeAssistantMessage({
            supabase,
            chatId,
            messages:
              response.messages as unknown as import("@/app/types/api.types").Message[],
            message_group_id,
            model,
          })
        }
      },
    })

    return result.toDataStreamResponse({
      sendReasoning: true,
      sendSources: true,
      getErrorMessage: (error: unknown) => {
        console.error("Error forwarded to client:", error)
        return extractErrorMessage(error)
      },
    })
  } catch (err: unknown) {
    console.error("Error in /api/chat:", err)
    const error = err as {
      code?: string
      message?: string
      statusCode?: number
    }

    return createErrorResponse(error)
  }
}