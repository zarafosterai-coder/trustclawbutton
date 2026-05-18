import { publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/clients/db";

export const firstTime = publicProcedure.query(async () => {
  try {
    const count = await db.user.count();
    return { isFirstTime: count === 0 };
  } catch {
    return { isFirstTime: true };
  }
});
