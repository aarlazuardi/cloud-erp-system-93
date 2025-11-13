import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId, type Collection } from "mongodb";

import clientPromise from "../mongodb";
import {
  AUTH_COOKIE_NAME,
  SESSION_REFRESH_THRESHOLD_SECONDS,
  SESSION_TTL_SECONDS,
} from "./constants";

const DEFAULT_DB_NAME = process.env.MONGODB_DB ?? "cloud-erp";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AuthenticatedUser = {
  userId: ObjectId;
  username: string;
  role?: string | null;
};

type SessionDocument = {
  _id?: ObjectId;
  token: string;
  userId: ObjectId;
  username: string;
  role?: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type ActiveSession = {
  token: string;
  userId: ObjectId;
  username: string;
  role?: string | null;
  expiresAt: Date;
};

async function getSessionCollection(): Promise<Collection<SessionDocument>> {
  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  return db.collection<SessionDocument>("sessions");
}

export async function createSessionForUser(user: {
  _id: ObjectId;
  username: string;
  role?: string | null;
}): Promise<ActiveSession> {
  const sessions = await getSessionCollection();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const token = randomUUID();

  await sessions.deleteMany({ expiresAt: { $lt: now } });
  await sessions.insertOne({
    token,
    userId: user._id,
    username: user.username,
    role: user.role ?? null,
    createdAt: now,
    expiresAt,
  });

  return {
    token,
    userId: user._id,
    username: user.username,
    role: user.role ?? null,
    expiresAt,
  };
}

export async function getSessionByToken(
  token: string
): Promise<ActiveSession | null> {
  const sessions = await getSessionCollection();
  const doc = await sessions.findOne({ token });
  if (!doc) {
    return null;
  }

  const now = new Date();
  let expiresAt =
    doc.expiresAt instanceof Date ? doc.expiresAt : new Date(doc.expiresAt);

  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime()
  ) {
    await sessions.deleteOne({ token });
    return null;
  }

  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs < SESSION_REFRESH_THRESHOLD_SECONDS * 1000) {
    const extendedExpiry = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
    await sessions.updateOne(
      { token },
      { $set: { expiresAt: extendedExpiry } }
    );
    expiresAt = extendedExpiry;
  }

  return {
    token: doc.token,
    userId: doc.userId,
    username: doc.username,
    role: doc.role ?? null,
    expiresAt,
  };
}

export async function deleteSession(token: string): Promise<void> {
  const sessions = await getSessionCollection();
  await sessions.deleteOne({ token });
}

export async function getSessionFromCookies(): Promise<ActiveSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return getSessionByToken(token);
}

export async function requireSession(): Promise<ActiveSession> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await requireSession();
  return {
    userId: session.userId,
    username: session.username,
    role: session.role ?? null,
  };
}
