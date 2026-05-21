'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import './dashboard.css'

interface Contact {
  id: string
  phoneNumber: string
  name: string | null
}

interface Conversation {
  id: string
  contactId: string
  status: string
  updatedAt: string
  contact: Contact
  messages: Message[]
  _count?: { messages: number }
}

interface Message {
  id: string
  conversationId: string
  content: string | null
  mediaUrl: string | null
  mediaType: string | null
  direction: string
  status: string
  timestamp: string
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #6366f1, #a78bfa)',
  'linear-gradient(135deg, #f43f5e, #fb7185)',
  'linear-gradient(135deg, #10b981, #34d399)',
  'linear-gradient(135deg, #f59e0b, #fbbf24)',
  'linear-gradient(135deg, #3b82f6, #60a5fa)',
  'linear-gradient(135deg, #8b5cf6, #c084fc)',
  'linear-gradient(135deg, #ec4899, #f472b6)',
  'linear-gradient(135deg, #14b8a6, #2dd4bf)',
]

function getAvatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string | null, phone: string) {
  if (name) {
    const parts = name.split(' ')
    return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.substring(0, 2).toUpperCase()
  }
  return phone.slice(-2)
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function formatMessageTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showContactPanel, setShowContactPanel] = useState(true)
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')

  // Load user
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserEmail(user.email || '')
    }
    getUser()
  }, [supabase])

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (err) {
      console.error('Error loading conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations()
  }, [loadConversations])

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Message' },
        (payload) => {
          const newMsg = payload.new as Message
          // Update messages if we're viewing this conversation
          if (selectedConv && newMsg.conversationId === selectedConv.id) {
            setMessages(prev => [...prev, newMsg])
          }
          // Reload conversations to update preview
          loadConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConv, supabase, loadConversations])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])


  async function selectConversation(conv: Conversation) {
    setSelectedConv(conv)
    try {
      const res = await fetch(`/api/conversations/${conv.id}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedConv) return

    try {
      const res = await fetch(`/api/conversations/${selectedConv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setNewMessage('')
        loadConversations()
      }
    } catch (err) {
      console.error('Error sending message:', err)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const filteredConversations = conversations.filter(conv => {
    if (filter === 'open') return conv.status === 'open'
    if (filter === 'closed') return conv.status === 'closed'
    return true
  }).filter(conv => {
    if (!search) return true
    const name = conv.contact?.name?.toLowerCase() || ''
    const phone = conv.contact?.phoneNumber?.toLowerCase() || ''
    return name.includes(search.toLowerCase()) || phone.includes(search.toLowerCase())
  })

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebarLogo">NC</div>
        <nav className="sidebarNav">
          <button className="sidebarBtn active" title="Conversaciones">
            💬
          </button>
          <button className="sidebarBtn" title="Contactos">
            👥
          </button>
          <button className="sidebarBtn" title="Reportes">
            📊
          </button>
          <button className="sidebarBtn" title="Configuración">
            ⚙️
          </button>
        </nav>
        <div className="sidebarBottom">
          <button className="sidebarBtn" onClick={handleLogout} title="Cerrar sesión">
            🚪
          </button>
          <div className="sidebarAvatar" title={userEmail}>
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
        </div>
      </aside>

      {/* Conversations List */}
      <section className="conversationList">
        <div className="conversationListHeader">
          <div className="conversationListTitle">
            <h2>Conversaciones</h2>
            <button className="newChatBtn" title="Nueva conversación">＋</button>
          </div>
          <div className="searchBox">
            <span className="searchIcon">🔍</span>
            <input
              type="text"
              placeholder="Buscar conversaciones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="conversationFilters">
          <button className={`filterBtn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Todas
          </button>
          <button className={`filterBtn ${filter === 'open' ? 'active' : ''}`} onClick={() => setFilter('open')}>
            Abiertas
          </button>
          <button className={`filterBtn ${filter === 'closed' ? 'active' : ''}`} onClick={() => setFilter('closed')}>
            Cerradas
          </button>
        </div>

        <div className="conversationItems">
          {loading ? (
            <div className="emptyState">
              <p>Cargando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="emptyState" style={{ padding: '3rem 1rem' }}>
              <div className="emptyIcon">💬</div>
              <h3>Sin conversaciones</h3>
              <p>Las conversaciones aparecerán aquí cuando recibas mensajes de WhatsApp.</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const displayName = conv.contact?.name || conv.contact?.phoneNumber || 'Sin nombre'
              const lastMsg = conv.messages?.[0]
              return (
                <div
                  key={conv.id}
                  className={`conversationItem ${selectedConv?.id === conv.id ? 'active' : ''}`}
                  onClick={() => selectConversation(conv)}
                >
                  <div
                    className="conversationAvatar avatarOnline"
                    style={{ background: getAvatarColor(conv.id) }}
                  >
                    {getInitials(conv.contact?.name, conv.contact?.phoneNumber)}
                  </div>
                  <div className="conversationInfo">
                    <div className="conversationTop">
                      <span className="conversationName">{displayName}</span>
                      <span className="conversationTime">
                        {formatTime(conv.updatedAt)}
                      </span>
                    </div>
                    <div className="conversationMeta">
                      <span className="conversationPreview">
                        {lastMsg?.content || (lastMsg?.mediaUrl ? '📎 Archivo adjunto' : 'Sin mensajes')}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Chat Area */}
      {selectedConv ? (
        <>
          <section className="chatArea">
            <div className="chatHeader">
              <div className="chatHeaderLeft">
                <div
                  className="chatHeaderAvatar"
                  style={{ background: getAvatarColor(selectedConv.id) }}
                >
                  {getInitials(selectedConv.contact?.name, selectedConv.contact?.phoneNumber)}
                </div>
                <div className="chatHeaderInfo">
                  <h3>{selectedConv.contact?.name || selectedConv.contact?.phoneNumber}</h3>
                  <p>En línea</p>
                </div>
              </div>
              <div className="chatHeaderActions">
                <button className="chatHeaderBtn" title="Buscar en chat">🔍</button>
                <button
                  className="chatHeaderBtn"
                  title="Info del contacto"
                  onClick={() => setShowContactPanel(!showContactPanel)}
                >
                  ℹ️
                </button>
                <button className="chatHeaderBtn" title="Más opciones">⋯</button>
              </div>
            </div>

            <div className="chatMessages">
              {messages.length === 0 ? (
                <div className="emptyState">
                  <div className="emptyIcon">💬</div>
                  <h3>Sin mensajes</h3>
                  <p>Envía un mensaje para iniciar la conversación.</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`messageRow ${msg.direction}`}>
                    <div>
                      {msg.mediaUrl && msg.mediaType?.startsWith('image/') && (
                        <img src={msg.mediaUrl} alt="Media" className="messageMediaImg" />
                      )}
                      {msg.content && (
                        <div className="messageBubble">{msg.content}</div>
                      )}
                      <div className="messageTime">
                        {formatMessageTime(msg.timestamp)}
                        {msg.direction === 'outgoing' && (
                          <span>{msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chatInput">
              <div className="chatInputRow">
                <div className="chatInputActions">
                  <button className="inputActionBtn" title="Adjuntar archivo">📎</button>
                  <button className="inputActionBtn" title="Emoji">😊</button>
                </div>
                <textarea
                  className="chatInputField"
                  placeholder="Escribe un mensaje..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button className="sendBtn" onClick={sendMessage} title="Enviar">
                  ➤
                </button>
              </div>
            </div>
          </section>

          {/* Contact Panel */}
          {showContactPanel && (
            <aside className="contactPanel">
              <div className="contactPanelHeader">
                <h3>Información del Contacto</h3>
                <button className="closePanelBtn" onClick={() => setShowContactPanel(false)}>✕</button>
              </div>
              <div className="contactProfile">
                <div
                  className="contactProfileAvatar"
                  style={{ background: getAvatarColor(selectedConv.id) }}
                >
                  {getInitials(selectedConv.contact?.name, selectedConv.contact?.phoneNumber)}
                </div>
                <h4>{selectedConv.contact?.name || 'Sin nombre'}</h4>
                <p>{selectedConv.contact?.phoneNumber}</p>
              </div>
              <div className="contactSection">
                <h5>Detalles</h5>
                <div className="contactField">
                  <span className="contactFieldIcon">📱</span>
                  <div className="contactFieldInfo">
                    <span className="contactFieldLabel">Teléfono</span>
                    <span className="contactFieldValue">{selectedConv.contact?.phoneNumber}</span>
                  </div>
                </div>
                <div className="contactField">
                  <span className="contactFieldIcon">📋</span>
                  <div className="contactFieldInfo">
                    <span className="contactFieldLabel">Estado</span>
                    <span className={`statusBadge ${selectedConv.status === 'open' ? 'statusOpen' : 'statusClosed'}`}>
                      ● {selectedConv.status === 'open' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="contactSection">
                <h5>Acciones</h5>
                <button
                  className="chatHeaderBtn"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem', height: 'auto', padding: '0.625rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                >
                  {selectedConv.status === 'open' ? '🔒 Cerrar conversación' : '🔓 Reabrir conversación'}
                </button>
              </div>
            </aside>
          )}
        </>
      ) : (
        <section className="chatArea">
          <div className="emptyState">
            <div className="emptyIcon">💬</div>
            <h3>Bienvenido a NCM Digital</h3>
            <p>Selecciona una conversación de la lista o espera a que lleguen nuevos mensajes de WhatsApp.</p>
          </div>
        </section>
      )}
    </div>
  )
}
