import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/login/route";
import { createSession } from "@/lib/auth/session";
import { getDepartment, getUserWithProfile, login } from "@/lib/api/timetrack-client";

vi.mock("@/lib/auth/session", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/api/timetrack-client", () => ({
  login: vi.fn(),
  getUserWithProfile: vi.fn(),
  getDepartment: vi.fn(),
}));

describe("login route", () => {
  it("creates a session after credential and profile lookups", async () => {
    vi.mocked(login).mockResolvedValue({
      success: true,
      data: { access_token: "token", user: { id: 1, email: "ada@example.com" } },
    });
    vi.mocked(getUserWithProfile).mockResolvedValue({
      data: {
        profile: {
          id: 1,
          uuid: "employee-1",
          nik: "L-386",
          full_name: "Ada Lovelace",
          name: "Ada",
          nickname: "Ada",
          position: "Planner",
          dept_id: 1,
          photo: "",
        },
      },
    });
    vi.mocked(getDepartment).mockResolvedValue({
      data: { id: 1, department_name: "Business Consulting" },
    });

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "ada@example.com", password: "secret" }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { employee: { uuid: "employee-1" } },
    });
    expect(createSession).toHaveBeenCalledOnce();
  });
});
