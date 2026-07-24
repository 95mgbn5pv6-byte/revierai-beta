const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-RevierAI-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

function isAuthorized(request, env) {
  const required = String(env.REVIERAI_CLIENT_TOKEN || '').trim();
  if (!required) return true;
  return request.headers.get('X-RevierAI-Token') === required;
}

const AGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'species',
    'sex',
    'age_label',
    'confidence',
    'visible_features',
    'trophy_assessment',
    'health_observations',
    'image_quality',
    'limitations',
    'requires_human_review'
  ],
  properties: {
    species: { type: 'string', enum: ['Rehwild', 'Rotwild', 'Gamswild', 'unbekannt'] },
    sex: { type: 'string', enum: ['männlich', 'weiblich', 'Jungtier', 'unbestimmt'] },
    age_label: { type: 'string' },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    visible_features: { type: 'array', items: { type: 'string' } },
    trophy_assessment: { type: 'string' },
    health_observations: { type: 'string' },
    image_quality: { type: 'string', enum: ['gut', 'mittel', 'schlecht'] },
    limitations: { type: 'array', items: { type: 'string' } },
    requires_human_review: { type: 'boolean' }
  }
};

function buildPrompt(speciesHint, sexHint) {
  return `Du bist ein vorsichtiger jagdlicher Bildanalyse-Assistent für Rehwild, Rotwild und Gamswild in Österreich.
Analysiere ausschließlich sichtbare Merkmale im Foto. Schätze Wildart, Geschlecht und Alter nur als Bereich.

Hinweise des Nutzers:
- vermutete Wildart: ${speciesHint || 'unbekannt'}
- vermutetes Geschlecht: ${sexHint || 'unbekannt'}

Regeln:
1. Gib niemals ein scheinbar exaktes Alter aus, wenn das Bild nur einen groben Bereich erlaubt.
2. Senke die confidence deutlich bei ungünstiger Perspektive, großer Entfernung, Unschärfe, Verdeckung, Sommer-/Winterhaarwechsel oder fehlendem Körperbild.
3. Bei Rehwild und Rotwild sind Körperbau, Träger/Hals, Hauptform, Rückenlinie, Brusttiefe, Verhalten und sichtbare Geweihmerkmale nur Indizien.
4. Bei lebendem Gamswild ist eine genaue Altersbestimmung aus Distanz häufig nicht möglich; Kruckenringe sind nur bei ausreichend naher, scharfer Seitenansicht belastbar.
5. Schmuckringe, Perspektivverzerrung und Geweih-/Kruckenvariabilität ausdrücklich als Grenze nennen, falls relevant.
6. Gesundheitsangaben nur als sichtbare Auffälligkeiten formulieren, keine Diagnose.
7. Keine Abschussempfehlung geben.
8. Das Ergebnis muss von einem erfahrenen Jäger bestätigt werden.

Formuliere age_label beispielsweise als „etwa 3–5 Jahre“, „Jungtier, wahrscheinlich unter 1 Jahr“ oder „aus diesem Foto nicht belastbar bestimmbar“.
Die sichtbaren Merkmale und Grenzen sollen kurz, konkret und auf Deutsch sein.`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'RevierAI AI',
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
        tokenProtection: Boolean(env.REVIERAI_CLIENT_TOKEN)
      });
    }

    if (url.pathname !== '/analyze-age' || request.method !== 'POST') {
      return json({ error: 'Not found' }, 404);
    }

    if (!isAuthorized(request, env)) return json({ error: 'Ungültiger Beta-Zugangscode.' }, 401);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY ist am Server nicht eingerichtet.' }, 503);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Ungültige JSON-Anfrage.' }, 400);
    }

    const imageDataUrl = String(body?.imageDataUrl || '');
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
      return json({ error: 'Es wurde kein unterstütztes Bild übertragen.' }, 400);
    }
    if (imageDataUrl.length > 9_000_000) {
      return json({ error: 'Das Bild ist zu groß. Bitte eine kleinere Aufnahme verwenden.' }, 413);
    }

    const requestBody = {
      model: env.OPENAI_MODEL || 'gpt-5-mini',
      store: false,
      max_output_tokens: 1400,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: buildPrompt(body.speciesHint, body.sexHint) },
            { type: 'input_image', image_url: imageDataUrl, detail: 'high' }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'wild_age_analysis',
          description: 'Vorsichtige jagdliche Bildanalyse mit Altersbereich und Unsicherheit.',
          strict: true,
          schema: AGE_SCHEMA
        }
      }
    };

    let openaiResponse;
    try {
      openaiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (error) {
      return json({ error: `OpenAI konnte nicht erreicht werden: ${error.message}` }, 502);
    }

    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      console.error('OpenAI error', openaiResponse.status, payload);
      return json({ error: payload?.error?.message || `OpenAI-Fehler ${openaiResponse.status}` }, 502);
    }

    const outputText = extractOutputText(payload);
    if (!outputText) return json({ error: 'Die KI hat kein auswertbares Ergebnis geliefert.' }, 502);

    let analysis;
    try {
      analysis = JSON.parse(outputText);
    } catch (error) {
      console.error('JSON parse error', error, outputText);
      return json({ error: 'Das KI-Ergebnis konnte nicht gelesen werden.' }, 502);
    }

    return json({
      analysis,
      model: env.OPENAI_MODEL || 'gpt-5-mini',
      generatedAt: new Date().toISOString()
    });
  }
};
