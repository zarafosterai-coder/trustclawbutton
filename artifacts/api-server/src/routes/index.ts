import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trpcRouter from "./trpc";
import authRouter from "./auth";
import chatRouter from "./chat";
import cronRouter from "./cron";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trpcRouter);
router.use(authRouter);
router.use(chatRouter);
router.use(cronRouter);
router.use(telegramRouter);

export default router;
