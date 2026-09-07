import { Router } from "express";
import { globalSearch } from "../services/searchService";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

// ============================================================
// GET /api/search?q= - Global Search across all entities
// ============================================================
router.get("/", authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    if (!q.trim()) {
      return res.json({
        tickets: [],
        tasks: [],
        employees: [],
        clients: [],
      });
    }

    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    const userId = user?.id || "";

    const results = await globalSearch(q, role, userId);
    res.json(results);
  } catch (err) {
    console.error("Failed to run global search:", err);
    res.status(500).json({ success: false, message: "Failed to run global search." });
  }
});

export default router;
