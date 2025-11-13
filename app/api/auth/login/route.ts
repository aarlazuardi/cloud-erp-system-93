import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

import { createSessionForUser } from "@/lib/auth";
import { AUTH_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/constants";
import clientPromise from "@/lib/mongodb";

const DEFAULT_DB_NAME = process.env.MONGODB_DB ?? "cloud-erp";
const DEFAULT_ADMIN_USERNAME =
  process.env.DEFAULT_ADMIN_USERNAME?.trim() || "admin";
const DEFAULT_ADMIN_PASSWORD =
  process.env.DEFAULT_ADMIN_PASSWORD?.trim() || "admin123";
const DEFAULT_ADMIN_ROLE = process.env.DEFAULT_ADMIN_ROLE?.trim() || "admin";

interface UserDocument {
  _id?: ObjectId;
  username?: string;
  passwordHash?: string;
  role?: string | null;
}

export async function POST(request: Request) {
  try {
    const { username, password } = (await request.json()) as {
      username?: unknown;
      password?: unknown;
    };

    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(DEFAULT_DB_NAME);
    const users = db.collection<UserDocument>("users");

    let user = await users.findOne({ username });

    if (!user && username === DEFAULT_ADMIN_USERNAME) {
      if (password !== DEFAULT_ADMIN_PASSWORD) {
        return NextResponse.json(
          { error: "Username atau password salah." },
          { status: 401 }
        );
      }

      const timestamp = new Date();
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      const upserted = await users.findOneAndUpdate(
        { username: DEFAULT_ADMIN_USERNAME },
        {
          $set: {
            username: DEFAULT_ADMIN_USERNAME,
            passwordHash,
            role: DEFAULT_ADMIN_ROLE,
            updatedAt: timestamp,
          },
          $setOnInsert: {
            createdAt: timestamp,
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      user = upserted.value ?? (await users.findOne({ username }));
    }

    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    if (!user._id) {
      return NextResponse.json(
        { error: "User profile is incomplete." },
        { status: 500 }
      );
    }

    const session = await createSessionForUser({
      _id: user._id,
      username: user.username,
      role: user.role ?? null,
    });

    const response = NextResponse.json({ message: "Login berhasil." });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Login API error", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat login." },
      { status: 500 }
    );
  }
}
