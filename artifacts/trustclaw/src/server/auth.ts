import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

export const auth = betterAuth({
  secret: "",
  plugins: [username()],
  emailAndPassword: { enabled: true },
});

export type Session = typeof auth.$Infer.Session;
