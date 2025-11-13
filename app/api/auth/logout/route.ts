import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { deleteSession } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

    if (token) {
      await deleteSession(token);
    }

    const response = NextResponse.json({ message: "Logged out." });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Logout error", error);
    return NextResponse.json({ error: "Failed to logout." }, { status: 500 });
  }
}
