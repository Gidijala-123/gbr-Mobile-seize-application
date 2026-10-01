require("dotenv").config();
const { MongoClient } = require("mongodb");
const { sanitizeMongoUri } = require("../utils/db");

function collectStages(value, stages = []) {
  if (!value || typeof value !== "object") return stages;
  if (typeof value.stage === "string") stages.push(value.stage);
  for (const child of Object.values(value)) collectStages(child, stages);
  return stages;
}

async function main() {
  const uri = sanitizeMongoUri(process.env.MONGODB_URI);
  if (!uri) throw new Error("MONGODB_URI must be configured.");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const database = client.db();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ensureIndexes = process.argv.includes("--ensure-indexes");
    const checks = [
      {
        label: "visitors email/time",
        collection: "visitors_of_page",
        filter: { email: "__index_validation__", time: { $gte: cutoff } },
        sort: { time: -1 },
        hint: { email: 1, time: -1 },
      },
      {
        label: "visitors time",
        collection: "visitors_of_page",
        filter: { time: { $gte: cutoff } },
        sort: { time: -1 },
        hint: { time: -1 },
      },
      {
        label: "visitors name",
        collection: "visitors_of_page",
        filter: { name: "__index_validation__" },
        sort: {},
        hint: { name: 1 },
      },
      {
        label: "error reports time",
        collection: "error_reports",
        filter: { time: { $gte: cutoff } },
        sort: { time: -1 },
        hint: { time: 1 },
      },
      {
        label: "error reports type",
        collection: "error_reports",
        filter: { type: "__index_validation__" },
        sort: {},
        hint: { type: 1 },
      },
      {
        label: "error reports email/time",
        collection: "error_reports",
        filter: { email: "__index_validation__", time: { $gte: cutoff } },
        sort: { time: -1 },
        hint: { email: 1, time: -1 },
      },
    ];

    if (ensureIndexes) {
      await Promise.all(
        checks.map((check) =>
          database.collection(check.collection).createIndex(check.hint),
        ),
      );
    }

    const results = await Promise.all(
      checks.map(async (check) => {
        const plan = await database
          .collection(check.collection)
          .find(check.filter)
          .sort(check.sort)
          .hint(check.hint)
          .explain("executionStats");
        const stages = collectStages(plan.queryPlanner.winningPlan);
        return {
          label: check.label,
          collectionScans: stages.filter((stage) => stage === "COLLSCAN").length,
          indexScans: stages.filter((stage) => stage === "IXSCAN").length,
        };
      }),
    );

    for (const result of results)
      console.log(
        `${result.label}: IXSCAN=${result.indexScans}, COLLSCAN=${result.collectionScans}`,
      );
    if (results.some((result) => result.collectionScans > 0))
      throw new Error("At least one audit query plan used a collection scan.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Audit index explain failed:", error.message);
  process.exitCode = 1;
});