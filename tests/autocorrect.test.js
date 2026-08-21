import assert from "node:assert/strict";
import test from "node:test";

await import("../autocorrect.js");

const { assessGrammarPoints, endpoint, maximumAnswerLength, model } =
  globalThis.JlptN5AutoCorrect;
const lesson = {
  text: "毎朝、コーヒーを飲んでから仕事に行きます。",
  solution: "Every morning, I go to work after drinking coffee."
};
const grammarPoints = [
  {
    id: "te-kara",
    kind: "pattern",
    pattern: "～てから",
    meaning: "After doing one action."
  },
  {
    id: "verb-masu",
    kind: "form",
    pattern: "～ます",
    meaning: "Polite non-past verb."
  }
];

function createCompletedResponse(outcomes) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        status: "completed",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({ outcomes })
          }]
        }]
      };
    }
  };
}

test("blank and reference answers are classified locally without API cost", async () => {
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return createCompletedResponse([]);
  };

  assert.deepEqual(await assessGrammarPoints({
    apiKey: "test-key",
    lesson,
    grammarPoints,
    userAnswer: "   ",
    fetchImpl
  }), [
    { grammarPointId: "te-kara", outcome: "again" },
    { grammarPointId: "verb-masu", outcome: "again" }
  ]);
  assert.deepEqual(await assessGrammarPoints({
    apiKey: "test-key",
    lesson,
    grammarPoints,
    userAnswer: "every morning, i go to work after drinking coffee",
    fetchImpl
  }), [
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "verb-masu", outcome: "good" }
  ]);
  assert.equal(requestCount, 0);
});

test("Japanese reference answers are classified locally in production exercises", async () => {
  let requestCount = 0;
  const productionLesson = {
    text: "After doing my homework, I play with my friend.",
    solution: "宿題をしてから、友達と遊びます。",
    type: "production"
  };
  const ratings = await assessGrammarPoints({
    apiKey: "test-key",
    lesson: productionLesson,
    grammarPoints,
    userAnswer: " 宿題をしてから、友達と遊びます ",
    fetchImpl: async () => {
      requestCount += 1;
      return createCompletedResponse([]);
    }
  });

  assert.deepEqual(ratings, [
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "verb-masu", outcome: "good" }
  ]);
  assert.equal(requestCount, 0);
});

test("production requests send the English prompt and Japanese reference", async () => {
  let requestBody;
  const productionLesson = {
    text: "After doing my homework, I play with my friend.",
    solution: "宿題をしてから、友達と遊びます。",
    type: "production"
  };

  await assessGrammarPoints({
    apiKey: "test-key",
    lesson: productionLesson,
    grammarPoints,
    userAnswer: "宿題の後で友達と遊びます。",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return createCompletedResponse(["good", "good"]);
    }
  });

  const input = JSON.parse(requestBody.input);

  assert.match(requestBody.instructions, /Japanese translation of a prompt written in English/);
  assert.match(requestBody.instructions, /example answer is one valid wording/);
  assert.match(requestBody.instructions, /smallest attempted span/);
  assert.match(requestBody.instructions, /For particles, grade the marker and marked phrase/);
  assert.match(requestBody.instructions, /Do not require an adjacent particle/);
  assert.match(requestBody.instructions, /For connectors, grade the intended relation/);
  assert.match(requestBody.instructions, /For verb patterns, require the target construction/);
  assert.equal(input.sentence, productionLesson.text);
  assert.equal(input.exampleAnswer, productionLesson.solution);
  assert.equal(input.reference, undefined);
});

test("French recognition requests identify the learner language and accept missing accents", async () => {
  let requestCount = 0;
  const frenchLesson = {
    text: "図書館で本を読みます。",
    solution: "Je lis un livre à la bibliothèque.",
    referenceTranslations: {
      en: "I read a book at the library.",
      fr: "Je lis un livre à la bibliothèque."
    }
  };

  const localRatings = await assessGrammarPoints({
    apiKey: "test-key",
    lesson: frenchLesson,
    grammarPoints,
    userAnswer: "je lis un livre a la bibliotheque",
    locale: "fr",
    acceptedLocales: ["fr", "en"],
    fetchImpl: async () => {
      requestCount += 1;
      return createCompletedResponse([]);
    }
  });

  assert.equal(requestCount, 0);
  assert.equal(localRatings.every(({ outcome }) => outcome === "good"), true);

  const englishRatings = await assessGrammarPoints({
    apiKey: "test-key",
    lesson: frenchLesson,
    grammarPoints,
    userAnswer: "I read a book at the library.",
    locale: "fr",
    acceptedLocales: ["fr", "en"],
    fetchImpl: async () => {
      requestCount += 1;
      return createCompletedResponse([]);
    }
  });

  assert.equal(requestCount, 0);
  assert.equal(englishRatings.every(({ outcome }) => outcome === "good"), true);

  let requestBody;
  await assessGrammarPoints({
    apiKey: "test-key",
    lesson: frenchLesson,
    grammarPoints,
    userAnswer: "Je consulte un ouvrage dans la bibliothèque.",
    locale: "fr",
    acceptedLocales: ["fr", "en"],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return createCompletedResponse(["good", "good"]);
    }
  });

  const input = JSON.parse(requestBody.input);
  assert.equal(input.learnerLanguage, "French");
  assert.deepEqual(input.acceptedLearnerLocales, ["fr", "en"]);
  assert.deepEqual(input.acceptedLearnerLanguages, ["French", "English"]);
  assert.deepEqual(input.translationExamples, frenchLesson.referenceTranslations);
  assert.match(requestBody.instructions, /French or English/);
});

