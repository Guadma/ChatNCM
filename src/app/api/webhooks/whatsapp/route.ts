import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully!')
      return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    } else {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }
  return new NextResponse('Bad Request', { status: 400 })
}

// Helper to handle media downloads and upload them to Supabase Storage
async function handleMedia(mediaId: string, mimeType: string): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) return null

  try {
    // 1. Get media URL from Meta API
    const mediaMetaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const mediaMetaData = await mediaMetaRes.json()
    if (!mediaMetaRes.ok || !mediaMetaData.url) {
      console.error('Error fetching media metadata:', mediaMetaData)
      return null
    }

    // 2. Download media binary
    const mediaRes = await fetch(mediaMetaData.url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!mediaRes.ok) {
      console.error('Error downloading media binary')
      return null
    }

    const buffer = Buffer.from(await mediaRes.arrayBuffer())
    
    // 3. Upload to Supabase Storage
    const supabase = createAdminClient()
    const fileExtension = mimeType.split('/')[1]?.split(';')[0] || 'bin'
    const fileName = `${mediaId}.${fileExtension}`
    
    const { error } = await supabase.storage
      .from('chat_media')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true
      })

    if (error) {
      console.error('Error uploading media to Supabase:', error)
      return null
    }

    // 4. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('chat_media')
      .getPublicUrl(fileName)

    return publicUrl
  } catch (err) {
    console.error('Error in handleMedia:', err)
    return null
  }
}

// POST: Handle WhatsApp events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Ensure it's a WhatsApp message event
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value
      
      // Check if we received messages
      if (value?.messages) {
        const messageData = value.messages[0]
        const fromPhone = messageData.from // Recipient's phone number
        const waMessageId = messageData.id
        
        // Find or create Contact
        const profile = value.contacts?.[0]?.profile
        const contactName = profile?.name || 'WhatsApp Contact'

        let contact = await prisma.contact.findUnique({
          where: { phoneNumber: fromPhone }
        })

        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              phoneNumber: fromPhone,
              name: contactName
            }
          })
        }

        // Find or create Conversation
        let conversation = await prisma.conversation.findFirst({
          where: {
            contactId: contact.id,
            status: 'open'
          }
        })

        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              contactId: contact.id,
              status: 'open'
            }
          })
        }

        // Check if message already exists (avoid duplicates)
        const existingMessage = await prisma.message.findUnique({
          where: { waMessageId }
        })

        if (!existingMessage) {
          let content = messageData.text?.body || null
          let mediaUrl: string | null = null
          let mediaType: string | null = null

          const type = messageData.type

          if (type === 'image' && messageData.image) {
            const mime: string = messageData.image.mime_type || 'image/jpeg'
            mediaType = mime
            mediaUrl = await handleMedia(messageData.image.id, mime)
          } else if (type === 'document' && messageData.document) {
            const mime: string = messageData.document.mime_type || 'application/octet-stream'
            mediaType = mime
            mediaUrl = await handleMedia(messageData.document.id, mime)
            content = messageData.document.filename || null
          }

          // Create the message record
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              content,
              mediaUrl,
              mediaType,
              direction: 'incoming',
              status: 'delivered',
              waMessageId
            }
          })

          // Update conversation updatedAt
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() }
          })
        }
      }

      // Check for message status updates (sent, delivered, read)
      if (value?.statuses) {
        const statusData = value.statuses[0]
        const waMessageId = statusData.id
        const newStatus = statusData.status // "sent", "delivered", "read"

        await prisma.message.updateMany({
          where: { waMessageId },
          data: { status: newStatus }
        })
      }

      return NextResponse.json({ status: 'ok' })
    }

    return NextResponse.json({ error: 'Not a WhatsApp Event' }, { status: 400 })
  } catch (error) {
    console.error('Error handling webhook POST:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
