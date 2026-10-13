const ALLOWED_ORIGIN = "https://isaacalvarez2101-lab.github.io";
const MODEL = "gemini-2.5-flash";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return Response.json({ error: "Origen no autorizado." }, { status: 403, headers: cors });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Usa POST para conversar con Luna." }, { status: 405, headers: cors });
    }
    if (!env.GEMINI_API_KEY) {
      return Response.json({ error: "Falta configurar el secreto GEMINI_API_KEY en Cloudflare." }, { status: 503, headers: cors });
    }

    try {
      const body = await request.json();
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
      if (!message || message.length > 4000) {
        return Response.json({ error: "Escribe un mensaje de hasta 4000 caracteres." }, { status: 400, headers: cors });
      }

      const contents = [];
      for (const item of history) {
        if (!item || !["user", "model"].includes(item.role) || typeof item.text !== "string") continue;
        contents.push({ role: item.role, parts: [{ text: item.text.slice(0, 4000) }] });
      }
      contents.push({ role: "user", parts: [{ text: message }] });

      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: "Eres Luna, una asistente personal amable, clara y práctica. Responde en español salvo que te pidan otro idioma. No afirmes haber realizado acciones externas que no has realizado. Si no sabes algo, dilo con honestidad." }]
            },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
          }),
        }
      );

      const data = await upstream.json();
      if (!upstream.ok) {
        return Response.json(
          { error: "El servicio de IA no pudo responder. Revisa el estado de la API y sus límites." },
          { status: upstream.status === 429 ? 429 : 502, headers: cors }
        );
      }
      const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
      if (!answer) {
        return Response.json({ error: "La IA devolvió una respuesta vacía. Inténtalo otra vez." }, { status: 502, headers: cors });
      }
      return Response.json({ reply: answer }, { headers: cors });
    } catch {
      return Response.json({ error: "No pude procesar la petición. Comprueba tu conexión e inténtalo otra vez." }, { status: 400, headers: cors });
    }
  },
};
