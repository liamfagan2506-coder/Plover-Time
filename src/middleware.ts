import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Send signed-out visitors to the login page. Role checks happen in each page.
export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip the login page, the calendar feed (secured by its own link token) and static files
  matcher: ["/((?!login|calendar/|_next/static|_next/image|.*\..*).*)"],
};
