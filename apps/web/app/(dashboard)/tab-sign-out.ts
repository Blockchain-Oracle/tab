type LogoutResponse = {
  ok: boolean;
};

export async function signOutOfTab(
  requestLogout: () => Promise<LogoutResponse>,
  navigate: (path: string) => void,
) {
  const response = await requestLogout();

  if (!response.ok) throw new Error("Server logout failed");
  navigate("/login");
}
