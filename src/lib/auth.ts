import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { identities } from '@/db/schema';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),

    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const rows = await db
          .select()
          .from(identities)
          .where(eq(identities.email, email))
          .limit(1);

        if (!rows.length || !rows[0].passwordHash) return null;

        const valid = await bcrypt.compare(password, rows[0].passwordHash);
        if (!valid) return null;

        return { id: rows[0].id, name: rows[0].displayName, email: rows[0].email ?? '' };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // On Google OAuth sign-in, upsert identity in our database
      if (account?.provider === 'google' && user.email) {
        const existing = await db
          .select({ id: identities.id })
          .from(identities)
          .where(eq(identities.email, user.email))
          .limit(1);

        if (!existing.length) {
          const inserted = await db
            .insert(identities)
            .values({
              type: 'learner',
              displayName: user.name ?? user.email,
              email: user.email,
            })
            .returning({ id: identities.id });
          user.id = inserted[0].id;
        } else {
          user.id = existing[0].id;
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      // Attach our internal identity ID to the JWT on first sign-in
      if (user?.id) token.identityId = user.id;
      return token;
    },

    async session({ session, token }) {
      // Expose identityId to client session — used for all DB queries
      if (token.identityId) {
        (session.user as typeof session.user & { identityId: string }).identityId =
          token.identityId as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
  },

  session: { strategy: 'jwt' },
});
