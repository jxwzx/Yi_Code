export type PageKey = 'dashboard' | 'editor' | 'ai' | 'flowchart' | 'collab' | 'learn' | 'classroom' | 'envcheck' | 'admin'
export type LangKey = 'py' | 'js' | 'cpp' | 'java' | 'go' | 'cs'

export interface CurrentUser {
  user_id: number
  username: string
  avatar: string
  level: number
  xp: number
  streak_days: number
  role: string
  target_id: string | null
  token?: string
}

export interface Exercise {
  id: number
  title: string
  description: string
  difficulty: string
  language: string
  starter_code: string | null
  solution: string | null
  accept_rate: number
  tags: string | null
  course_id: number | null
}

export interface AIMessage {
  role: 'assistant' | 'user'
  text: string
  issues?: Array<{ type: 'error' | 'warning' | 'info'; title: string; body: string; fix?: string }>
}

export interface ChatMessage {
  id: string
  author: string
  avatar: string
  text: string
  time: string
  self?: boolean
}
