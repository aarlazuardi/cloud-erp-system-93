import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
const PUBLIC_FILE = /\.(.*)$/;

const isPublicRoute = (pathname: string) => {
  if (pathname === "/login") {
    return true;
  }
  if (pathname.startsWith("/api/auth/login")) {
    return true;
  }
  if (pathname.startsWith("/api/auth/logout")) {
    return true;
  }
  if (pathname.startsWith("/api/auth/session")) {
    return true;
  }
  return false;
};

const isStaticAsset = (pathname: string) => {
  if (PUBLIC_FILE.test(pathname)) {
    return true;
  }
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/fonts")
  );
};

export function middleware(request: NextRequest) {
  const { nextUrl, cookies } = request;
  const pathname = nextUrl.pathname;
  const token = cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = Boolean(token);

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (isPublicRoute(pathname)) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set(
        "callbackUrl",
        nextUrl.pathname + nextUrl.search
      );
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