test("English recognition autocorrect also accepts French answers", async () => {
  let requestBody;

  await assessGrammarPoints({
    apiKey: "test-key",
    lesson,
    grammarPoints,
    userAnswer: "Chaque matin, je vais travailler après avoir bu du café.",
    acceptedLocales: ["en", "fr"],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return createCompletedResponse(["good", "good"]);
    }
  });

  const input = JSON.parse(requestBody.input);

  assert.deepEqual(input.acceptedLearnerLocales, ["en", "fr"]);
  assert.deepEqual(input.acceptedLearnerLanguages, ["English", "French"]);
  assert.match(requestBody.instructions, /English or French/);
});

test("recognition autocorrect accepts any configured learner language", async () => {
  let requestBody;

  await assessGrammarPoints({
    apiKey: "test-key",
    lesson,
    grammarPoints,
    userAnswer: "Cada mañana voy al trabajo después de tomar café.",
    acceptedLocales: ["en", "fr", "es"],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return createCompletedResponse(["good", "good"]);
    }
  });

  const input = JSON.parse(requestBody.input);

  assert.deepEqual(input.acceptedLearnerLocales, ["en", "fr", "es"]);
  assert.deepEqual(input.acceptedLearnerLanguages, ["English", "French", "Spanish"]);
  assert.match(requestBody.instructions, /English, French, or Spanish/);
});

test("one compact structured request evaluates every grammar point", async () => {
  const requests = [];
  const userAnswer = "x".repeat(maximumAnswerLength + 100);
  const fetchImpl = async (...request) => {
    requests.push(request);
    return createCompletedResponse(["good", "again"]);
  };
  const ratings = await assessGrammarPoints({
    apiKey: "  test-key  ",
    lesson,
    grammarPoints,
    userAnswer,
    fetchImpl
  });

  assert.deepEqual(ratings, [
    { grammarPointId: "te-kara", outcome: "good" },
    { grammarPointId: "verb-masu", outcome: "again" }
  ]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], endpoint);
  assert.equal(requests[0][1].method, "POST");
  assert.equal(requests[0][1].headers.Authorization, "Bearer test-key");

  const body = JSON.parse(requests[0][1].body);
  const input = JSON.parse(body.input);

  assert.equal(body.model, model);
  assert.equal(body.reasoning, undefined);
  assert.equal(body.store, false);
  assert.equal(body.service_tier, "default");
  assert.equal(body.max_output_tokens, 100);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.properties.outcomes.minItems, grammarPoints.length);
  assert.equal(body.text.format.schema.properties.outcomes.maxItems, grammarPoints.length);
  assert.equal(input.answer.length, maximumAnswerLength);
  assert.equal(input.grammar.length, grammarPoints.length);
  assert.equal(input.grammar[0].kind, grammarPoints[0].kind);
  assert.equal(input.grammar[0].id, undefined);
});

test("invalid and incomplete model output falls back through an error", async () => {
  await assert.rejects(
    assessGrammarPoints({
      apiKey: "test-key",
      lesson,
      grammarPoints,
      userAnswer: "A different answer",
      fetchImpl: async () => createCompletedResponse(["good"])
    }),
    /invalid grammar assessment/
  );

  await assert.rejects(
    assessGrammarPoints({
      apiKey: "test-key",
      lesson,
      grammarPoints,
      userAnswer: "A different answer",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: []
          };
        }
      })
    }),
    (error) => {
      assert.equal(error.code, "max_output_tokens");
      assert.match(error.message, /token limit/);
      return true;
    }
  );
});

test("authentication errors retain their status without exposing the key", async () => {
  await assert.rejects(
    assessGrammarPoints({
      apiKey: "secret-test-key",
      lesson,
      grammarPoints,
      userAnswer: "A different answer",
      fetchImpl: async () => ({ ok: false, status: 401 })
    }),
    (error) => {
      assert.equal(error.status, 401);
      assert.match(error.message, /rejected the API key/);
      assert.doesNotMatch(error.message, /secret-test-key/);
      return true;
    }
  );
});
