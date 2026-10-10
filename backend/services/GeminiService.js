const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_PLAN_LENGTH = 18_000;

export class GeminiServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'GeminiServiceError';
    this.status = status;
  }
}

export class GeminiService {
  static get apiKey() {
    return String(process.env.GEMINI_API_KEY || '').trim();
  }

  static get model() {
    return String(process.env.GEMINI_MODEL || 'gemini-flash-latest').trim();
  }

  static async reviewLessonPlan(planText) {
    const normalizedPlan = String(planText || '').trim();
    if (!normalizedPlan) throw new GeminiServiceError('Generate a lesson plan before requesting an AI review.', 400);
    if (normalizedPlan.length > MAX_PLAN_LENGTH) throw new GeminiServiceError('This lesson plan is too large for an AI review.', 400);
    if (!this.apiKey) throw new GeminiServiceError('AI is not configured. Add GEMINI_API_KEY to the server environment.', 503);

    let response;
    try {
      response = await fetch(`${GEMINI_API_ROOT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'You are Wiz IA, a concise pedagogical assistant for English-language teachers. Review only the provided class plan. Reply in Brazilian Portuguese. Respect the supplied book, lesson numbers, schedule and learning objectives; do not invent a different teaching methodology. Never expose or speculate about personal data. Use short Markdown sections exactly titled: Pontos fortes, Ajustes sugeridos, Atividade extra, Materiais. Keep the response practical and under 500 words.'
            }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: `Revise este planejamento de aula:\n\n${normalizedPlan}` }]
          }],
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 900
          }
        })
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new GeminiServiceError(
        timedOut
          ? 'The AI service took too long to respond. Please try again.'
          : 'Could not reach the AI service. Try again in a moment.',
        503
      );
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(payload?.error?.message || 'The AI service rejected this request.');
      const safeMessage = response.status === 401 || response.status === 403
        ? 'The server AI key is invalid or unavailable.'
        : response.status === 429
          ? 'AI request limit reached. Please try again shortly.'
          : `AI review could not be generated: ${detail}`;
      throw new GeminiServiceError(safeMessage, response.status === 429 ? 429 : 502);
    }

    const text = (payload?.candidates?.[0]?.content?.parts || [])
      .map((part) => String(part?.text || ''))
      .join('\n')
      .trim();
    if (!text) throw new GeminiServiceError('The AI did not return a review. Please try again.', 502);
    return { text, model: this.model };
  }
}

export default GeminiService;
