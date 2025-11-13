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
    console.log("🔐 Login attempt started");
    const { username, password } = (await request.json()) as {
      username?: unknown;
      password?: unknown;
    };

    console.log("📝 Received credentials:", { username: username, passwordLength: typeof password === 'string' ? password.length : 'invalid' });

    if (typeof username !== "string" || typeof password !== "string") {
      console.log("❌ Invalid credentials format");
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const normalizedUsername = username.trim();
    console.log("🔍 Normalized username:", normalizedUsername);
    console.log("🔑 Default admin username:", DEFAULT_ADMIN_USERNAME);
    console.log("🔑 Default admin password:", DEFAULT_ADMIN_PASSWORD);

    // Check for default admin credentials first (fallback for connection issues)
    if (
      normalizedUsername === DEFAULT_ADMIN_USERNAME &&
      password === DEFAULT_ADMIN_PASSWORD
    ) {
      console.log("Using fallback admin authentication");

      const session = await createSessionForUser({
        _id: new ObjectId(),
        username: DEFAULT_ADMIN_USERNAME,
        role: DEFAULT_ADMIN_ROLE,
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
    }

    let client, db, users;
    try {
      console.log("🔌 Attempting database connection...");
      client = await clientPromise;
      db = client.db(DEFAULT_DB_NAME);
      users = db.collection<UserDocument>("users");
      console.log("✅ Database connection successful");
    } catch (dbError) {
      console.error("❌ Database connection error:", dbError);
      // Fallback to default admin if DB is unreachable
      if (
        normalizedUsername === DEFAULT_ADMIN_USERNAME &&
        password === DEFAULT_ADMIN_PASSWORD
      ) {
        const session = await createSessionForUser({
          _id: new ObjectId(),
          username: DEFAULT_ADMIN_USERNAME,
          role: DEFAULT_ADMIN_ROLE,
        });

        const response = NextResponse.json({
          message: "Login berhasil (offline mode).",
        });
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
      }

      return NextResponse.json(
        {
          error:
            "Database tidak tersedia. Gunakan akun admin untuk akses darurat.",
        },
        { status: 503 }
      );
    }

    console.log("🔍 Looking up user in database...");
    let user = await users.findOne({ username: normalizedUsername });
    console.log("👤 User found in DB:", user ? "Yes" : "No");
    if (user) {
      console.log("👤 User details:", { 
        id: user._id?.toString(), 
        username: user.username, 
        role: user.role,
        hasPasswordHash: !!user.passwordHash 
      });
    }

    if (!user && normalizedUsername === DEFAULT_ADMIN_USERNAME) {
      console.log("🔧 Admin user not found, checking default password...");
      if (password !== DEFAULT_ADMIN_PASSWORD) {
        console.log("❌ Default admin password mismatch");
        return NextResponse.json(
          { error: "Username atau password salah." },
          { status: 401 }
        );
      }
      console.log("✅ Default admin password correct, creating user...");

      const timestamp = new Date();
      console.log("🔐 Hashing default admin password...");
      console.log("Password to hash:", DEFAULT_ADMIN_PASSWORD);
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
      console.log("🔐 Generated hash:", passwordHash);
      console.log("🔐 Hash length:", passwordHash.length);
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

      user =
        upserted.value ??
        (await users.findOne({ username: DEFAULT_ADMIN_USERNAME }));
    }

    if (!user?.passwordHash) {
      console.log("❌ User has no password hash");
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    if (typeof user.passwordHash !== "string" || !user.passwordHash.length) {
      console.log("❌ Invalid password hash format");
      console.warn(
        "User password hash is invalid for username",
        normalizedUsername
      );
      return NextResponse.json(
        { error: "Akun tidak memiliki password yang valid." },
        { status: 401 }
      );
    }

    console.log("🔐 Comparing passwords...");
    console.log("Provided password:", password);
    console.log("Stored hash:", user.passwordHash);
    console.log("Hash length:", user.passwordHash.length);
    console.log("Hash starts with $2b:", user.passwordHash.startsWith('$2b$'));
    
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    console.log("🔐 Password comparison result:", passwordMatch);
    
    if (!passwordMatch) {
      console.log("❌ Password verification failed");
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    console.log("✅ Password verified successfully");

    if (!user._id) {
      return NextResponse.json(
        { error: "User profile is incomplete." },
        { status: 500 }
      );
    }

    const session = await createSessionForUser({
      _id: user._id,
      username: user.username ?? normalizedUsername,
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
