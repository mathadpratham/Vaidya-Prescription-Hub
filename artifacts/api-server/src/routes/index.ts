import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sarvamRouter from "./sarvam";
import parsePrescriptionRouter from "./parsePrescription";
import parseClinicalRouter from "./parseClinical";
import patientsRouter from "./patients";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(sarvamRouter);
router.use(parsePrescriptionRouter);
router.use(parseClinicalRouter);
router.use(patientsRouter);

export default router;
