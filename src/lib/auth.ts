import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { userService } from "@/services/user.service";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // No adapter: registration inserts users itself, and with the Credentials
  // provider Auth.js never creates database sessions anyway. Sessions use the
  // JWT strategy: an encrypted cookie (via AUTH_SECRET) carries { userId }.
  // (@auth/drizzle-adapter is also incompatible with drizzle-orm 1.0 RC —
  // if OAuth providers are added later, revisit.)
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await userService.verifyCredentials(
          parsed.data.email,
          parsed.data.password,
        );
        if (!user) return null;

        // Whatever is returned here is embedded into the JWT via callbacks below
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    // Runs when the JWT is created (login) or read (every request).
    // On login, `user` is the object returned from authorize().
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    // Shapes what auth() / useSession() return: expose our uuid as user.id.
    session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
  },
});
