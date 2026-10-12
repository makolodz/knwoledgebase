import type { ClientToServerEvents, ServerToClientEvents } from '@encheres/shared'
import { io, type Socket } from 'socket.io-client'
import { env } from '../env'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * Instance unique de Socket.IO pour toute l'application (docs/technical/frontend.md).
 * Elle ne se connecte pas à l'import : `main.ts` appelle `connect()`.
 */
export const socket: AppSocket = io(env.VITE_API_URL, {
  withCredentials: true,
  autoConnect: false,
})
