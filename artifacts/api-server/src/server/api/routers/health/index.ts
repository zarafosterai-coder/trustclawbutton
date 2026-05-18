import { router } from "~/server/api/trpc";
import { ping } from "./ping";
import { firstTime } from "./first-time";

export const healthRouter = router({
  ping,
  firstTime,
});
