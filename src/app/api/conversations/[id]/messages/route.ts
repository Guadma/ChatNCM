import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: 'asc' }
    })
    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { content } = await request.json()

    // 1. Get the conversation and contact phone number
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { contact: true }
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const recipientPhone = conversation.contact.phoneNumber

    // 2. Call WhatsApp Cloud API to send the message
    const whatsappToken = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    let waMessageId: string | null = null

    if (whatsappToken && phoneNumberId) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${whatsappToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: recipientPhone,
              type: 'text',
              text: {
                preview_url: false,
                body: content
              }
            })
          }
        )

        const data = await response.json()
        if (response.ok) {
          waMessageId = data.messages?.[0]?.id || null
        } else {
          console.error('WhatsApp API error details:', data)
        }
      } catch (err) {
        console.error('Error sending via WhatsApp API:', err)
      }
    } else {
      console.warn('WhatsApp credentials not set, saving message locally only.')
    }

    // 3. Save the outgoing message in the database
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        content,
        direction: 'outgoing',
        status: waMessageId ? 'sent' : 'failed',
        waMessageId
      }
    })

    // 4. Update the conversation's updatedAt timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() }
    })

    return NextResponse.json(message)
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
