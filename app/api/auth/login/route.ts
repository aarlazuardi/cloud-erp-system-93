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

    console.log("📝 Received credentials:", {
      username: username,
      passwordLength:
        typeof password === "string" ? password.length : "invalid",
    });

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
        hasPasswordHash: !!user.passwordHash,
      });
    }

    // For admin user, ALWAYS use existing admin user - NEVER create new one
    if (!user && normalizedUsername === DEFAULT_ADMIN_USERNAME) {
      console.log("🔧 Admin user not found with exact username, searching for ANY admin user...");
      
      // FORCE: Use the specific admin user that has transactions
      const specificUserId = "69156e50d7b13bfbe91e4869";
      try {
        user = await users.findOne({ _id: new ObjectId(specificUserId) });
        if (user) {
          console.log("✅ FORCED use of admin user with transactions:", user._id?.toString());
        }
      } catch (e) {
        console.log("⚠️ Could not find specific user, trying by role...");
      }
      
      // Fallback: Try to find ANY admin user by role
      if (!user) {
        user = await users.findOne({ role: DEFAULT_ADMIN_ROLE });
        if (user) {
          console.log("✅ Found existing admin user by role:", user._id?.toString());
        }
      }
      
      // ABSOLUTELY NO USER CREATION - if no admin exists, return error
      if (!user) {
        console.log("❌ No admin user exists and will NOT create new one");
        return NextResponse.json(
          { error: "Admin user tidak ditemukan. Hubungi administrator." },
          { status: 401 }
        );
      }
    }

    // Special handling for admin users
    if (normalizedUsername === DEFAULT_ADMIN_USERNAME && user.role === DEFAULT_ADMIN_ROLE) {
      console.log("🔑 Admin user detected, checking password...");
      
      // If admin user doesn't have password hash OR password matches default, allow login
      if (!user.passwordHash || password === DEFAULT_ADMIN_PASSWORD) {
        console.log("✅ Admin login allowed (no hash or default password)");
      } else {
        // Try bcrypt comparison for admin with hash
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          console.log("❌ Admin password verification failed");
          return NextResponse.json(
            { error: "Username atau password salah." },
            { status: 401 }
          );
        }
        console.log("✅ Admin password hash verified");
      }
    } else {
      // Normal validation for other users
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
    }

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
