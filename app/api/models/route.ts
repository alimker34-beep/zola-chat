import {
  getAllModels,
  getModelsWithAccessFlags,
  refreshModelsCache,
} from "@/lib/models"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      const models = await getModelsWithAccessFlags({
        isAuthenticated: false,
        userProviders: [],
      })

      return NextResponse.json({ models })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      const models = await getModelsWithAccessFlags({
        isAuthenticated: false,
        userProviders: [],
      })

      return NextResponse.json({ models })
    }

    const { data, error } = await supabase
      .from("user_keys")
      .select("provider")
      .eq("user_id", user.id)

    if (error) {
      console.error("Error fetching user keys:", error)

      const models = await getModelsWithAccessFlags({
        isAuthenticated: true,
        userProviders: [],
      })

      return NextResponse.json({ models })
    }

    const userProviders = data?.map((item) => item.provider) ?? []

    const models = await getModelsWithAccessFlags({
      isAuthenticated: true,
      userProviders,
    })

    return NextResponse.json({ models })
  } catch (error) {
    console.error("Error fetching models:", error)

    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    refreshModelsCache()

    const models = await getAllModels()

    return NextResponse.json({
      message: "Models cache refreshed",
      models,
      timestamp: new Date().toISOString(),
      count: models.length,
    })
  } catch (error) {
    console.error("Failed to refresh models:", error)

    return NextResponse.json(
      { error: "Failed to refresh models" },
      { status: 500 }
    )
  }
}