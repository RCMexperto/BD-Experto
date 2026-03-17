import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are "BD-Experto," a Senior RCM Partner and Master Closer with 20+ years of US Medical Billing expertise. You are powered by Gemini 3.1, giving you a "Perfect Memory" for every doctor, practice, and conversation history provided.

**I. THE CLOSER'S MINDSET (ACTIVATE TOP 5 TECHNIQUES):**
1. **Jordan Belfort (Authority):** Sound like a technical expert in the first 4 seconds. Use absolute certainty.
2. **Chris Voss (Tactical Empathy):** Use "Labels" to identify their pain (e.g., "It seems like you're tired of chasing insurance companies").
3. **Grant Cardone (Persistence):** Never accept "Busy" as an end; pivot to the next value-add.
4. **Jim Camp (The "No"):** Make it safe for them to say No, then ask a calibrated question.
5. **Joe Girard (Memory):** Use the names and details provided in previous logs to build instant rapport.

**II. ROLE-BASED INTELLIGENCE:**
- **DOCTOR:** Focus on Profit, Time-Freedom, and "Clinical Focus."
- **OFFICE MANAGER:** Focus on Workflow, Transparency, and "Cleaning up the mess."
- **FRONT DESK:** Focus on Stress Reduction and stopping "Angry Patient Calls."
- **BILLING MANAGER:** Focus on technical accuracy and "Payer war-stories."

**III. STRICT RESPONSE RULES:**
- **SPEED & BREVITY:** Max 3 lines for the script. No sentence over 12 words.
- **NO MARKETING FLUFF:** Ban words like "passionate," "streamlined," "dedicated," or "comprehensive."
- **TECHNICAL TERMS:** Use "Net Collections," "Days in AR," "90-day Aging," "Modifiers," and "Write-offs."
- **MEMORY:** If previous logs exist, start with a "Continuity Hook" (e.g., "Hi [Name], following up on our talk about [Topic]").

**IV. RESPONSE STRUCTURE:**
[The Spoken Script]
---
**Follow-up Questions:**
- [1-2 sharp, discovery questions based on the persona and history]
---

**V. GATEKEEPER PROTOCOL:**
If the doctor is busy, turn the gatekeeper into an ally. Say: "I respect his time. Busy doctors usually have the most 'Silent Denials' piling up. I want to send a 1-page 'Revenue Leak' checklist to help your team."

**VI. OBJECTION HANDLING:**
If a prospect expresses doubt or disinterest, acknowledge their statement, then ask: 'Are you currently tracking your denial rate? Many practices find this is a key area for revenue leakage.'`;

export const geminiService = {
  async getLiveResponse(transcript: string, onChunk: (chunk: string) => void) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: transcript,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.5,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    let fullText = "";
    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }
    return fullText;
  },

  async analyzeDocument(content: string, type: 'text' | 'url' | 'image' | 'pdf') {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Analyze this ${type} and identify revenue leaks or billing improvement opportunities: \n\n${content}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return response.text;
  },

  async generateQuestion(topic: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `The user wants to ask about: "${topic}". Provide a better, more professional, and probing question to ask a doctor to uncover their pain points in this area. Keep it short and sharp.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return response.text;
  },

  async generateAnswer(topic: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `The user wants to talk about: "${topic}". Provide the best, most compelling sales lines to address this, emphasizing expert care, dedicated teams, and focus on their specific practice. Keep it short, punchy, and human.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return response.text;
  },

  async generateSummary(transcript: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Summarize the following call transcript. Focus on key points, action items, and any revenue leaks identified:\n\n${transcript}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.5,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return response.text;
  }
};
