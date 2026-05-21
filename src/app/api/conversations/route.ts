import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      include: {
        contact: true,
        messages: {
          orderBy: {
            timestamp: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })
    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
