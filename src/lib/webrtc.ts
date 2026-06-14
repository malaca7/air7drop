// WebRTC P2P file transfer with chunked DataChannel + Realtime signaling.
// No file data ever touches the server.

import { supabase } from "@/integrations/supabase/client";

export const CHUNK_SIZE = 64 * 1024; // 64KB
export const BUFFER_HIGH = 16 * 1024 * 1024; // 16MB high watermark
export const BUFFER_LOW = 1 * 1024 * 1024; // 1MB

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type SignalingMessage =
  | { type: "hello"; role: "sender" | "receiver"; device?: string }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "ready" }
  | { type: "bye" };

export function createSignalingChannel(code: string) {
  const channel = supabase.channel(`flashdrop:${code}`, {
    config: { broadcast: { self: false, ack: true } },
  });
  return channel;
}

export interface FileMeta {
  id: string;
  name: string;
  type: string;
  size: number;
}

export type ControlMessage =
  | { type: "manifest"; files: FileMeta[]; totalSize: number }
  | { type: "accept" }
  | { type: "reject"; reason?: string }
  | { type: "file-start"; id: string }
  | { type: "file-end"; id: string }
  | { type: "all-done" }
  | { type: "cancel" }
  | { type: "ping"; t: number };

export function makePeer(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}
