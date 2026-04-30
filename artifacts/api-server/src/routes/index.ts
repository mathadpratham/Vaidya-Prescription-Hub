import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sarvamRouter from "./sarvam";
import parsePrescriptionRouter from "./parsePrescription";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sarvamRouter);
router.use(parsePrescriptionRouter);

export default router;
