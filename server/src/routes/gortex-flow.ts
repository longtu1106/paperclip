import { Router } from "express";
import type { Request } from "express";
import { forbidden } from "../errors.js";
import { gortexFlowService } from "../services/gortex-flow.js";

export function assertLocalFlowAccess(req: Request, deploymentMode: string) {
  const address = req.socket.remoteAddress;
  if (
    deploymentMode !== "local_trusted" ||
    req.actor.type !== "board" ||
    req.actor.source !== "local_implicit" ||
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "")
  ) {
    throw forbidden("Gortex Flow is available only to the local device board");
  }
}

export function gortexFlowRoutes(deploymentMode: string) {
  const router = Router();
  const service = gortexFlowService();
  router.get("/local/gortex-flow", async (req, res) => {
    assertLocalFlowAccess(req, deploymentMode);
    res.set("Cache-Control", "no-store");
    res.json(await service.snapshot());
  });
  return router;
}
