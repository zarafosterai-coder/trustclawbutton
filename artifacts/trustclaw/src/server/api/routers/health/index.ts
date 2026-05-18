import { router } from "~/server/api/trpc";
import { publicProcedure } from "~/server/api/trpc";
import { ping } from "./ping";

const firstTime = publicProcedure.query(() => ({ isFirstTime: false }));

export const healthRouter = router({
  ping,
  firstTime,
});
