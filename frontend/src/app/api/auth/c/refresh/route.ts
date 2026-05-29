import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiPaths, getApiUrl } from "@/lib/config";

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("c_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: "No refresh token available" },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(getApiUrl(apiPaths.cAuth.refresh), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        cookieStore.delete("c_access_token");
        cookieStore.delete("c_refresh_token");
      }

      return NextResponse.json(
        { error: "Token refresh failed" },
        { status: response.status }
      );
    }

    const data: RefreshResponse = await response.json();

    cookieStore.set("c_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in || 36000,
      sameSite: "lax",
    });

    cookieStore.set("c_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });

    return NextResponse.json({
      success: true,
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
