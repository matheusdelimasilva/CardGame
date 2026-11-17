import { randomBytes } from "node:crypto";
import {
  CHAT_RATE_LIMIT,
  CHAT_WINDOW_MS,
  MAX_CHAT_LENGTH,
  type ChatMessage,
} from "@cardgame/protocol";
import type { Member, Room } from "./model";

/** Send times of each member's recent chat messages. Kept off Member so it is never saved with the room. */
const recentChats = new WeakMap<Member, number[]>();

const newId = () => randomBytes(6).toString("hex");

/** A line from the table rather than a person, e.g. announcing a correct guess. */
export function systemMessage(text: string, now = Date.now()): ChatMessage {
  return {
    id: newId(),
    kind: "system",
    from: { id: "", name: "" },
    text,
    at: now,
  };
}

/** Validates one chat line from a current, named member and stamps it. Nothing is stored. */
export function chat(
  room: Room,
  member: Member,
  raw: unknown,
  now = Date.now(),
): { message: ChatMessage } | { error: string } {
  if (!room.members.includes(member))
    return { error: "You are not in this room." };
  if (!member.name) return { error: "Choose a name first." };
  if (typeof raw !== "string") return { error: "Say something first." };
  const text = raw.trim();
  if (!text) return { error: "Say something first." };
  if (text.length > MAX_CHAT_LENGTH)
    return {
      error: `Messages can be at most ${MAX_CHAT_LENGTH} characters.`,
    };
  const recent = (recentChats.get(member) ?? []).filter(
    (t) => now - t < CHAT_WINDOW_MS,
  );
  recentChats.set(member, recent);
  if (recent.length >= CHAT_RATE_LIMIT)
    return { error: "You are sending messages too fast. Wait a moment." };
  recent.push(now);
  return {
    message: {
      id: newId(),
      from: { id: member.id, name: member.name },
      text,
      at: now,
    },
  };
}
