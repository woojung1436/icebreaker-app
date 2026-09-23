import { io, Socket } from "socket.io-client";

const SERVER_PORT = 4000;

function resolveServerUrl(): string {
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (envUrl) return envUrl;
  return `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveServerUrl());
  }
  return socket;
}
