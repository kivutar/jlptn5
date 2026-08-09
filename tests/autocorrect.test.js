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
  { id: "te-kara", pattern: "～てから", meaning: "After doing one action." },
  { id: "verb-masu", pattern: "～ます", meaning: "Polite non-past verb." }
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
  assert.deepEqual(body.reasoning, { effort: "minimal" });
  assert.equal(body.store, false);
  assert.equal(body.service_tier, "default");
  assert.equal(body.max_output_tokens, 100);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.properties.outcomes.minItems, grammarPoints.length);
  assert.equal(body.text.format.schema.properties.outcomes.maxItems, grammarPoints.length);
  assert.equal(input.answer.length, maximumAnswerLength);
  assert.equal(input.grammar.length, grammarPoints.length);
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
          return { status: "incomplete", output: [] };
        }
      })
    }),
    /incomplete grammar assessment/
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
