import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const PORT = 3000;

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // 1. Gemini AI Spelling Correction & Query Normalization Route (Section 5 of Master Prompt)
  app.post("/api/gemini/spellcheck", async (req, res) => {
    const { query, catalogTitles } = req.body as {
      query?: string;
      catalogTitles?: string[];
    };

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Query string is required." });
      return;
    }

    try {
      const ai = getGenAIClient();
      const catalogHint = Array.isArray(catalogTitles) && catalogTitles.length > 0
        ? `Known repository titles include: ${catalogTitles.join(", ")}.`
        : "";

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Correct spelling mistakes and extract the target audio language (if any) from this Telegram movie/series/anime search query: "${query}". ${catalogHint}`,
        config: {
          systemInstruction:
            "You are an AI query spell-checker for a multi-language Indian & international Telegram Auto-Filter Bot (Movies, Web Series, Anime). " +
            "Identify the intended movie, web series, or anime title even if heavily misspelled (e.g. 'Kallki 2898 hin' -> title 'Kalki 2898 AD', language 'Hindi'; 'Mirzapurr s3' -> title 'Mirzapur', season 3; 'Solo Levelling' -> 'Solo Leveling'). " +
            "Supported languages: Hindi, Tamil, Telugu, Malayalam, Bengali, Marathi, Kannada, English, Japanese. " +
            "Strip out language words, season/episode tags, or resolution tags from correctedTitle so it cleanly matches the canonical media title.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              correctedTitle: {
                type: Type.STRING,
                description: "The canonical, spell-corrected movie, web series, or anime title without language or resolution tags.",
              },
              detectedLanguage: {
                type: Type.STRING,
                description: "Detected audio language (Hindi, Tamil, Telugu, Malayalam, Bengali, Marathi, Kannada, English, Japanese) or empty string if none specified.",
              },
              detectedSeason: {
                type: Type.INTEGER,
                description: "Detected season number if specified, or 0 if none.",
              },
              detectedEpisode: {
                type: Type.INTEGER,
                description: "Detected episode number if specified, or 0 if none.",
              },
              wasCorrected: {
                type: Type.BOOLEAN,
                description: "True if a typo or spelling error in the title was fixed.",
              },
              explanation: {
                type: Type.STRING,
                description: "Concise 1-line note explaining the correction made.",
              },
            },
            required: [
              "correctedTitle",
              "detectedLanguage",
              "detectedSeason",
              "detectedEpisode",
              "wasCorrected",
              "explanation",
            ],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : "Gemini spellcheck request failed";
      console.error("Gemini API error:", errMessage);
      res.status(500).json({
        error: errMessage,
      });
    }
  });

  // 2. Serve Root-Level Python Deployment Package Files for Inspection & Export
  app.get("/api/source-files", async (_req, res) => {
    try {
      const rootDir = process.cwd();
      const [mainPy, requirementsTxt, renderYaml, envExample] = await Promise.all([
        fs.readFile(path.join(rootDir, "main.py"), "utf-8").catch(() => ""),
        fs.readFile(path.join(rootDir, "requirements.txt"), "utf-8").catch(() => ""),
        fs.readFile(path.join(rootDir, "render.yaml"), "utf-8").catch(() => ""),
        fs.readFile(path.join(rootDir, ".env.example"), "utf-8").catch(() => ""),
      ]);
      res.json({
        "main.py": mainPy,
        "requirements.txt": requirementsTxt,
        "render.yaml": renderYaml,
        ".env.example": envExample,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to load source files";
      res.status(500).json({ error: msg });
    }
  });

  // Mount Vite middleware in development or static dist in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
