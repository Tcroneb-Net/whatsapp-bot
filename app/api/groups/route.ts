import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { connectDb, groups } from "@/engine/src/db"
import { ObjectId } from "mongodb"
import type { GroupDoc } from "@/engine/src/db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDb()
    const groupsList = await groups()
      .find({ number: session.number })
      .sort({ updatedAt: -1 })
      .toArray()

    return NextResponse.json({ groups: groupsList })
  } catch (error) {
    console.error("[v0] Groups API error:", error)
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { groupId, status, autoClose, autoPoll, antiLink } = body

    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 })
    }

    await connectDb()

    const existing = await groups().findOne({
      groupId,
      number: session.number,
    })

    if (existing) {
      const result = await groups().updateOne(
        { groupId, number: session.number },
        {
          $set: {
            status,
            autoClose,
            autoPoll,
            antiLink,
            updatedAt: new Date(),
          },
        },
      )

      return NextResponse.json({
        success: true,
        message: "Group settings updated",
        id: existing._id,
      })
    } else {
      const newGroup: GroupDoc = {
        groupId,
        number: session.number,
        status,
        autoClose,
        autoPoll,
        antiLink,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const result = await groups().insertOne(newGroup)

      return NextResponse.json({
        success: true,
        message: "Group settings saved",
        id: result.insertedId,
      })
    }
  } catch (error) {
    console.error("[v0] Groups POST error:", error)
    return NextResponse.json({ error: "Failed to save group settings" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 })
    }

    await connectDb()
    const result = await groups().deleteOne({
      _id: new ObjectId(id),
      number: session.number,
    })

    if (!result.deletedCount) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Groups DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
